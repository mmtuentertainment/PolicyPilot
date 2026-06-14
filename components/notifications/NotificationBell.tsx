'use client';

import {
  useId,
  useOptimistic,
  useState,
  useTransition,
  type MouseEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import { BellIcon, BellOffIcon, CheckIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from '@/app/(employee)/notifications/actions';
import {
  notificationHref,
  policyIdFor,
  policyTitleFor,
  secondaryFor,
  titleFor,
  type NotificationRow,
} from './notification-href';

type OptimisticAction = { kind: 'read-one' } | { kind: 'read-all' };

type NotificationBellProps = {
  unread: NotificationRow[];
  count: number;
  persona: 'admin' | 'employee';
  status?: 'ready' | 'loading' | 'error';
};

function countLabel(count: number): string {
  return count === 1 ? '1 unread' : `${count} unread`;
}

export function NotificationBell({
  unread,
  count,
  persona,
  status = 'ready',
}: NotificationBellProps): React.JSX.Element {
  const panelId = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [optimisticCount, applyOptimisticCount] = useOptimistic(
    count,
    (current, action: OptimisticAction) =>
      action.kind === 'read-all' ? 0 : Math.max(0, current - 1),
  );

  const buildFormData = (id?: string): FormData => {
    const formData = new FormData();
    formData.set('persona', persona);
    if (id) formData.set('id', id);
    return formData;
  };

  const markRead = (id: string, href?: string): void => {
    applyOptimisticCount({ kind: 'read-one' });
    startTransition(() => {
      void markNotificationReadAction(undefined, buildFormData(id)).then((result) => {
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setError(null);
        if (href) router.push(href);
      });
    });
  };

  const markAllRead = (): void => {
    applyOptimisticCount({ kind: 'read-all' });
    startTransition(() => {
      void markAllNotificationsReadAction(undefined, buildFormData()).then((result) => {
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setError(null);
      });
    });
  };

  const trigger = (
    <Button
      variant="ghost"
      size="icon"
      className="relative min-h-11 min-w-11 sm:min-h-8 sm:min-w-8"
      aria-label="Notifications"
      aria-controls={panelId}
    >
      <BellIcon className="size-5" aria-hidden />
      {optimisticCount > 0 ? (
        <Badge
          variant="destructive"
          className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full p-0 text-[10px]"
        >
          {optimisticCount > 9 ? '9+' : optimisticCount}
          <span className="sr-only">
            {optimisticCount} unread notifications
          </span>
        </Badge>
      ) : null}
    </Button>
  );

  const renderRows = (mobile = false) => {
    if (status === 'loading') {
      return (
        <div className="space-y-2 p-3">
          {[0, 1, 2, 3].map((key) => (
            <div key={key} className="flex items-center gap-2">
              <Skeleton className="size-8 rounded-full" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (status === 'error') {
      return (
        <div className="p-3">
          <Card className="border border-destructive" size="sm">
            <CardContent className="space-y-3">
              <p className="text-sm">
                Unable to load notifications. Please try again.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => router.refresh()}
              >
                Retry
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    if (unread.length === 0) {
      return (
        <div className="flex min-h-40 flex-col items-center justify-center gap-2 p-6 text-muted-foreground">
          <BellOffIcon className="size-5" aria-hidden />
          <p className="text-center text-sm">You&apos;re all caught up</p>
        </div>
      );
    }

    return (
      <div
        id={panelId}
        className={mobile ? 'flex-1 divide-y overflow-y-auto' : 'max-h-96 divide-y overflow-y-auto'}
        role="list"
      >
        {unread.map((row) => {
          const policyId = policyIdFor(row);
          const href = policyId ? notificationHref(row.type, policyId) : undefined;
          const policyTitle = policyTitleFor(row);
          const secondary = secondaryFor(row);
          const itemBody = (
            <>
              <div className="min-w-0 flex-1">
                <p className={row.read ? 'truncate text-sm font-normal' : 'truncate text-sm font-medium'}>
                  {titleFor(row.type)}
                </p>
                {policyTitle ? (
                  <p className="truncate text-xs text-muted-foreground">
                    {policyTitle}
                  </p>
                ) : null}
                {secondary ? (
                  <p className="text-xs text-muted-foreground">{secondary}</p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Mark as read"
                onClick={(event: MouseEvent<HTMLButtonElement>) => {
                  event.stopPropagation();
                  markRead(row.id);
                }}
              >
                <CheckIcon aria-hidden />
              </Button>
            </>
          );

          if (mobile) {
            return (
              <button
                key={row.id}
                type="button"
                role="listitem"
                className="flex w-full items-start gap-2 px-3 py-3 text-left outline-none hover:bg-accent focus-visible:bg-accent"
                onClick={() => markRead(row.id, href)}
              >
                {itemBody}
              </button>
            );
          }

          return (
            <DropdownMenuItem
              key={row.id}
              role="listitem"
              closeOnClick={false}
              onClick={() => markRead(row.id, href)}
              className="items-start gap-2 rounded-md px-1.5 py-2"
            >
              {itemBody}
            </DropdownMenuItem>
          );
        })}
      </div>
    );
  };

  return (
    <>
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {optimisticCount} unread notification{optimisticCount === 1 ? '' : 's'}
      </div>

      <div className="hidden sm:block">
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger render={trigger} />
          <DropdownMenuContent
            id={panelId}
            align="end"
            sideOffset={4}
            className="w-80 p-0"
          >
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="text-sm font-semibold">Notifications</span>
              {optimisticCount > 0 ? (
                <span className="text-xs text-muted-foreground">
                  {countLabel(optimisticCount)}
                </span>
              ) : null}
            </div>
            {renderRows(false)}
            {error ? (
              <p className="border-t px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            ) : null}
            <div className="border-t px-3 py-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={optimisticCount === 0}
                onClick={markAllRead}
                className="w-full"
              >
                Mark all read
              </Button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="sm:hidden">
        <span onClick={() => setOpen(true)}>{trigger}</span>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="right">
            <SheetHeader>
              <SheetTitle>Notifications</SheetTitle>
              {optimisticCount > 0 ? (
                <SheetDescription>{countLabel(optimisticCount)}</SheetDescription>
              ) : null}
            </SheetHeader>
            {renderRows(true)}
            {error ? (
              <p className="px-4 text-xs text-destructive">{error}</p>
            ) : null}
            <SheetFooter>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={optimisticCount === 0}
                onClick={markAllRead}
                className="w-full"
              >
                Mark all read
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
