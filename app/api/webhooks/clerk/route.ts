// app/api/webhooks/clerk/route.ts
// Clerk webhook handler — D-03 (4 events) + D-03b (idempotency) + D-03c (delete log-only).
//
// ADR-023 ALLOW-LIST ENTRY #1: this file uses RAW `db` from '@/lib/db'.
// The webhook handler is the canonical cross-org caller — it operates as
// the service-role connection-string user (BYPASSRLS) to land
// organizations + users rows from Clerk Dashboard events. This is the
// ONLY file in app/ allowed to import `db` directly per the L-05 gate
// (scripts/check-db-imports.ts in Plan 02-06).
//
// RESEARCH Pitfall 4: read `await req.text()` BEFORE any JSON parse.
// Request bodies are streams — readable once. Calling req.json() first
// consumes the stream and req.text() afterwards returns empty,
// breaking svix signature verification.
//
// SF-W5 (closed 2026-05-20 in 03-G3 T7): clerk_events row is written
// BEFORE dispatch, so a naive 409-return on a prerequisite-missing race
// (e.g. organizationMembership.created arriving before its
// organization.created) would leave the row in place — Clerk's retry
// would then short-circuit on D-03b idempotency and the event would be
// silently lost. Mitigation: deleteIdempotencyRow() is now called before
// every non-2xx return AND from the dispatch-error catch path, so Clerk's
// exponential retry re-fires the handler instead. Phase 7+ may still
// invert idempotency-before-dispatch to a single ordering for cleanliness,
// but the silent-drop race is closed at the application layer.
import { Webhook } from 'svix';
import { clerkClient, type WebhookEvent } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { clerkEvents, organizations, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Mask a Clerk user ID for logging — keeps the last 4 chars for grep-ability
 * while removing the bulk of the identifier from log streams. Clerk user IDs
 * are stable PII-adjacent identifiers; structured-logging redaction (Phase 7+)
 * will replace this with proper one-way hashing.
 */
function maskClerkId(id: string): string {
  if (id.length <= 4) return '***';
  return `user_***${id.slice(-4)}`;
}

/**
 * L-06b (F-02): Mask a Clerk organization ID for logging — mirrors
 * maskClerkId but with the `org_` prefix preserved for grep-ability.
 * Aggregated log streams otherwise expose the full tenant base to
 * anyone with log-indexer access. Structured-log redaction (Phase 7+)
 * will replace this with a redaction filter in pino.
 */
function maskClerkOrgId(id: string): string {
  if (id.length <= 4) return '***';
  return `org_***${id.slice(-4)}`;
}

/**
 * CR-01 (Plan 02-07): Mirror our enum role into Clerk's user publicMetadata.
 *
 * Attempts to update the Clerk user's `publicMetadata.role` to match the given
 * app role. This operation is best-effort: failures are logged and swallowed so
 * the caller's workflow is not interrupted.
 *
 * @param clerkUserId - The Clerk user id to update
 * @param role - The application role to mirror (`'admin' | 'reviewer' | 'employee'`)
 * @param source - Short string indicating the originating event or caller for logging
 */
async function mirrorRoleToClerk(
  clerkUserId: string,
  role: 'admin' | 'reviewer' | 'employee',
  source: string,
): Promise<void> {
  try {
    const client = await clerkClient();
    await client.users.updateUserMetadata(clerkUserId, {
      publicMetadata: { role },
    });
    console.log(
      `[clerk-webhook] publicMetadata.role mirrored user=${maskClerkId(clerkUserId)} role=${role} source=${source}`,
    );
  } catch (err) {
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error(
      `[clerk-webhook] failed to mirror publicMetadata.role user=${maskClerkId(clerkUserId)} role=${role} source=${source}: ${detail}`,
    );
  }
}

/**
 * SF-W5 fix (03-G3 T7): delete the clerk_events idempotency row for a given
 * svix-id so Clerk's exponential retry will re-fire this handler. Called from:
 *
 *   1. Prerequisite-missing 409 paths — race where membership.created arrives
 *      before its organization.created or user.created. Without the delete,
 *      Clerk's retry hits the D-03b idempotency short-circuit and the event
 *      is silently dropped (the original SF-W5 footgun).
 *   2. Dispatch-error catch path (F-01 interim fix) — preserved from the
 *      original inline implementation at the bottom of POST().
 *
 * Wrapped in its own try/catch so a cleanup failure doesn't shadow the
 * original error / 409 / 200 the caller is about to return.
 */
async function deleteIdempotencyRow(svixId: string, reason: string): Promise<void> {
  try {
    await db.delete(clerkEvents).where(eq(clerkEvents.id, svixId));
    console.log(
      `[clerk-webhook] clerk_events row deleted for ${svixId} (${reason}) — Clerk retry can re-fire`,
    );
  } catch (cleanupErr) {
    const cd =
      cleanupErr instanceof Error
        ? `${cleanupErr.name}: ${cleanupErr.message}`
        : String(cleanupErr);
    console.error(
      `[clerk-webhook] failed to delete clerk_events row for ${svixId} (${reason}): ${cd}`,
    );
  }
}

/**
 * Normalize a Clerk organization membership role string to one of the application's roles.
 *
 * Strips an optional `org:` prefix and maps the result to `'admin'`, `'reviewer'`, or `'employee'`.
 *
 * @param value - Role value from a Clerk membership payload
 * @returns `'admin'`, `'reviewer'`, or `'employee'` if `value` maps to a known role, `null` otherwise
 */
function asAppRole(value: unknown): 'admin' | 'reviewer' | 'employee' | null {
  if (typeof value !== 'string') return null;
  const stripped = value.replace(/^org:/, '');
  if (stripped === 'admin' || stripped === 'reviewer' || stripped === 'employee') {
    return stripped;
  }
  return null;
}

/**
 * Receive and process Clerk Dashboard webhooks: verify Svix signature, enforce idempotency, and apply created/updated organization and membership changes to the database while mirroring role metadata back to Clerk.
 *
 * Handles signature verification failures, missing configuration, idempotent duplicate events, four main create/update event types (organization.created, user.created, organizationMembership.created, organizationMembership.updated), and treats delete/unhandled events as log-only. Application-layer dispatch errors are logged and returned as successful responses to avoid Clerk retries.
 *
 * @returns A Response indicating the result:
 * - `200 OK` on successful processing, duplicate event short-circuit, or logged dispatch error
 * - `500` when the webhook secret is not configured
 * - `400` when required Svix headers are missing
 * - `401` when signature verification fails
 * - `409` when referenced organization or user rows are not yet present in the database
 */
export async function POST(req: Request): Promise<Response> {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    // Hard-fail on missing secret — better than accepting unsigned events.
    // Distinguished from a 401 (signature-fail) so the operator can spot
    // misconfiguration in Clerk Dashboard webhook logs (T-05-05).
    console.error('[clerk-webhook] CLERK_WEBHOOK_SECRET not set');
    return new Response('Webhook secret not configured', { status: 500 });
  }

  // RESEARCH Pitfall 4: raw text FIRST, before any JSON parse.
  // The body stream is readable once; req.json() afterwards would consume
  // the stream and req.text() would return empty.
  const payload = await req.text();

  // svix-id is the message ID; svix-timestamp + svix-signature are the
  // signature data. All three required by svix.verify; missing any -> 400
  // (per svix docs / Clerk blog example).
  const svixId = req.headers.get('svix-id');
  const svixTimestamp = req.headers.get('svix-timestamp');
  const svixSignature = req.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response('Missing svix headers', { status: 400 });
  }

  // Verify signature. svix handles timestamp tolerance (5-minute window)
  // AND constant-time signature comparison AND multi-signature parsing
  // for key rotation. Hand-rolling HMAC would get any of these wrong.
  let evt: WebhookEvent;
  try {
    const wh = new Webhook(secret);
    evt = wh.verify(payload, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as WebhookEvent;
  } catch (err) {
    // 401 — signature failed. Log err.name + err.message (svix gives
    // structured errors like WebhookVerificationError). Never log the
    // raw payload (could contain user PII, T-05-04).
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error(`[clerk-webhook] signature verify failed: ${detail}`);
    return new Response('Invalid signature', { status: 401 });
  }

  // D-03b: idempotency via clerk_events. ON CONFLICT DO NOTHING means a
  // retry of the same svix-id is a no-op. Returns [] on conflict,
  // [{ id }] on first insert. Replay defense (T-05-02 layer 2).
  const inserted = await db
    .insert(clerkEvents)
    .values({ id: svixId })
    .onConflictDoNothing()
    .returning({ id: clerkEvents.id });

  if (inserted.length === 0) {
    // Already processed — return 200 so Clerk stops retrying.
    console.log(
      `[clerk-webhook] duplicate event ${svixId} (${evt.type}) — short-circuit 200`,
    );
    return new Response('Already processed', { status: 200 });
  }

  // D-03 — 4 events handled. D-03c — 3 delete events logged + no-op.
  try {
    switch (evt.type) {
      case 'organization.created': {
        const data = evt.data;
        await db.insert(organizations).values({
          clerkOrgId: data.id,
          name: data.name,
          // OrganizationJSON.slug is `string` (non-optional in @clerk/backend
          // 3.4.8 types). Defensive fallback to data.id covers edge-case
          // dashboards that send empty slug strings.
          slug: data.slug || data.id,
          planTier: 'starter',
          stripeSubscriptionStatus: 'trialing',
        });
        console.log(`[clerk-webhook] organization.created ${maskClerkOrgId(data.id)}`);
        break;
      }

      case 'user.created': {
        const data = evt.data;
        // D-03a: org_id may be null at user.created if Clerk hasn't yet
        // fired organizationMembership.created. The schema column is
        // nullable for this window; the CHECK constraint enforces the
        // 5-minute closure window. We DO NOT block on org_id here.
        await db.insert(users).values({
          clerkUserId: data.id,
          role: 'employee', // default; updated by membership.created/updated
          // orgId left undefined -> NULL — membership webhook backfills
        });
        // CR-01 (Plan 02-07) / D-04: mirror the default `employee` role onto
        // publicMetadata so sessionClaims.publicMetadata.role is populated
        // from the very first authenticated request. organizationMembership.*
        // events will overwrite this with the correct org role.
        await mirrorRoleToClerk(data.id, 'employee', 'user.created');
        console.log(
          `[clerk-webhook] user.created ${maskClerkId(data.id)} (org_id pending membership)`,
        );
        break;
      }

      case 'organizationMembership.created': {
        const data = evt.data;
        const clerkUserId = data.public_user_data?.user_id;
        const clerkOrgId = data.organization?.id;
        const roleStr = asAppRole(data.role);
        if (!clerkUserId || !clerkOrgId) {
          console.error(
            '[clerk-webhook] organizationMembership.created missing user_id or organization.id',
            {
              clerkUserId: clerkUserId ? maskClerkId(clerkUserId) : null,
              clerkOrgId: clerkOrgId ? maskClerkOrgId(clerkOrgId) : null,
            },
          );
          break;
        }
        // Look up our internal org_id from the Clerk org id.
        const orgRow = await db
          .select({ id: organizations.id })
          .from(organizations)
          .where(eq(organizations.clerkOrgId, clerkOrgId))
          .limit(1);
        if (orgRow.length === 0) {
          // organization.created hasn't arrived yet — the membership event
          // won the race. SF-W5 fix (03-G3 T7): delete the idempotency row
          // before returning 409 so Clerk's retry re-fires this handler
          // once organization.created lands. 409 still surfaces in Clerk
          // Dashboard so operators can spot persistent races.
          console.error(
            `[clerk-webhook] org ${maskClerkOrgId(clerkOrgId)} not found — organization.created may not have arrived yet; Clerk should retry`,
          );
          await deleteIdempotencyRow(svixId, 'prerequisite missing: org not yet created');
          return new Response('Org not yet created', { status: 409 });
        }
        const firstOrg = orgRow[0];
        if (!firstOrg) {
          // Defensive narrowing for noUncheckedIndexedAccess. Should never
          // fire (orgRow.length was just checked >0), but if it does, delete
          // the idempotency row so a retry has a chance — SF-W5 symmetry.
          console.error(
            `[clerk-webhook] org ${maskClerkOrgId(clerkOrgId)} lookup returned empty row unexpectedly`,
          );
          await deleteIdempotencyRow(svixId, 'org lookup returned empty row');
          return new Response('Org lookup failed', { status: 409 });
        }
        const orgInternalId = firstOrg.id;
        // Backfill users.org_id + users.role for the matching user.
        const updateResult = await db
          .update(users)
          .set({
            orgId: orgInternalId,
            ...(roleStr ? { role: roleStr } : {}),
          })
          .where(eq(users.clerkUserId, clerkUserId))
          .returning({ id: users.id });
        if (updateResult.length === 0) {
          // user.created hasn't arrived yet — the membership event won the
          // race. SF-W5 fix (03-G3 T7): delete the idempotency row before
          // returning 409 so Clerk's retry re-fires this handler once
          // user.created lands.
          console.error(
            `[clerk-webhook] user ${maskClerkId(clerkUserId)} not found — user.created may not have arrived yet; Clerk should retry`,
          );
          await deleteIdempotencyRow(svixId, 'prerequisite missing: user not yet created');
          return new Response('User not yet created', { status: 409 });
        }
        // CR-01 (Plan 02-07) / D-04: mirror role onto Clerk publicMetadata so
        // sessionClaims.publicMetadata.role is populated for getOrgContext()
        // and the admin middleware gate. Without this the session-claim path
        // stays `undefined` and asRole() throws on every authenticated request.
        if (roleStr) {
          await mirrorRoleToClerk(
            clerkUserId,
            roleStr,
            'organizationMembership.created',
          );
        }
        console.log(
          `[clerk-webhook] organizationMembership.created user=${maskClerkId(clerkUserId)} org=${maskClerkOrgId(clerkOrgId)} role=${roleStr ?? '(unchanged)'}`,
        );
        break;
      }

      case 'organizationMembership.updated': {
        const data = evt.data;
        const clerkUserId = data.public_user_data?.user_id;
        const roleStr = asAppRole(data.role);
        if (!clerkUserId || !roleStr) {
          console.error(
            '[clerk-webhook] organizationMembership.updated missing user_id or unknown role',
            { clerkUserId: clerkUserId ? maskClerkId(clerkUserId) : null, role: data.role },
          );
          break;
        }
        await db
          .update(users)
          .set({ role: roleStr })
          .where(eq(users.clerkUserId, clerkUserId));
        // CR-01 (Plan 02-07) / D-04: mirror updated role onto Clerk
        // publicMetadata so role demotions / promotions propagate to the
        // session claim. Without this, an admin demoted to employee keeps
        // admin gate access until they sign out + back in AND publicMetadata
        // happens to be re-fetched (which it isn't).
        await mirrorRoleToClerk(
          clerkUserId,
          roleStr,
          'organizationMembership.updated',
        );
        console.log(
          `[clerk-webhook] organizationMembership.updated user=${maskClerkId(clerkUserId)} role=${roleStr}`,
        );
        break;
      }

      // D-03c: delete events are logged + no-op. Retention design + ADR-018
      // cascade reconciliation is Phase 7+ work.
      case 'user.deleted':
      case 'organization.deleted':
      case 'organizationMembership.deleted':
        console.log(
          `[clerk-webhook] ${evt.type} received — log-only per D-03c. TODO(Phase 7+): handle deletion + ADR-018 retention.`,
        );
        break;

      default: {
        // Any other event type subscribed in Clerk Dashboard but not yet
        // handled. Log + no-op. Don't 4xx — Clerk would retry forever.
        const evtType: string = evt.type;
        console.log(
          `[clerk-webhook] unhandled event type: ${evtType} (id=${svixId}) — log-only`,
        );
        break;
      }
    }
  } catch (err) {
    // TODO(Phase 7+): invert idempotency-before-dispatch order — write
    // clerk_events row only after successful dispatch to avoid silent
    // failures masking as 200. See STATE.md follow-up SF-W5.
    // Application-layer error during dispatch (e.g., FK violation, RLS
    // misconfiguration). The clerk_events row was already written so a
    // Clerk retry will short-circuit on idempotency — meaning this
    // specific event is effectively lost without manual intervention.
    // Operator must monitor logs for [clerk-webhook] dispatch failures.
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error(
      `[clerk-webhook] dispatch failed for event ${svixId} (${evt.type}): ${detail}`,
    );
    // L-06a (F-01 interim fix): the clerk_events row was written BEFORE
    // dispatch (per Phase 2 design + Plan-checker WARNING-05). A silent
    // dispatch failure leaves the event marked processed AND returns 200
    // → Clerk never retries → the event is permanently lost. Interim fix:
    // delete the idempotency row so the next Clerk retry can re-fire this
    // exact event. Now delegates to the shared deleteIdempotencyRow helper
    // (03-G3 T7) so the cleanup semantics match the 409 prerequisite-missing
    // paths above.
    // Full fix (TODO Phase 7+): invert the idempotency-before-dispatch
    // ordering so the row is only written after successful dispatch.
    await deleteIdempotencyRow(svixId, `dispatch failed: ${evt.type}`);
    // Return 200 anyway — see the gap note above. Clerk Dashboard logs
    // are the operator's debugging path until Phase 7+ inverts the order.
    return new Response('Dispatch error logged', { status: 200 });
  }

  return new Response('OK', { status: 200 });
}
