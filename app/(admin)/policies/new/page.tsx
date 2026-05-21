// app/(admin)/policies/new/page.tsx — Plan 03-11 Task 3.
//
// Create-policy page. Server Component shell hosts the Client
// CreatePolicyForm which owns useActionState for inline error rendering.
// The createPolicyAction (Plan 03-07) handles the multipart/form-data
// POST, validates with Zod, inserts inside withOrgScope, then
// revalidatePath('/policies') + redirect(`/policies/${id}`).
//
// SC #1 (ROADMAP) is observable end-to-end after this page lands:
//   /dashboard → "Create policy" CTA → /policies/new → save → /policies/{id}
//   → row visible on /policies with Draft badge.
import Link from "next/link";
import { CreatePolicyForm } from "@/components/policy/CreatePolicyForm";

export default function NewPolicyPage() {
  return (
    <div>
      <Link
        href="/policies"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to library
      </Link>
      <h1 className="text-xl font-semibold mt-2 mb-6">Create policy</h1>
      <CreatePolicyForm />
    </div>
  );
}
