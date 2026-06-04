'use client';
// app/(reviewer)/reviewer/ReviewDecisionForm.tsx — Phase 9 (R-017 / D-09-01).
//
// Client decision form for the review-detail page. Mirrors the
// useTransition + `await action(undefined, fd)` invoke pattern from
// components/policy/PolicyTransitionMenu.tsx. ActionState is declared locally
// (same precedent) so this client component does not import a value from the
// 'use server' actions module.
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { approveStageAction, rejectStageAction } from './actions';

type ActionState = { ok: true } | { ok: false; error: string };
type ReviewAction = (
  prev: ActionState | undefined,
  fd: FormData,
) => Promise<ActionState>;

export function ReviewDecisionForm({
  policyId,
  stageId,
}: {
  policyId: string;
  stageId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState('');

  const run = (action: ReviewAction) => {
    const fd = new FormData();
    fd.set('policyId', policyId);
    fd.set('stageId', stageId);
    if (comment.trim().length > 0) fd.set('comment', comment);
    startTransition(async () => {
      const result = await action(undefined, fd);
      setError(result.ok ? null : result.error);
    });
  };

  return (
    <div className="space-y-3">
      <Textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={2000}
        placeholder="Optional comment for the author"
      />
      <div className="flex gap-2">
        <Button type="button" disabled={isPending} onClick={() => run(approveStageAction)}>
          Approve
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={isPending}
          onClick={() => run(rejectStageAction)}
        >
          Reject
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
