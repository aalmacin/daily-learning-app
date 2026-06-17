'use client';

import { useState, type ReactNode } from 'react';
import { NoteEditor } from './NoteEditor';

type Accent = 'zinc' | 'cyan';

type Props = {
  termId: number;
  initialMarkdown: string | null;
  chat: ReactNode;
  accent?: Accent;
};

const ICON_ASK = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const ICON_NOTE = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z" />
  </svg>
);

export function ResearchTabs({ termId, initialMarkdown, chat, accent = 'zinc' }: Props) {
  const [tab, setTab] = useState<'ask' | 'notes'>('ask');

  const activeClass =
    accent === 'cyan'
      ? 'text-cyan-700 dark:text-cyan-300 border-cyan-500 dark:border-cyan-600'
      : 'text-zinc-900 dark:text-zinc-50 border-zinc-900 dark:border-zinc-50';

  const tabClass = (active: boolean) =>
    `flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
      active ? activeClass : 'text-zinc-400 dark:text-zinc-500 border-transparent hover:text-zinc-600 dark:hover:text-zinc-300'
    }`;

  return (
    <div>
      <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-700 px-1">
        <button type="button" className={tabClass(tab === 'ask')} onClick={() => setTab('ask')}>
          {ICON_ASK} Ask AI
        </button>
        <button type="button" className={tabClass(tab === 'notes')} onClick={() => setTab('notes')}>
          {ICON_NOTE} My Notes
        </button>
      </div>
      <div className="pt-3">
        <div className={tab === 'ask' ? '' : 'hidden'}>{chat}</div>
        <div className={tab === 'notes' ? '' : 'hidden'}>
          <NoteEditor termId={termId} initialMarkdown={initialMarkdown} />
        </div>
      </div>
    </div>
  );
}
