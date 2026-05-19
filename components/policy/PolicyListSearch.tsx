"use client";

// PolicyListSearch — Plan 03-11 Task 2.
//
// Small Client Component sibling of the policy/ components. Owns the
// debounced URL push for the /policies search input. T-03-11-05 mitigation:
// 250ms debounce prevents DB hammering on every keystroke. Repository's
// listWithFilters caps results at LIMIT 100 as defense-in-depth.
//
// URL-state pattern (RESEARCH §URL state-of-truth):
//   - Read initial value from useSearchParams (server-rendered URL).
//   - On input change, debounce 250ms then router.replace() with the
//     new ?q= param appended/removed. router.replace() avoids stacking
//     History entries on every keystroke (better Back-button UX).
//   - The Server Component page reads searchParams.q and calls
//     Policies.listWithFilters({ q, status }) inside withOrgScope.

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export function PolicyListSearch() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  useEffect(() => {
    const handle = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (q) next.set("q", q);
      else next.delete("q");
      router.replace(`/policies?${next.toString()}`);
    }, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="relative max-w-xs">
      <Search
        className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by title or category"
        className="pl-8"
        aria-label="Search policies"
      />
    </div>
  );
}
