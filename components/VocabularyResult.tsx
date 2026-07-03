'use client'

import { useState } from 'react'
import { useStore } from '@tanstack/react-store'
import { vocabStore, dismissWord, removeWordFromStore, updateWordImageInStore, type VocabResult, type DoneVocabResult } from '@/store/vocabStore'
import { removeVocabularyWord } from '@/actions/vocabulary'
import { VocabularyImage } from '@/components/VocabularyImage'

function DismissButton({ onDismiss }: { onDismiss: () => void }) {
  return (
    <button
      onClick={onDismiss}
      aria-label="Dismiss"
      className="ml-auto shrink-0 rounded p-1 text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  )
}

function ProcessingCard({ word, vocabKey }: { word: string; vocabKey: string }) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 flex items-center gap-3">
      <svg
        className="animate-spin h-4 w-4 text-zinc-400 dark:text-zinc-500 shrink-0"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{word}</span>
      <span className="text-sm text-zinc-400 dark:text-zinc-500">Analyzing…</span>
      <DismissButton onDismiss={() => dismissWord(vocabKey)} />
    </div>
  )
}

function ErrorCard({ word, error, vocabKey }: { word: string; error: string; vocabKey: string }) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-red-200 dark:border-red-900 p-6 flex flex-col gap-2">
      <div className="flex items-center">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{word}</span>
        <DismissButton onDismiss={() => dismissWord(vocabKey)} />
      </div>
      <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
    </div>
  )
}

function Section({ title, content }: { title: string; content: string }) {
  return (
    <div className="pt-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">
        {title}
      </h4>
      <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
        {content}
      </p>
    </div>
  )
}

function DoneVocabCard({ entry }: { entry: DoneVocabResult }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await removeVocabularyWord(entry.id)
      removeWordFromStore(entry.id)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-950 overflow-hidden">
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
      >
        <span className="font-medium text-zinc-900 dark:text-zinc-100">{entry.word}</span>
        <span className="text-zinc-400 dark:text-zinc-500 text-sm">{isExpanded ? '−' : '+'}</span>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-zinc-100 dark:border-zinc-800">
          <Section title="Definition" content={entry.definition} />
          <Section title="Context" content={entry.context} />
          <Section title="Connections" content={entry.connections} />
          <Section title="Morphology" content={entry.morphology} />
          <VocabularyImage
            wordId={entry.id}
            word={entry.word}
            imageUrl={entry.image_url}
            imageModel={entry.image_model}
            onGenerated={(imageUrl, imageModel) => updateWordImageInStore(entry.id, imageUrl, imageModel)}
          />
          <div className="pt-2 flex items-center gap-3">
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-40"
            >
              {isDeleting ? 'Deleting…' : 'Delete'}
            </button>
            <button
              onClick={() => dismissWord(entry.key)}
              className="text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function VocabCard({ entry }: { entry: VocabResult }) {
  if (entry.status === 'processing') return <ProcessingCard word={entry.word} vocabKey={entry.key} />
  if (entry.status === 'error') return <ErrorCard word={entry.word} error={entry.error} vocabKey={entry.key} />
  return <DoneVocabCard entry={entry} />
}

export function VocabularyResult() {
  const { activeWords, isResultVisible } = useStore(vocabStore, (state) => ({
    activeWords: state.activeWords,
    isResultVisible: state.isResultVisible,
  }))

  if (!isResultVisible || activeWords.length === 0) return null

  return (
    <div className="flex flex-col gap-4">
      {activeWords.map((entry) => (
        <VocabCard key={entry.status === 'done' ? entry.id : entry.key} entry={entry} />
      ))}
    </div>
  )
}
