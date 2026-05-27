// app/(employee)/my-policies/ask/page.tsx — Plan 05-05 Task 3b.
//
// R-6 RSC shell. Renders AskQuestionForm Client Component. The Client
// form owns the useActionState lifecycle + answer + citation render;
// this Server Component is just the page chrome + auth gate (the layout
// already calls getOrgContext, but defense-in-depth here keeps the
// page-level gate honest per D-09).
//
// Plain `<Link>` back to /my-policies — no state propagation needed.
import Link from "next/link";
import { getOrgContext } from "@/lib/auth/context";
import { AskQuestionForm } from "@/components/employee/AskQuestionForm";

export default async function AskQuestionPage(): Promise<React.JSX.Element> {
  await getOrgContext();
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          Ask the AI about your policies
        </h1>
        <Link href="/my-policies" className="text-sm underline">
          Back to my policies
        </Link>
      </div>
      <AskQuestionForm />
    </div>
  );
}
