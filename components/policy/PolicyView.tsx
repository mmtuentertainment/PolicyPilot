// PolicyView — Server Component (D-02 / RESEARCH Pattern 4).
//
// Server-side render of stored policy JSON. The import is `@tiptap/html`
// (NOT `@tiptap/core` — Pattern 4 calls this out explicitly: generateHTML
// in the html package is the server-safe entry that doesn't pull DOM globals).
//
// XSS surface: TipTap JSON has a finite shape; StarterKit + Link allow-list
// is auditable. Link.isAllowedUri default rejects javascript: protocol
// (CVE-2025-14284 fix in @tiptap/extension-link >= 2.10.4; we ship 2.27.2).
// The JSON originates from server-controlled storage (policies.contentJson
// is jsonb owned by Drizzle) — no untrusted-HTML round-trip.
//
// No client directive. This file ships zero client JS — it runs only at
// request time on the server (no useEditor, no DOM globals).

import { generateHTML } from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import type { JSONContent } from '@tiptap/react';

export function PolicyView({ content }: { content: JSONContent }) {
  const html = generateHTML(content, [StarterKit, Link]);
  return (
    <div
      className="prose prose-sm max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
