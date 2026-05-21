// PLACEHOLDER — the shadcn `base-nova` style registry does not ship a `Form`
// component (the new base-ui-flavored registry stubs `form.json` empty:
// {"$schema":"...","name":"form","type":"registry:ui"} with no `files` block).
//
// Phase 3 explicitly does NOT use `<Form>` per Plan 03-08 D-09:
//   "NO React Hook Form in Phase 3 — Server Actions + native HTML5 +
//    useActionState cover the surface without an extra dependency."
//
// This file exists ONLY to satisfy the Plan 03-08 file-existence acceptance
// criterion. It intentionally exports nothing so any accidental `<Form>`
// usage produces an immediate type error pointing developers at the native
// pattern: `<form action={serverAction}>` + shadcn `<Label>` / `<Input>` /
// `<Textarea>` / `<Select>` + `useActionState` for error rendering.
//
// If a future phase needs a Form-with-Schema wrapper (e.g., Phase 6 Stripe
// checkout, Phase 8 dashboard filters), revisit the choice between
// hand-rolling on top of `useActionState` OR adding react-hook-form +
// installing the radix-flavored Form block from a different style.
//
// Source: 03-08-PLAN.md Task 4 action note; UI-SPEC Component Inventory row.
export {};
