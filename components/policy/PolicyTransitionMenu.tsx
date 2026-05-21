'use client';

// PolicyTransitionMenu — Client Component (D-03 UX mirror; server is authoritative).
//
// Renders ONLY the legal transitions from ALLOWED_TRANSITIONS[currentStatus]
// (mirrors lib/policies/state-machine.ts). The state-machine module is the
// shared source of truth; this component imports it so adding a new transition
// in the state machine surfaces here automatically.
//
// Server is authoritative: every menu item wires a Server Action through a
// transition prop. If a client tampers with the rendered set (e.g., forges a
// hidden "publish from archived" item via devtools), the Server Action
// orchestrator will throw IllegalTransitionError before the DB update fires.
//
// B2 LOCKED — editPublished wiring contract (cross-plan):
//   When the user confirms a transition whose target is 'draft' AND
//   currentStatus === 'published' AND the parent supplied onEditPublished,
//   the Dialog onSubmit calls onEditPublished() and closes the dialog — it
//   does NOT call invoke(). Plan 03-11 supplies the callback to navigate to
//   /policies/[id]?edit=1 so the editor flips into editable mode and saves
//   via editPublishedAction. When onEditPublished is NOT provided (e.g., the
//   menu is used outside the edit page), the Dialog falls through to invoke().
//
// Action props (Rule-3 deviation from plan literal text):
//   The plan code imports Server Actions from app/(admin)/policies/[id]/
//   actions — that file ships in Plan 03-07 (Wave 4), which hasn't executed
//   when 03-10 (Wave 3) lands. To avoid a forward-import tsc error AND keep
//   the component independently shippable, this component accepts the action
//   handlers as PROPS. Plan 03-11 wires the real actions through these props
//   when the edit page mounts.

import { useState, useTransition } from 'react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ChevronDown } from 'lucide-react';
import {
  ALLOWED_TRANSITIONS,
  type PolicyStatus,
} from '@/lib/policies/state-machine';

/**
 * ActionState — the shape every Server Action returns when called via the
 * useFormState / useActionState bridge. Mirrors Plan 03-07's exported type.
 * Declared here so this component is independently shippable in Wave 3.
 */
export type ActionState =
  | { ok: true }
  | { ok: false; error: string };

/**
 * TransitionAction — the action signature this component invokes. Matches
 * Plan 03-07's useFormState-compatible exports.
 */
export type TransitionAction = (
  prev: ActionState | undefined,
  fd: FormData,
) => Promise<ActionState>;

/**
 * TransitionActions — the prop bag the parent (Plan 03-11) supplies. Each
 * key corresponds to one Server Action from app/(admin)/policies/[id]/
 * actions.ts. All optional so the menu can be partially wired during
 * development; if an action is missing for a legal transition, the item is
 * silently omitted (defense — server is still authoritative).
 */
export type TransitionActions = {
  submitForReviewAction?: TransitionAction;
  approveAction?: TransitionAction;
  rejectAction?: TransitionAction;
  publishAction?: TransitionAction;
  archiveAction?: TransitionAction;
  restoreAction?: TransitionAction;
  editPublishedAction?: TransitionAction;
};

type Option = {
  label: string;
  to: PolicyStatus;
  action: TransitionAction;
  destructive?: boolean;
  /** confirm = render via Dialog before invoking action */
  confirm?: {
    title: string;
    body: string;
    confirmLabel: string;
    cancelLabel?: string;
  };
};

function optionsFor(currentStatus: PolicyStatus, actions: TransitionActions): Option[] {
  const allowed = ALLOWED_TRANSITIONS[currentStatus];
  const opts: Option[] = [];
  for (const to of allowed) {
    // UI-SPEC Copywriting Contract locks these labels verbatim.
    switch (currentStatus + '→' + to) {
      case 'draft→under_review':
        if (actions.submitForReviewAction) {
          opts.push({
            label: 'Submit for review',
            to,
            action: actions.submitForReviewAction,
          });
        }
        break;
      case 'draft→published':
        if (actions.publishAction) {
          opts.push({
            label: 'Publish',
            to,
            action: actions.publishAction,
            confirm: {
              title: 'Publish this policy?',
              body: 'Once published, employees will see this policy. You can edit later — edits create a new draft.',
              confirmLabel: 'Publish',
            },
          });
        }
        break;
      case 'under_review→published':
        if (actions.approveAction) {
          opts.push({
            label: 'Approve and publish',
            to,
            action: actions.approveAction,
          });
        }
        break;
      case 'under_review→draft':
        if (actions.rejectAction) {
          opts.push({
            label: 'Send back to draft',
            to,
            action: actions.rejectAction,
            destructive: true,
            confirm: {
              title: 'Send this policy back to draft?',
              body: 'The author can revise and resubmit. Review history is preserved.',
              confirmLabel: 'Send back',
            },
          });
        }
        break;
      case 'published→archived':
        if (actions.archiveAction) {
          opts.push({
            label: 'Archive',
            to,
            action: actions.archiveAction,
            destructive: true,
            confirm: {
              title: 'Archive this policy?',
              body: 'Archived policies are hidden from employees but remain in your audit trail. You can restore later.',
              confirmLabel: 'Archive',
            },
          });
        }
        break;
      case 'published→draft':
        // Edit published — the menu surfaces "Edit policy" which opens a
        // Dialog for change-summary input; submission is editPublishedAction.
        if (actions.editPublishedAction) {
          opts.push({
            label: 'Edit policy',
            to,
            action: actions.editPublishedAction,
            confirm: {
              title: 'Edit published policy?',
              body: 'Editing creates a new draft version. The current published version stays in history. Add an optional change summary to help reviewers.',
              confirmLabel: 'Start editing',
            },
          });
        }
        break;
      case 'archived→draft':
        if (actions.restoreAction) {
          opts.push({
            label: 'Restore as draft',
            to,
            action: actions.restoreAction,
          });
        }
        break;
    }
  }
  return opts;
}

export function PolicyTransitionMenu({
  policyId,
  currentStatus,
  actions,
  onEditPublished,
}: {
  policyId: string;
  currentStatus: PolicyStatus;
  actions: TransitionActions;
  onEditPublished?: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState<Option | null>(null);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const options = optionsFor(currentStatus, actions);

  if (options.length === 0) return null;

  const invoke = (opt: Option, extraFields: Record<string, string> = {}) => {
    const fd = new FormData();
    fd.set('policyId', policyId);
    for (const [k, v] of Object.entries(extraFields)) fd.set(k, v);
    startTransition(async () => {
      const result = await opt.action(undefined, fd);
      if (!result.ok) {
        setError(result.error);
      } else {
        setError(null);
        setConfirmOpen(null);
      }
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="sm">
              Actions <ChevronDown className="ml-1 size-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          {options.map((opt) => (
            <DropdownMenuItem
              key={opt.label}
              variant={opt.destructive ? 'destructive' : 'default'}
              // Base UI Menu uses onClick (not Radix's onSelect). closeOnClick
              // is set to false when the option opens a confirm dialog so the
              // menu doesn't auto-dismiss before the dialog mounts.
              closeOnClick={!opt.confirm}
              onClick={() => {
                if (opt.confirm) setConfirmOpen(opt);
                else invoke(opt);
              }}
            >
              {opt.label}
            </DropdownMenuItem>
          ))}
          {error ? (
            <>
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5 text-xs text-destructive">{error}</div>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {confirmOpen ? (
        <Dialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setConfirmOpen(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{confirmOpen.confirm!.title}</DialogTitle>
              <DialogDescription>{confirmOpen.confirm!.body}</DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const summary = String(fd.get('changeSummary') ?? '');
                // B2 wiring: when the transition is published → draft AND a
                // parent supplied onEditPublished, defer to the parent (Plan
                // 03-11 navigates to /policies/[id]?edit=1). The summary is
                // dropped here — the edit page collects it separately via
                // EditPolicyForm.
                if (
                  confirmOpen.to === 'draft' &&
                  currentStatus === 'published' &&
                  typeof onEditPublished === 'function'
                ) {
                  onEditPublished();
                  setConfirmOpen(null);
                  return;
                }
                invoke(confirmOpen, summary ? { changeSummary: summary } : {});
              }}
            >
              {confirmOpen.label === 'Edit policy' ? (
                <div className="my-4">
                  <Textarea
                    name="changeSummary"
                    maxLength={200}
                    placeholder="Optional: describe what changed"
                  />
                </div>
              ) : null}
              <DialogFooter>
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setConfirmOpen(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant={confirmOpen.destructive ? 'destructive' : 'default'}
                >
                  {confirmOpen.confirm!.confirmLabel}
                </Button>
              </DialogFooter>
            </form>
            {error ? (
              <p className="mt-2 text-sm text-destructive">{error}</p>
            ) : null}
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
