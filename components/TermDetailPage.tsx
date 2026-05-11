'use client';

import { useState, useEffect, useTransition } from 'react';
import Markdown from 'react-markdown';
import { useRouter } from 'next/navigation';
import type { ChatMessage, Term, ConceptRefinement } from '@/lib/db';
import {
  submitPreRefinement,
  submitRefinement,
  attachColdExplanation,
  createAttempt,
  addRefinementToNotion,
  setExplanationDate as saveExplanationDate,
} from '@/actions/refinements';
import { addToNotion } from '@/actions/notion';
import { askQuestion } from '@/actions/chat';

type Props = {
  term: Term;
  initialRefinements: ConceptRefinement[];
  initialChats: Record<number, ChatMessage[]>;
  explainedAt?: string | null;
};

type ViewMode = { type: 'form' } | { type: 'attempt'; index: number };

function accuracyColor(accuracy: number): string {
  if (accuracy >= 80) return 'text-green-600 dark:text-green-400';
  if (accuracy >= 50) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

function StepLabel({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-700 text-xs font-bold text-zinc-700 dark:text-zinc-200">
        {n}
      </span>
      <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
    </div>
  );
}

export function TermDetailPage({ term, initialRefinements, initialChats, explainedAt }: Props) {
  const router = useRouter();
  const [refinements, setRefinements] = useState(initialRefinements);
  const [viewMode, setViewMode] = useState<ViewMode>(
    initialRefinements.length === 0 ? { type: 'form' } : { type: 'attempt', index: 0 },
  );
  const [preText, setPreText] = useState('');
  const [coldText, setColdText] = useState('');
  const [refinementText, setRefinementText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notionDone, setNotionDone] = useState(false);
  const [notionPageId, setNotionPageId] = useState(term.notion_page_id);
  const computedDate = term.notion_date?.slice(0, 10) ?? explainedAt?.slice(0, 10) ?? '';
  const [explanationDate, setExplanationDate] = useState(computedDate);
  const [prevComputedDate, setPrevComputedDate] = useState(computedDate);
  if (computedDate !== prevComputedDate) {
    setPrevComputedDate(computedDate);
    setExplanationDate(computedDate);
  }
  const [dateSaveStatus, setDateSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [allChats, setAllChats] = useState<Record<number, ChatMessage[]>>(initialChats);
  const [chatInput, setChatInput] = useState('');

  const [, startDate] = useTransition();
  const [isPendingPre, startPre] = useTransition();
  const [isPendingCold, startCold] = useTransition();
  const [isPendingRefinement, startRefinement] = useTransition();
  const [isPendingNewAttempt, startNewAttempt] = useTransition();
  const [isPendingNotion, startNotion] = useTransition();
  const [isPendingTermNotion, startTermNotion] = useTransition();
  const [isPendingChat, startChat] = useTransition();

  const viewingIndex = viewMode.type === 'attempt' ? viewMode.index : 0;
  const viewing = viewMode.type === 'attempt' ? (refinements[viewingIndex] ?? null) : null;
  const isLatest = viewMode.type === 'attempt' && viewingIndex === 0;
  const latest = refinements[0] ?? null;

  const isComplete = (r: ConceptRefinement) => r.refinement_formatted_note !== null;
  const isAwaitingRefinement = (r: ConceptRefinement) =>
    r.refinement_formatted_note === null && (!r.pre_refinement || r.pre_refinement_accuracy !== null);

  const handleDateChange = (newDate: string) => {
    setExplanationDate(newDate);
    if (!newDate) return;
    setDateSaveStatus('saving');
    startDate(async () => {
      try {
        await saveExplanationDate(term.id, newDate);
        setDateSaveStatus('saved');
      } catch {
        setDateSaveStatus('idle');
      }
    });
  };

  const handleSubmitPre = () => {
    if (!preText.trim()) return;
    setError(null);
    startPre(async () => {
      try {
        const result = await submitPreRefinement(term.id, preText.trim());
        setRefinements((prev) => [result, ...prev]);
        setViewMode({ type: 'attempt', index: 0 });
        setPreText('');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to submit');
      }
    });
  };

  const handleAttachCold = () => {
    if (!coldText.trim() || !latest) return;
    setError(null);
    startCold(async () => {
      try {
        const result = await attachColdExplanation(latest.id, term.id, coldText.trim());
        setRefinements((prev) => [result, ...prev.slice(1)]);
        setColdText('');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to submit');
      }
    });
  };

  const handleSubmitRefinement = () => {
    if (!refinementText.trim() || !latest) return;
    setError(null);
    startRefinement(async () => {
      try {
        const result = await submitRefinement(latest.id, term.id, refinementText.trim());
        setRefinements((prev) => [result, ...prev.slice(1)]);
        setRefinementText('');
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to submit');
      }
    });
  };

  const handleAddToNotion = (refinementId: number) => {
    setError(null);
    setNotionDone(false);
    startNotion(async () => {
      try {
        await addRefinementToNotion(term.id, refinementId);
        setNotionDone(true);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to add to Notion');
      }
    });
  };

  const handleStartNewAttempt = () => {
    setError(null);
    setNotionDone(false);
    startNewAttempt(async () => {
      try {
        const result = await createAttempt(term.id);
        setRefinements((prev) => [result, ...prev]);
        setViewMode({ type: 'attempt', index: 0 });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to start new attempt');
      }
    });
  };

  const handleAddTermToNotion = () => {
    setError(null);
    startTermNotion(async () => {
      try {
        const updated = await addToNotion(term.id, {
          name: term.name,
          content: term.content,
          categories: term.categories,
          priority: term.priority,
        });
        setNotionPageId(updated.notion_page_id);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to add to Notion');
      }
    });
  };

  const handleAskQuestion = (refinementId: number) => {
    const question = chatInput.trim();
    if (!question) return;
    // Optimistically add user message
    setAllChats((prev) => ({
      ...prev,
      [refinementId]: [
        ...(prev[refinementId] ?? []),
        { id: -1, refinement_id: refinementId, role: 'user' as const, content: question, created_at: new Date().toISOString() },
      ],
    }));
    setChatInput('');
    startChat(async () => {
      try {
        const updated = await askQuestion(refinementId, question);
        setAllChats((prev) => ({ ...prev, [refinementId]: updated }));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to send message');
        // Revert optimistic update on error
        setAllChats((prev) => ({
          ...prev,
          [refinementId]: (prev[refinementId] ?? []).filter((m) => m.id !== -1),
        }));
      }
    });
  };

  const handleStartResearch = () => {
    const question = chatInput.trim();
    if (!question) return;
    setError(null);
    setChatInput('');
    startChat(async () => {
      try {
        const newAttempt = await createAttempt(term.id);
        setRefinements((prev) => [newAttempt, ...prev]);
        setViewMode({ type: 'attempt', index: 0 });
        setAllChats((prev) => ({
          ...prev,
          [newAttempt.id]: [{ id: -1, refinement_id: newAttempt.id, role: 'user' as const, content: question, created_at: new Date().toISOString() }],
        }));
        const updated = await askQuestion(newAttempt.id, question);
        setAllChats((prev) => ({ ...prev, [newAttempt.id]: updated }));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to start research');
        setChatInput(question);
      }
    });
  };

  return (
    <div className="bg-zinc-50 dark:bg-black p-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{term.name}</h1>

        {/* Term card */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {term.categories.map((cat) => (
              <span
                key={cat}
                className="px-2 py-0.5 text-xs rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
              >
                {cat}
              </span>
            ))}
            <span
              className={`ml-auto text-xs font-medium ${
                term.priority === 'High'
                  ? 'text-red-600 dark:text-red-400'
                  : term.priority === 'Low'
                    ? 'text-zinc-400 dark:text-zinc-500'
                    : 'text-yellow-600 dark:text-yellow-400'
              }`}
            >
              {term.priority}
            </span>
          </div>
          <p className="text-sm leading-6 text-zinc-700 dark:text-zinc-300">{term.content}</p>
        </div>

        {/* Feynman Method */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 space-y-6">
          {/* Section header */}
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              Feynman Method
            </h2>
            {refinements.length > 0 && viewMode.type === 'attempt' && (
              <select
                value={viewingIndex}
                onChange={(e) => setViewMode({ type: 'attempt', index: Number(e.target.value) })}
                className="text-xs border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 focus:outline-none"
              >
                {refinements.map((_, i) => (
                  <option key={i} value={i}>
                    {i === 0
                      ? `Attempt ${refinements.length} (latest)`
                      : `Attempt ${refinements.length - i}`}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Explanation date — always visible once term is in Notion */}
          {notionPageId && (
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 shrink-0">
                Explanation Date
              </label>
              <input
                type="date"
                value={explanationDate}
                onChange={(e) => handleDateChange(e.target.value)}
                className="px-3 py-1.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-600"
              />
              {dateSaveStatus === 'saving' && (
                <span className="text-xs text-zinc-400 dark:text-zinc-500">Saving…</span>
              )}
              {dateSaveStatus === 'saved' && (
                <span className="text-xs text-zinc-400 dark:text-zinc-500">Saved</span>
              )}
            </div>
          )}

          {/* Notion gate — only required for cold explanation */}
          {!notionPageId && viewMode.type === 'form' && (
            <div className="space-y-3">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Add this term to Notion to use the cold explanation step.
              </p>
              {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
              <button
                onClick={handleAddTermToNotion}
                disabled={isPendingTermNotion}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isPendingTermNotion ? 'Adding to Notion…' : 'Add to Notion'}
              </button>
            </div>
          )}

          {/* Step 1 — Pre-refinement form (first attempt only, requires Notion) */}
          {notionPageId && viewMode.type === 'form' && (
            <div className="space-y-3">
              <StepLabel n={1} label="Cold Explanation" />
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Explain <strong>{term.name}</strong> without looking anything up.
              </p>
              <textarea
                value={preText}
                onChange={(e) => setPreText(e.target.value)}
                rows={5}
                placeholder="Write everything you know about this concept…"
                className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-600 resize-none"
              />
              {error && (
                <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
              )}
              <button
                onClick={handleSubmitPre}
                disabled={!preText.trim() || isPendingPre}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isPendingPre ? 'Evaluating…' : 'Submit'}
              </button>
            </div>
          )}

          {/* Step 2 — Research available in form mode without cold start */}
          {viewMode.type === 'form' && (
            <div className="space-y-3">
              <StepLabel n={2} label="Research" />
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Do your research now, then come back to explain the concept again. Ask questions below as you study.
              </p>
              {error && (
                <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleStartResearch()}
                  placeholder={`Ask a question about ${term.name}…`}
                  disabled={isPendingChat}
                  className="flex-1 px-3 py-2 text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-600 disabled:opacity-50"
                />
                <button
                  onClick={handleStartResearch}
                  disabled={!chatInput.trim() || isPendingChat}
                  className="px-3 py-2 text-xs font-medium rounded-lg bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {isPendingChat ? 'Starting…' : 'Ask'}
                </button>
              </div>
            </div>
          )}

          {/* Attempt view */}
          {viewMode.type === 'attempt' && viewing && (
            <div className="space-y-6">
              {/* Step 1 — Cold Explanation */}
              {viewing.pre_refinement ? (
                <div className="space-y-3">
                  <StepLabel n={1} label="Cold Explanation" />
                  <div className="rounded-lg bg-zinc-50 dark:bg-zinc-900 p-4 space-y-3">
                    <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-6">
                      {viewing.pre_refinement}
                    </p>
                    {viewing.pre_refinement_accuracy !== null && (
                      <div className="pt-3 border-t border-zinc-200 dark:border-zinc-700 space-y-1">
                        <p className={`text-sm font-semibold ${accuracyColor(viewing.pre_refinement_accuracy)}`}>
                          Accuracy: {viewing.pre_refinement_accuracy}%
                        </p>
                        <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-5">
                          {viewing.pre_refinement_review}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : isLatest && !isComplete(viewing) && refinements.length === 1 ? (
                <div className="space-y-3">
                  <StepLabel n={1} label="Cold Explanation" />
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Explain <strong>{term.name}</strong> without looking anything up. Required before writing the refined explanation.
                  </p>
                  <textarea
                    value={coldText}
                    onChange={(e) => setColdText(e.target.value)}
                    rows={5}
                    placeholder="Write everything you know about this concept…"
                    className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-600 resize-none"
                  />
                  {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
                  <button
                    onClick={handleAttachCold}
                    disabled={!coldText.trim() || isPendingCold}
                    className="px-4 py-2 text-sm font-medium rounded-lg bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {isPendingCold ? 'Evaluating…' : 'Submit'}
                  </button>
                </div>
              ) : null}

              {/* Step 2 — Research chat (always available) */}
              <div className="space-y-3">
                <StepLabel n={2} label="Research" />
                {!isComplete(viewing) && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Do your research now, then come back to explain the concept again. Ask questions below as you study.
                  </p>
                )}
                {/* Previous attempts' research chats shown as reference */}
                {refinements.slice(viewingIndex + 1).some((r) => (allChats[r.id] ?? []).length > 0) && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                      Prior Research
                    </p>
                    {refinements.slice(viewingIndex + 1).map((r, offset) => {
                      const chats = allChats[r.id] ?? [];
                      if (chats.length === 0) return null;
                      const attemptNumber = refinements.length - (viewingIndex + 1 + offset);
                      return (
                        <div key={r.id} className="space-y-2">
                          <p className="text-xs text-zinc-400 dark:text-zinc-500">Attempt {attemptNumber}</p>
                          <div className="space-y-1.5 max-h-60 overflow-y-auto rounded-lg border border-zinc-100 dark:border-zinc-800 p-3 opacity-60">
                            {chats.map((msg) => (
                              <div
                                key={msg.id}
                                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                              >
                                <p
                                  className={`max-w-[85%] rounded-lg px-3 py-2 text-xs leading-5 ${
                                    msg.role === 'user'
                                      ? 'bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900'
                                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                                  }`}
                                >
                                  {msg.content}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {/* Chat messages */}
                {(allChats[viewing.id] ?? []).length > 0 && (
                  <div className="space-y-2 max-h-80 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-700 p-3">
                    {(allChats[viewing.id] ?? []).map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <p
                          className={`max-w-[85%] rounded-lg px-3 py-2 text-xs leading-5 ${
                            msg.role === 'user'
                              ? 'bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900'
                              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                          }`}
                        >
                          {msg.content}
                        </p>
                      </div>
                    ))}
                    {isPendingChat && (
                      <div className="flex justify-start">
                        <p className="max-w-[85%] rounded-lg px-3 py-2 text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500">
                          Thinking…
                        </p>
                      </div>
                    )}
                  </div>
                )}
                {/* Chat input */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleAskQuestion(viewing.id)}
                    placeholder={`Ask a question about ${term.name}…`}
                    disabled={isPendingChat}
                    className="flex-1 px-3 py-2 text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-600 disabled:opacity-50"
                  />
                  <button
                    onClick={() => handleAskQuestion(viewing.id)}
                    disabled={!chatInput.trim() || isPendingChat}
                    className="px-3 py-2 text-xs font-medium rounded-lg bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Ask
                  </button>
                </div>
              </div>

              {/* Step 3 — Refinement (requires cold explanation evaluation, or skipped if no cold explanation) */}
              {(!viewing.pre_refinement || viewing.pre_refinement_accuracy !== null) && (
                <div className="space-y-3">
                  <StepLabel n={3} label="Refined Explanation" />

                  {/* Incomplete non-latest: nothing was saved */}
                  {!isLatest && isAwaitingRefinement(viewing) && (
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">
                      This attempt did not complete — no data was saved.
                    </p>
                  )}

                  {/* Form — only on latest incomplete attempt */}
                  {isLatest && isAwaitingRefinement(viewing) && (
                    <>
                      <textarea
                        value={refinementText}
                        onChange={(e) => setRefinementText(e.target.value)}
                        rows={5}
                        placeholder="Explain the concept again after researching…"
                        className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-600 resize-none"
                      />
                      {error && (
                        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
                      )}
                      <button
                        onClick={handleSubmitRefinement}
                        disabled={!refinementText.trim() || isPendingRefinement}
                        className="px-4 py-2 text-sm font-medium rounded-lg bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {isPendingRefinement ? 'Evaluating…' : 'Submit'}
                      </button>
                    </>
                  )}

                  {/* Results */}
                  {isComplete(viewing) && (
                    <div className="space-y-5">
                      <div className="rounded-lg bg-zinc-50 dark:bg-zinc-900 p-4 space-y-3">
                        <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-6">
                          {viewing.refinement}
                        </p>
                        <div className="pt-3 border-t border-zinc-200 dark:border-zinc-700 space-y-1">
                          <p className={`text-sm font-semibold ${accuracyColor(viewing.refinement_accuracy!)}`}>
                            Accuracy: {viewing.refinement_accuracy}%
                          </p>
                          <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-5">
                            {viewing.refinement_review}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                          Formatted Note
                        </p>
                        <div className="rounded-lg bg-zinc-50 dark:bg-zinc-900 px-4 py-3">
                          <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-6 whitespace-pre-wrap">
                            {viewing.refinement_formatted_note}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                          Additional Notes
                        </p>
                        <div className="rounded-lg bg-zinc-50 dark:bg-zinc-900 px-4 py-3 prose prose-sm dark:prose-invert max-w-none text-zinc-700 dark:text-zinc-300">
                          <Markdown>{viewing.refinement_additional_note ?? ''}</Markdown>
                        </div>
                      </div>

                      {/* Actions — only on latest */}
                      {isLatest && (
                        <div className="flex flex-wrap items-center gap-3 pt-1">
                          <button
                            onClick={() => handleAddToNotion(viewing.id)}
                            disabled={isPendingNotion || notionDone}
                            className="px-4 py-2 text-sm font-medium rounded-lg bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            {isPendingNotion ? 'Adding…' : notionDone ? 'Added to Notion ✓' : 'Add to Notion'}
                          </button>
                          <button
                            onClick={handleStartNewAttempt}
                            disabled={isPendingNewAttempt}
                            className="px-4 py-2 text-sm font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            {isPendingNewAttempt ? 'Starting…' : 'Start New Attempt'}
                          </button>
                          {error && (
                            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
