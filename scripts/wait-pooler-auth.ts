// scripts/wait-pooler-auth.ts
//
// Pooler auth-propagation gate. Run AFTER Supabase "Reset database password"
// (or any role-credential rotation) to confirm the Supavisor cache has
// converged on the new secret BEFORE running migrations or resuming workers.
//
// Why this exists (incident-driven, 2026-05-22):
//
// After Reset password, pooler-routed auth (postgres.<ref>@<host>:6543/5432)
// returns `28P01 password authentication failed for user "postgres"` for a
// window ranging from "instant" to multi-minute, with no documented upper
// bound. Dashboard SQL Editor (different auth path) works throughout. The
// Postgres-side `ALTER ROLE PASSWORD` commit is instant (pg_authid MVCC
// visibility); the transient is entirely a Supavisor-cache phenomenon.
//
// Authoritative source map (verified 2026-05-22 against supabase/supavisor):
//   - lib/supavisor/tenants.ex          Cachex TTL = 24h on tenant secret cache
//   - lib/supavisor/secret_checker.ex   @interval = 15_000 ms refresh poll
//   - lib/supavisor/cache_refresh_limiter.ex  3 refreshes / minute / tenant
//   - PR #905 (PBKDF2 verifier result cache); PR #728 (refresh limiter)
//   - Open issue supabase/supabase#44210 — our region aws-1-us-east-1,
//     unresolved as of 2026-05-22
//
// Hazard: Supavisor trips an auth-error circuit breaker at ~10 errors in a
// 150-second window, locking the source IP out for 2 minutes. Naive retry
// loops self-DoS. This script paces probes to stay under the limiter AND
// aborts cleanly before the breaker trips.
//
// Schedule (worst case after rotation):
//   attempt    T+seconds  rationale
//   1          0          immediate probe — propagation may have already happened
//   2          15         matches SecretChecker @interval
//   3-10       +60s each  one CacheRefreshLimiter cycle (3/min ≈ 20s spacing × 3),
//                         leaves ~15s headroom for clock skew
// Total discovery deadline: T+495s ≈ 8m15s.
//
// Then after first success: 4 confirmation probes at 30s intervals (the first
// success counts as #1 of 5). Total confirmation window: 2 min.
// Total worst-case wall time: ~10m15s.
//
// Exit codes:
//   0 — 5 consecutive successful auth probes (propagation confirmed)
//   1 — timeout (10 discovery attempts, no success)
//   2 — circuit-breaker hazard (>=10 28P01 errors observed; stop to avoid lockout)
//   3 — non-recoverable error (DNS, wrong host, paused project, missing env var)
//
// Usage (per docs/runbooks/deploy-migrations.md § Post-rotation auth-propagation gate):
//   pnpm db:wait-pooler-auth                # dev (reads .env.local)
//   pnpm db:wait-pooler-auth:staging        # via scripts/with-deploy-creds.ps1
//   pnpm db:wait-pooler-auth:prod           # via scripts/with-deploy-creds.ps1
//
// Output: structured `[wait-pooler-auth]` log lines + a paste-ready audit
// line on success, matching the STATE.md Session Continuity append pattern
// used by docs/runbooks/deploy-migrations.md § Audit log.

import postgres from 'postgres';

const DB_URL = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

// Schedule constants — see header for rationale.
const ATTEMPT_SCHEDULE_SEC: readonly number[] = [
  0, 15, 75, 135, 195, 255, 315, 375, 435, 495,
] as const;
const SUCCESS_STREAK_REQUIRED = 5;
const CONFIRM_INTERVAL_SEC = 30;
const CIRCUIT_BREAKER_HAZARD_COUNT = 10;
const PROBE_CONNECT_TIMEOUT_SEC = 10;

interface ProbeResult {
  ok: boolean;
  code?: string;
  msg?: string;
}

function fmtIso(d: Date): string {
  return d.toISOString();
}

function fmtElapsed(ms: number): string {
  const sec = Math.round(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m${s}s`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function probe(url: string): Promise<ProbeResult> {
  // One-shot connection per probe — guarantees no stale connection from
  // a previous attempt is reused. max:1 + idle_timeout:1 closes the
  // socket immediately after the probe completes.
  const sql = postgres(url, {
    prepare: false,
    connect_timeout: PROBE_CONNECT_TIMEOUT_SEC,
    idle_timeout: 1,
    max: 1,
    fetch_types: false,
    onnotice: () => {
      /* suppress NOTICE chatter during probes */
    },
  });
  try {
    await sql`SELECT 1`;
    return { ok: true };
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string; name?: string };
    return {
      ok: false,
      code: e.code ?? e.name,
      msg: e.message ?? String(err),
    };
  } finally {
    try {
      await sql.end({ timeout: 5 });
    } catch {
      // postgres-js can throw on shutdown if the underlying socket was
      // already torn down by the server's auth failure. Swallow — the
      // probe result is already captured.
    }
  }
}

async function main(): Promise<void> {
  if (!DB_URL) {
    console.error(
      '[wait-pooler-auth] DIRECT_URL or DATABASE_URL must be set in env',
    );
    process.exit(3);
  }

  const dbHost = (() => {
    try {
      return new URL(DB_URL).host;
    } catch {
      return '(invalid DB_URL — cannot parse)';
    }
  })();

  const startTime = Date.now();
  console.log(
    `[wait-pooler-auth] target=${dbHost} started=${fmtIso(new Date(startTime))}`,
  );
  console.log(
    `[wait-pooler-auth] strategy: ${ATTEMPT_SCHEDULE_SEC.length} discovery probes over ` +
      `~${Math.round(ATTEMPT_SCHEDULE_SEC[ATTEMPT_SCHEDULE_SEC.length - 1]! / 60)} min, ` +
      `then ${SUCCESS_STREAK_REQUIRED} consecutive confirmations at ${CONFIRM_INTERVAL_SEC}s intervals.`,
  );

  let count28P01 = 0;
  let lastError = '';
  let firstSuccessTime: number | null = null;

  // ---------- Phase 1: discovery ----------
  for (let i = 0; i < ATTEMPT_SCHEDULE_SEC.length; i++) {
    const targetMs = startTime + ATTEMPT_SCHEDULE_SEC[i]! * 1000;
    const waitMs = Math.max(0, targetMs - Date.now());
    if (waitMs > 0) {
      await sleep(waitMs);
    }

    const elapsedSec = Math.round((Date.now() - startTime) / 1000);
    const result = await probe(DB_URL);

    if (result.ok) {
      console.log(
        `[wait-pooler-auth] discovery ${i + 1}/${ATTEMPT_SCHEDULE_SEC.length} OK at T+${elapsedSec}s — first success`,
      );
      firstSuccessTime = Date.now();
      break;
    }

    if (result.code === '28P01') {
      count28P01++;
      console.log(
        `[wait-pooler-auth] discovery ${i + 1}/${ATTEMPT_SCHEDULE_SEC.length} 28P01 at T+${elapsedSec}s (count=${count28P01})`,
      );
    } else {
      console.log(
        `[wait-pooler-auth] discovery ${i + 1}/${ATTEMPT_SCHEDULE_SEC.length} ${result.code ?? 'unknown'} at T+${elapsedSec}s — ${result.msg ?? '(no message)'}`,
      );
    }
    lastError = `${result.code ?? 'unknown'}: ${result.msg ?? ''}`;

    if (count28P01 >= CIRCUIT_BREAKER_HAZARD_COUNT) {
      console.error('');
      console.error(
        `✗ wait-pooler-auth ABORTED — ${count28P01} 28P01 errors observed.`,
      );
      console.error(
        '  Supavisor auth-error circuit breaker (10 errors / 150s) is at the trip threshold.',
      );
      console.error(
        '  Continued probing will lock this source IP out of the pooler for 2 minutes,',
      );
      console.error(
        '  blocking recovery for an additional 2 min on top of the propagation window.',
      );
      console.error('');
      console.error('  Remediation:');
      console.error(
        '    1. STOP. Wait >5 min before any further auth attempts from this IP.',
      );
      console.error(
        '    2. Verify the new password works in the Supabase Dashboard SQL Editor.',
      );
      console.error(
        '       If it works there but not here, the credential is correct — it is purely a cache lag.',
      );
      console.error(
        '       If it FAILS in the SQL Editor too, you have a credential-capture problem; re-rotate.',
      );
      console.error(
        '    3. If SQL Editor works but the pooler still 28P01s after a 10-min wait:',
      );
      console.error(
        '       restart the project via Dashboard → Project Settings → General → Restart',
      );
      console.error(
        '       (only documented escape hatch — supabase/supabase#44210).',
      );
      console.error(
        '  See docs/runbooks/deploy-migrations.md § Post-rotation auth-propagation gate.',
      );
      process.exit(2);
    }

    // Detect non-recoverable error classes early. 28P01 is the propagation
    // symptom; everything else suggests a config/infra problem that won't
    // resolve by waiting. Give the first 2 attempts grace (transient
    // network blips), then fail fast.
    const knownTransient =
      result.code === '28P01' ||
      result.code === 'ECONNREFUSED' ||
      result.code === 'ETIMEDOUT' ||
      result.code === 'CONNECT_TIMEOUT';
    if (i >= 2 && result.code && !knownTransient) {
      console.error('');
      console.error(
        `✗ wait-pooler-auth FAILED — non-recoverable error class: ${lastError}`,
      );
      console.error(
        `  Error code ${result.code} is not a known propagation symptom.`,
      );
      console.error('  Likely causes (check in this order):');
      console.error(
        '    - Wrong hostname in DATABASE_URL/DIRECT_URL (typo, stale project_ref)',
      );
      console.error(
        '    - Supabase project is paused (auto-pause after 1 week on Free tier)',
      );
      console.error('    - Local DNS / network issue blocking the pooler');
      console.error(
        '  Cross-check the Dashboard SQL Editor first — if it works, you have a',
      );
      console.error(
        '  credential or routing problem in this env file, not a propagation issue.',
      );
      process.exit(3);
    }
  }

  if (firstSuccessTime === null) {
    const elapsedSec = Math.round((Date.now() - startTime) / 1000);
    console.error('');
    console.error(
      `✗ wait-pooler-auth TIMEOUT — no successful auth after ${ATTEMPT_SCHEDULE_SEC.length} attempts (${elapsedSec}s).`,
    );
    console.error(`  Last error: ${lastError}`);
    console.error(`  28P01 count: ${count28P01}`);
    console.error('');
    console.error(
      '  Per open issue supabase/supabase#44210, this region (aws-1-us-east-1) has reports of',
    );
    console.error(
      '  multi-minute pooler propagation delays after Reset password. The only documented',
    );
    console.error('  escape hatch is project restart via Dashboard.');
    console.error('');
    console.error(
      '  DO NOT retry this script immediately — that compounds the circuit-breaker risk.',
    );
    console.error('  Wait >5 min, then either:');
    console.error(
      '    1. Restart the project (Dashboard → Project Settings → General → Restart)',
    );
    console.error(
      '       and re-run this gate. Restart forcibly invalidates the Supavisor cache.',
    );
    console.error(
      '    2. Verify the password works in the Dashboard SQL Editor first.',
    );
    console.error(
      '  See docs/runbooks/deploy-migrations.md § Post-rotation auth-propagation gate.',
    );
    process.exit(1);
  }

  // ---------- Phase 2: confirmation ----------
  console.log(
    `[wait-pooler-auth] discovery phase OK; entering confirmation phase ` +
      `(${SUCCESS_STREAK_REQUIRED} consecutive at ${CONFIRM_INTERVAL_SEC}s intervals needed)`,
  );
  let streak = 1; // discovery's first success counts as confirmation #1

  while (streak < SUCCESS_STREAK_REQUIRED) {
    await sleep(CONFIRM_INTERVAL_SEC * 1000);
    const elapsedSec = Math.round((Date.now() - startTime) / 1000);
    const result = await probe(DB_URL);

    if (result.ok) {
      streak++;
      console.log(
        `[wait-pooler-auth] confirm ${streak}/${SUCCESS_STREAK_REQUIRED} OK at T+${elapsedSec}s`,
      );
      continue;
    }

    // Regression during confirmation. Could be partial-instance propagation
    // (one pooler lane refreshed, another stale) or a brief network blip.
    // Reset streak; do NOT abort unless we hit the circuit-breaker threshold.
    console.log(
      `[wait-pooler-auth] confirm regression at T+${elapsedSec}s — ${result.code ?? 'unknown'}; resetting streak`,
    );
    streak = 0;
    if (result.code === '28P01') {
      count28P01++;
      if (count28P01 >= CIRCUIT_BREAKER_HAZARD_COUNT) {
        console.error('');
        console.error(
          `✗ wait-pooler-auth ABORTED in confirmation — circuit-breaker hazard reached (${count28P01} 28P01).`,
        );
        console.error('  See discovery-phase abort message for remediation.');
        process.exit(2);
      }
    }
  }

  // ---------- Success ----------
  const endTime = Date.now();
  const totalMs = endTime - startTime;
  const firstSuccessMs = firstSuccessTime - startTime;

  console.log('');
  console.log('[wait-pooler-auth] SUCCESS — pooler auth propagation confirmed.');
  console.log(`  Target:                 ${dbHost}`);
  console.log(`  Started:                ${fmtIso(new Date(startTime))}`);
  console.log(
    `  First success:          ${fmtIso(new Date(firstSuccessTime))} (T+${fmtElapsed(firstSuccessMs)})`,
  );
  console.log(
    `  Confirmed:              ${fmtIso(new Date(endTime))} (T+${fmtElapsed(totalMs)})`,
  );
  console.log(`  28P01 count during run: ${count28P01}`);
  console.log('');
  console.log(
    'Audit-log line (paste into .planning/STATE.md § Session Continuity):',
  );
  console.log(
    `- **Pooler-auth wait ${fmtIso(new Date(endTime))}**: target=${dbHost}, ` +
      `propagation observed T+${fmtElapsed(firstSuccessMs)} (first success), ` +
      `confirmed T+${fmtElapsed(totalMs)} (${SUCCESS_STREAK_REQUIRED} consecutive at ${CONFIRM_INTERVAL_SEC}s intervals), ` +
      `28P01 count=${count28P01}.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(
    '[wait-pooler-auth] unexpected error:',
    err instanceof Error ? err.message : err,
  );
  process.exit(3);
});
