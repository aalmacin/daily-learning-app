'use client';

import { useState, useTransition } from 'react';
import type { VideoResearch } from '@/lib/db';
import { updateVideoResearchTitle, removeVideoResearch, retryVideoResearch } from '@/actions/videoResearch';

type Accent = 'zinc' | 'cyan';
type Tab = 'summary' | 'study' | 'ai' | 'concepts' | 'raw';

type Props = {
  item: VideoResearch;
  accent?: Accent;
  onChanged: () => void;
};

const TABS: { id: Tab; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'study', label: 'Study' },
  { id: 'ai', label: 'AI Transcript' },
  { id: 'concepts', label: 'Key Concepts' },
  { id: 'raw', label: 'Raw Transcript' },
];

function ConceptsTable({ concepts }: { concepts: VideoResearch['key_concepts'] }) {
  if (concepts.length === 0) return <p className="text-xs text-zinc-400 dark:text-zinc-500">No concepts.</p>;
  return (
    <table className="w-full border-collapse text-xs">
      <tbody>
        {concepts.map((c, i) => (
          <tr key={i}>
            <td className="border border-zinc-200 dark:border-zinc-700 px-2.5 py-1.5 font-semibold align-top w-1/3 text-zinc-900 dark:text-zinc-50">{c.concept}</td>
            <td className="border border-zinc-200 dark:border-zinc-700 px-2.5 py-1.5 align-top text-zinc-700 dark:text-zinc-300">{c.definition}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Takeaways({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="text-xs text-zinc-400 dark:text-zinc-500">No takeaways.</p>;
  return (
    <ul className="list-disc pl-5 text-sm leading-6 text-zinc-700 dark:text-zinc-300 space-y-1">
      {items.map((t, i) => <li key={i}>{t}</li>)}
    </ul>
  );
}

export function VideoResearchItem({ item, accent = 'zinc', onChanged }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<Tab>('summary');
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(item.title);
  const [isPending, startTransition] = useTransition();

  const activeTab =
    accent === 'cyan'
      ? 'text-cyan-700 dark:text-cyan-300 border-cyan-500 dark:border-cyan-600'
      : 'text-zinc-900 dark:text-zinc-50 border-zinc-900 dark:border-zinc-50';
  const openBorder = expanded ? 'border-cyan-500 dark:border-cyan-600' : 'border-zinc-200 dark:border-zinc-800';

  const saveTitle = () => {
    const next = titleDraft.trim();
    if (!next || next === item.title) {
      setEditing(false);
      setTitleDraft(item.title);
      return;
    }
    startTransition(async () => {
      await updateVideoResearchTitle(item.id, next);
      setEditing(false);
      onChanged();
    });
  };

  const handleDelete = () => {
    if (!confirm('Remove this video?')) return;
    startTransition(async () => {
      await removeVideoResearch(item.id);
      onChanged();
    });
  };

  const handleRetry = () => {
    startTransition(async () => {
      await retryVideoResearch(item.id);
      onChanged();
    });
  };

  return (
    <div className={`border rounded-lg overflow-hidden bg-white dark:bg-zinc-900 ${openBorder}`}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setExpanded((o) => !o)}
          aria-label={expanded ? 'Collapse' : 'Expand'}
          className="text-zinc-400 dark:text-zinc-500"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform ${expanded ? 'rotate-90' : ''}`}>
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        {editing ? (
          <input
            value={titleDraft}
            autoFocus
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setEditing(false); setTitleDraft(item.title); } }}
            className="flex-1 px-2 py-1 text-sm rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 focus:outline-none"
          />
        ) : (
          <button type="button" onClick={() => setExpanded((o) => !o)} className="flex-1 text-left text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {item.title}
          </button>
        )}

        {item.status === 'processing' && (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300 flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 border-2 border-current border-t-transparent rounded-full animate-spin" /> Processing
          </span>
        )}
        {item.status === 'ready' && (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300">Ready</span>
        )}
        {item.status === 'error' && (
          <>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">Error</span>
            <button type="button" onClick={handleRetry} disabled={isPending} className="text-[11px] font-semibold text-red-600 dark:text-red-400 underline disabled:opacity-40">Retry</button>
          </>
        )}

        {!editing && (
          <button type="button" onClick={() => { setEditing(true); setTitleDraft(item.title); }} title="Edit title" className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z" /></svg>
          </button>
        )}
        <button type="button" onClick={handleDelete} disabled={isPending} title="Remove" className="text-zinc-400 hover:text-red-600 disabled:opacity-40">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
        </button>
      </div>

      {expanded && (
        <div className="border-t border-zinc-100 dark:border-zinc-800 p-3">
          {item.status === 'error' && (
            <p className="text-xs text-red-600 dark:text-red-400 mb-3">{item.error ?? 'Processing failed.'}</p>
          )}

          <div className="relative w-full mb-3" style={{ aspectRatio: '16 / 9' }}>
            <iframe
              className="absolute inset-0 w-full h-full rounded-lg border-0"
              src={`https://www.youtube.com/embed/${item.video_id}`}
              title={item.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>

          {item.status === 'processing' ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Generating study material…</p>
          ) : item.status === 'ready' ? (
            <>
              <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-700 px-1 flex-wrap">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                      tab === t.id ? activeTab : 'text-zinc-400 dark:text-zinc-500 border-transparent hover:text-zinc-600 dark:hover:text-zinc-300'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="pt-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
                {tab === 'summary' && <p>{item.summary}</p>}
                {tab === 'study' && (
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">Summary</p>
                      <p>{item.summary}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">Key Takeaways</p>
                      <Takeaways items={item.key_takeaways} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">Key Concepts</p>
                      <ConceptsTable concepts={item.key_concepts} />
                    </div>
                  </div>
                )}
                {tab === 'ai' && <p className="whitespace-pre-wrap">{item.ai_transcript}</p>}
                {tab === 'concepts' && <ConceptsTable concepts={item.key_concepts} />}
                {tab === 'raw' && <p className="whitespace-pre-wrap font-mono text-xs text-zinc-500 dark:text-zinc-400">{item.raw_transcript}</p>}
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
