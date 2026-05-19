"use client";

// PolicyStatusFilter — Plan 03-11 Task 2 helper.
//
// Small URL-state Client Component wrapping the Base UI Select. The Base
// UI Select primitive in components/ui/select.tsx is NOT a plain HTML
// <select> — its `onValueChange` fires client-side, so `<form action>`
// submit semantics don't carry the value as form data. To keep the
// Server-Component-first /policies page working with URL state, this tiny
// wrapper pushes `?status=...` via router.replace() on change.
//
// PHASE 8 POLISH: For graceful no-JS degradation, the parent renders a
// <noscript> link list as a fallback. JS-on path (99% of users) routes
// through this component.

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

const OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "under_review", label: "Under Review" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
] as const;

export function PolicyStatusFilter({
  initialValue,
}: {
  initialValue?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const value = initialValue ?? "all";

  const onChange = (next: unknown) => {
    const v = String(next ?? "all");
    const sp = new URLSearchParams(params.toString());
    if (v && v !== "all") sp.set("status", v);
    else sp.delete("status");
    router.replace(`/policies?${sp.toString()}`);
  };

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="All statuses" />
      </SelectTrigger>
      <SelectContent>
        {OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
