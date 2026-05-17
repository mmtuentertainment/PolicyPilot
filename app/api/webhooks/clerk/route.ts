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
// Known gap (SF-W5, deferred to Phase 7+): clerk_events row is written
// BEFORE dispatch. A silent dispatch failure leaves the event marked
// processed and Clerk does not retry. Phase 7+ will invert the order
// or add structured alerting. Operator-monitored via console logs
// in the meantime.
import { Webhook } from 'svix';
import type { WebhookEvent } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { clerkEvents, organizations, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Narrow Clerk's organizationMembership.role string to our enum.
 * D-04 / D-09: `admin` / `reviewer` / `employee` are the three roles the
 * operator defined in the Clerk Dashboard (D-09). Clerk may emit the role
 * with an `org:` prefix (e.g. `org:admin`) depending on dashboard
 * customization; strip the prefix first, then narrow.
 *
 * Returns the narrowed Role on success, or null when the payload role
 * cannot be mapped (the caller logs + skips the role update — the row's
 * existing role value or the `employee` default is retained).
 */
function asAppRole(value: unknown): 'admin' | 'reviewer' | 'employee' | null {
  if (typeof value !== 'string') return null;
  const stripped = value.replace(/^org:/, '');
  if (stripped === 'admin' || stripped === 'reviewer' || stripped === 'employee') {
    return stripped;
  }
  return null;
}

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
        console.log(`[clerk-webhook] organization.created ${data.id}`);
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
        console.log(
          `[clerk-webhook] user.created ${data.id} (org_id pending membership)`,
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
            { clerkUserId, clerkOrgId },
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
          // organization.created hasn't arrived yet — but we've already
          // written the clerk_events row for this svix-id, so Clerk
          // retrying won't re-fire this handler (SF-W5 known gap).
          // Returning 409 keeps the operator-visible Clerk dashboard log
          // truthful: this event was rejected and needs operator follow-up.
          console.error(
            `[clerk-webhook] org ${clerkOrgId} not found — organization.created may not have arrived yet; Clerk should retry`,
          );
          return new Response('Org not yet created', { status: 409 });
        }
        const firstOrg = orgRow[0];
        if (!firstOrg) {
          // Defensive narrowing for noUncheckedIndexedAccess.
          console.error(
            `[clerk-webhook] org ${clerkOrgId} lookup returned empty row unexpectedly`,
          );
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
          console.error(
            `[clerk-webhook] user ${clerkUserId} not found — user.created may not have arrived yet; Clerk should retry`,
          );
          return new Response('User not yet created', { status: 409 });
        }
        console.log(
          `[clerk-webhook] organizationMembership.created user=${clerkUserId} org=${clerkOrgId} role=${roleStr ?? '(unchanged)'}`,
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
            { clerkUserId, role: data.role },
          );
          break;
        }
        await db
          .update(users)
          .set({ role: roleStr })
          .where(eq(users.clerkUserId, clerkUserId));
        console.log(
          `[clerk-webhook] organizationMembership.updated user=${clerkUserId} role=${roleStr}`,
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
    // Return 200 anyway — see the gap note above. Clerk Dashboard logs
    // are the operator's debugging path until Phase 7+ inverts the order.
    return new Response('Dispatch error logged', { status: 200 });
  }

  return new Response('OK', { status: 200 });
}
