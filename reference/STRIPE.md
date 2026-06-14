# Stripe Rules (reference)

> Moved out of `CLAUDE.md` 2026-06-14 (context-diet). The **inline invariants
> stay in `CLAUDE.md`**: handle ALL subscription events (not just checkout),
> all handlers idempotent, store processed event IDs, never trust client-side
> for subscription state, never use live Stripe mode without operator
> authorization. This file holds the per-event handling detail.

Handle all subscription events — not just checkout:

- `checkout.session.completed` — initial subscription
- `invoice.paid` — renewal (miss this = users lose access after cycle 1)
- `invoice.payment_failed` — flag org for dunning
- `customer.subscription.deleted` — cancel org
- `customer.subscription.updated` — plan change

All handlers must be idempotent. Store processed Stripe event IDs. Verify webhook signatures with the raw body (`request.text()`).
