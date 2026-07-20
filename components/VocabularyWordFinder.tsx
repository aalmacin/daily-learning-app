'use client'

import { useState } from 'react'
import { findVocabularyCandidates } from '@/actions/vocabulary'
import { addPendingWords, processVocabularyWord } from '@/store/vocabStore'
import type { VocabularyCandidate } from '@/lib/openai'

function candidateKey(candidate: VocabularyCandidate): string {
  return `${candidate.word.toLowerCase()}-${candidate.type}`
}

export function VocabularyWordFinder() {
  const [sentence, setSentence] = useState('')
  const [candidates, setCandidates] = useState<VocabularyCandidate[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [addedKeys, setAddedKeys] = useState<Set<string>>(new Set())

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = sentence.trim()
    if (!trimmed) return
    setError(null)
    setIsPending(true)
    try {
      const result = await findVocabularyCandidates(trimmed)
      setCandidates(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsPending(false)
    }
  }

  function handleAdd(candidate: VocabularyCandidate) {
    const key = crypto.randomUUID()
    addPendingWords([{ key, word: candidate.word, type: candidate.type }])
    processVocabularyWord(key, candidate.word, candidate.type)
    setAddedKeys((prev) => new Set(prev).add(candidateKey(candidate)))
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <label htmlFor="word-finder-sentence" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Describe what you mean
        </label>
        <textarea
          id="word-finder-sentence"
          value={sentence}
          onChange={(e) => setSentence(e.target.value)}
          placeholder="a word for when you do something bad but on purpose to look good later"
          rows={3}
          disabled={isPending}
          className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-500 resize-y disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!sentence.trim() || isPending}
          className="self-start rounded-lg bg-zinc-900 dark:bg-zinc-50 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? 'Finding…' : 'Find'}
        </button>
      </form>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {candidates !== null && candidates.length === 0 && !error && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No matches — try rephrasing.</p>
      )}

      {candidates !== null && candidates.length > 0 && (
        <div className="flex flex-col gap-3">
          {candidates.map((candidate) => {
            const key = candidateKey(candidate)
            const added = addedKeys.has(key)
            return (
              <div
                key={key}
                className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 flex flex-col gap-2"
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">{candidate.word}</span>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 capitalize">
                      {candidate.type}
                    </span>
                  </span>
                  <button
                    onClick={() => handleAdd(candidate)}
                    disabled={added}
                    className="text-xs font-medium rounded-md px-3 py-1.5 bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {added ? 'Added' : 'Add'}
                  </button>
                </div>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">{candidate.example}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
