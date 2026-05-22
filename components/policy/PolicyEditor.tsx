'use client';

// PolicyEditor — Client Component (D-02 / RESEARCH Pattern 3 / W12 closure).
//
// MANDATORY: `immediatelyRender: false` per RESEARCH Pitfall 1. Without this,
// Next.js 15 SSR hydration throws on every editor mount. TipTap 2.x logs a
// console.warn when SSR is detected and the flag is omitted — but a warn does
// not stop the hydration mismatch from breaking the React tree.
//
// CVE-2025-14284: @tiptap/extension-link default `isAllowedUri` rejects the
// javascript: protocol. We do NOT override it. Pin ≥ 2.10.4 satisfies the fix;
// package.json ships 2.27.2 for all four @tiptap/* packages.

import { useEditor, EditorContent, type Editor, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { useEffect, useState } from 'react';
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

type PolicyEditorProps = {
  initialContent?: JSONContent;
  name?: string;
  /** Optional read-only flag — used by /policies/[id] when status is published-without-edit */
  readOnly?: boolean;
  /**
   * Phase 4 Plan 04-12 — optional onMount callback fires once when the TipTap
   * editor instance is ready. The parent (CreatePolicyForm in /policies/new)
   * uses this to capture the editor ref for the sibling PolicyAiDraftDialog
   * (D-22): the dialog's `onDraftReady(rawContent)` callback then routes to
   *   editor.commands.setContent(rawContent)
   * — D-28 + AC-23 contract: raw string, NEVER JSON.parse.
   *
   * Default = no-op; existing call sites (EditPolicyForm, PolicyEditor.test)
   * stay backward-compatible without supplying the callback.
   */
  onMount?: (editor: Editor) => void;
};

const EMPTY_DOC: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };

export function PolicyEditor({
  initialContent,
  name = 'content_json',
  readOnly = false,
  onMount,
}: PolicyEditorProps) {
  const [json, setJson] = useState<JSONContent>(initialContent ?? EMPTY_DOC);

  const editor = useEditor({
    // MANDATORY for Next.js 15 SSR per RESEARCH Pitfall 1.
    immediatelyRender: false,
    editable: !readOnly,
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        autolink: true,
        // CVE-2025-14284: default isAllowedUri rejects javascript: protocol.
        // We don't override it. Pin >= 2.10.4 satisfies the fix; we ship 2.27.2.
      }),
    ],
    content: initialContent ?? EMPTY_DOC,
    onUpdate: ({ editor: ed }) => setJson(ed.getJSON()),
    editorProps: {
      attributes: {
        'aria-label': 'Policy content editor',
        class: 'prose prose-sm max-w-none min-h-[400px] focus:outline-none px-4 py-3',
      },
    },
  });

  // Plan 04-12 — fire onMount once when the editor instance materializes.
  // useEditor returns null during SSR + the first render under jsdom (per
  // immediatelyRender:false); the instance arrives on the post-mount render.
  // The effect's dependency on `editor` ensures we only call `onMount` once
  // the editor is non-null AND the optional callback is supplied.
  useEffect(() => {
    if (editor && onMount) onMount(editor);
  }, [editor, onMount]);

  if (!editor) {
    // Pre-mount placeholder — useEditor returns null during SSR.
    // Hidden input is still emitted so form submission semantics match the
    // mounted state (Plan 03-11 forms read the same name from FormData).
    return (
      <div className="border rounded-md min-h-[400px] p-4 text-sm text-muted-foreground">
        <input type="hidden" name={name} value={JSON.stringify(json)} />
        Loading editor…
      </div>
    );
  }

  type ToolbarBtnProps = {
    onClick: () => void;
    active: boolean;
    disabled?: boolean;
    ariaLabel: string;
    children: React.ReactNode;
  };
  const ToolbarBtn = ({ onClick, active, disabled, ariaLabel, children }: ToolbarBtnProps) => (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={onClick}
      disabled={disabled || readOnly}
      aria-pressed={active}
      aria-label={ariaLabel}
      data-active={active ? 'true' : undefined}
      className="data-[active=true]:bg-muted"
    >
      {children}
    </Button>
  );

  return (
    <div className="border rounded-md overflow-hidden">
      <input type="hidden" name={name} value={JSON.stringify(json)} />
      {!readOnly && (
        <div className="sticky top-0 z-10 flex flex-wrap gap-1 border-b bg-background p-2">
          <ToolbarBtn
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive('bold')}
            ariaLabel="Bold"
          >
            <Bold className="size-4" />
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive('italic')}
            ariaLabel="Italic"
          >
            <Italic className="size-4" />
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor.chain().focus().toggleStrike().run()}
            active={editor.isActive('strike')}
            ariaLabel="Strikethrough"
          >
            <Strikethrough className="size-4" />
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor.chain().focus().toggleCode().run()}
            active={editor.isActive('code')}
            ariaLabel="Inline code"
          >
            <Code className="size-4" />
          </ToolbarBtn>
          <span className="mx-1 h-6 w-px bg-border" aria-hidden="true" />
          <ToolbarBtn
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            active={editor.isActive('heading', { level: 1 })}
            ariaLabel="Heading 1"
          >
            <Heading1 className="size-4" />
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            active={editor.isActive('heading', { level: 2 })}
            ariaLabel="Heading 2"
          >
            <Heading2 className="size-4" />
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            active={editor.isActive('heading', { level: 3 })}
            ariaLabel="Heading 3"
          >
            <Heading3 className="size-4" />
          </ToolbarBtn>
          <span className="mx-1 h-6 w-px bg-border" aria-hidden="true" />
          <ToolbarBtn
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive('bulletList')}
            ariaLabel="Bullet list"
          >
            <List className="size-4" />
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive('orderedList')}
            ariaLabel="Numbered list"
          >
            <ListOrdered className="size-4" />
          </ToolbarBtn>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
