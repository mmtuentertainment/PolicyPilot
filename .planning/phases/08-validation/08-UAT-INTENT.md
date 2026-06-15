# Phase 8: Validation (CSV-first slice) — UAT Intent

**Captured:** 2026-06-15 · **Phase:** 08-validation

What the **operator** will verify by hand (dev/TEST) once Codex ships the slice — the acceptance-criterion-#5 demonstration. This is intent only; automated coverage is in `08-SPEC.md` Acceptance Criteria + the `verify:phase-8` gate.

## Primary scenario (criterion #5 — "Admin exports acknowledgment report to CSV")
1. **Admin downloads a valid CSV.** As an admin of Org A, `GET /api/reports/acknowledgments?format=csv` returns a downloadable file (`Content-Disposition: attachment`, dated filename) that opens cleanly in a spreadsheet with the expected columns: **Employee Name, Email, Department, Policy Title, Status, Acknowledged At, IP Address, Assigned At, Policy Version**. Employee names/emails are present (Clerk-enriched), not opaque IDs.
2. **JSON default works.** Same URL without `?format=` (or `?format=json`) returns JSON `{ rows, summary: { total, acknowledged, pending } }` and the summary counts match the rows.
3. **Status is honest.** A policy a user acknowledged at its current version shows "Acknowledged (current)"; a user who acked only a prior version (after a re-publish) shows "Acknowledged — prior version, re-ack due" and counts as pending; an unacked assignment shows "Pending". Department-assigned employees appear (fanned out).

## Negative / guardrail scenarios
4. **Org isolation.** Provision Org A and Org B with overlapping policy titles. Org A's admin export (CSV and JSON) shows only Org A's employees/policies — zero Org B rows. Supplying Org B's `policyId` as `?policyId=<orgB-uuid>` under Org A's session returns zero rows (not Org B data).
5. **Admin-only.** A logged-in non-admin (employee/reviewer) hitting the endpoint gets **403** (`{ error: 'forbidden' }`); an unauthenticated request gets **401**.
6. **Bad params rejected.** `?format=xml` → **400** (`{ error: 'invalid_request' }`); `?policyId=not-a-uuid` → **400**. A valid `?policyId=` / `?departmentId=` filter narrows the report (still org-scoped).
7. **CSV safety.** A policy titled with a leading `=`/`+`/`-`/`@` (or containing commas/quotes/newlines) exports without breaking the CSV and without the spreadsheet executing it as a formula (neutralized with a leading `'`).

## Out of UAT scope (deferred)
Compliance dashboard donut, aggregate tiles, populated-org seed evidence pass, Stripe test-clock renewal run (AC#6), beat-manual benchmark (SC#5), and the evidence-capture pass for criteria #1–#4/#7/#8 — all deferred per the CSV-first authorization. No prod deploy / live email.

---

*Phase: 08-validation · UAT intent captured 2026-06-15*
