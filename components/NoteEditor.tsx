'use client';

import { useState, useTransition } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import { saveTermNote } from '@/actions/notes';

type Props = {
  termId: number;
  initialMarkdown: string | null;
};

function ToolbarButton({
  onClick,
  active,
  label,
  title,
}: {
  onClick: () => void;
  active?: boolean;
  label: string;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`px-2 h-7 min-w-7 flex items-center justify-center rounded-md text-xs transition-colors ${
        active
          ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50'
          : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
      }`}
    >
      {label}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const setLink = () => {
    const url = window.prompt('Link URL');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 border border-b-0 border-zinc-200 dark:border-zinc-700 rounded-t-lg px-1.5 py-1 bg-zinc-50 dark:bg-zinc-900">
      <ToolbarButton title="Bold" label="B" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
      <ToolbarButton title="Italic" label="I" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
      <ToolbarButton title="Underline" label="U" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} />
      <span className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1" />
      <ToolbarButton title="Heading" label="H" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
      <ToolbarButton title="Quote" label="&#10078;" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
      <span className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1" />
      <ToolbarButton title="Bullet list" label="&#8226;" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} />
      <ToolbarButton title="Numbered list" label="1." active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
      <span className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1" />
      <ToolbarButton title="Link" label="&#128279;" active={editor.isActive('link')} onClick={setLink} />
      <ToolbarButton title="Inline code" label="&#9095;" active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} />
    </div>
  );
}

export function NoteEditor({ termId, initialMarkdown }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [savedMarkdown, setSavedMarkdown] = useState(initialMarkdown ?? '');

  const editor = useEditor({
    immediatelyRender: false,
    editable: false,
    extensions: [
      StarterKit.configure({
        link: { openOnClick: false },
      }),
      Markdown,
    ],
    content: initialMarkdown ?? '',
    editorProps: {
      attributes: {
        class:
          'prose prose-sm dark:prose-invert max-w-none min-h-[80px] px-3 py-2 focus:outline-none text-zinc-800 dark:text-zinc-200',
      },
    },
  });

  if (!editor) return null;

  const hasContent = savedMarkdown.trim().length > 0;

  const handleEdit = () => {
    setError(null);
    setSavedAt(null);
    setIsEditing(true);
    editor.setEditable(true);
    editor.commands.focus('end');
  };

  const handleCancel = () => {
    setError(null);
    editor.commands.setContent(savedMarkdown);
    editor.setEditable(false);
    setIsEditing(false);
  };

  const handleSave = () => {
    setError(null);
    const markdown = (editor.storage as unknown as { markdown: { getMarkdown(): string } }).markdown.getMarkdown();
    startTransition(async () => {
      try {
        await saveTermNote(termId, markdown);
        setSavedMarkdown(markdown);
        setSavedAt('just now');
        setIsEditing(false);
        editor.setEditable(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save note');
      }
    });
  };

  return (
    <div className="space-y-2">
      {isEditing ? (
        <>
          <div>
            <Toolbar editor={editor} />
            <div className="border border-zinc-200 dark:border-zinc-700 rounded-b-lg bg-white dark:bg-zinc-950">
              <EditorContent editor={editor} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            {error && <p className="text-xs text-red-600 dark:text-red-400 flex-1">{error}</p>}
            {!error && <span className="flex-1" />}
            <button
              type="button"
              onClick={handleCancel}
              disabled={isPending}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </>
      ) : (
        <>
          {hasContent ? (
            <div className="[&_.ProseMirror]:min-h-0 [&_.ProseMirror]:px-0 [&_.ProseMirror]:py-0">
              <EditorContent editor={editor} />
            </div>
          ) : (
            <p className="text-xs text-zinc-400 dark:text-zinc-500 italic">No notes yet.</p>
          )}
          <div className="flex items-center gap-3">
            {savedAt && <p className="text-xs text-zinc-400 dark:text-zinc-500 flex-1">Saved &middot; {savedAt}</p>}
            {!savedAt && <span className="flex-1" />}
            <button
              type="button"
              onClick={handleEdit}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              {hasContent ? 'Edit' : 'Add note'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
