'use client'

import { useForm } from '@tanstack/react-form'
import { useState } from 'react'
import { addVocabularyWord } from '@/actions/vocabulary'
import { addPendingWords, resolveVocabResult, rejectVocabResult } from '@/store/vocabStore'

type WordType = 'word' | 'idiom'

type Props = {
  defaultWord?: string
  compact?: boolean
  onAdded?: () => void
}

export function VocabularyForm({ defaultWord, compact, onAdded }: Props = {}) {
  const [type, setType] = useState<WordType>('word')

  const form = useForm({
    defaultValues: { entries: defaultWord ?? '' },
    onSubmit: async ({ value }) => {
      const words = value.entries
        .split('\n')
        .map((t) => t.trim())
        .filter((t) => t.length >= 2)
      if (words.length === 0) return

      const keyed = words.map((word) => ({ key: crypto.randomUUID(), word, type }))
      addPendingWords(keyed)
      form.setFieldValue('entries', '')

      keyed.forEach(({ key, word }) => {
        addVocabularyWord(word, type)
          .then((w) => {
            resolveVocabResult(key, w)
            onAdded?.()
          })
          .catch((e) => rejectVocabResult(key, e instanceof Error ? e.message : 'Something went wrong'))
      })
    },
  })

  const inputClass =
    'w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-500'

  const typeTabs = (
    <div className={`flex gap-1 border-b border-zinc-200 dark:border-zinc-800 ${compact ? '' : 'mb-4'}`}>
      {(['word', 'idiom'] as const).map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => setType(tab)}
          className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
            type === tab
              ? 'border-zinc-900 dark:border-zinc-50 text-zinc-900 dark:text-zinc-50'
              : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
          }`}
        >
          {tab === 'word' ? 'Word' : 'Idiom'}
        </button>
      ))}
    </div>
  )

  const entriesForm = (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
      className="flex flex-col gap-4"
    >
      <form.Field
        name="entries"
        validators={{
          onChange: ({ value }) => {
            const valid = value
              .split('\n')
              .map((t) => t.trim())
              .filter((t) => t.length >= 2)
            if (valid.length === 0) return 'Enter at least one entry (min 2 characters)'
            return undefined
          },
        }}
      >
        {(field) => (
          <div className="flex flex-col gap-1">
            {!compact && (
              <label htmlFor={field.name} className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {type === 'word' ? 'Words' : 'Idioms'} (one per line)
              </label>
            )}
            <textarea
              id={field.name}
              name={field.name}
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
              placeholder={type === 'word' ? 'serendipity\nepiphany\ntenacious' : 'bite the bullet\nspill the beans\nhit the nail on the head'}
              rows={compact ? 2 : 6}
              className={`${inputClass} resize-y`}
            />
            {field.state.meta.errors.length > 0 && (
              <p className="text-xs text-red-600 dark:text-red-400">{field.state.meta.errors[0]}</p>
            )}
          </div>
        )}
      </form.Field>

      <button
        type="submit"
        className="self-start rounded-lg bg-zinc-900 dark:bg-zinc-50 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
      >
        {compact ? 'Add' : 'Add All'}
      </button>
    </form>
  )

  if (compact) {
    return (
      <div className="flex flex-col gap-3">
        {typeTabs}
        {entriesForm}
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
      <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-4">Add Vocabulary</h2>
      {typeTabs}
      {entriesForm}
    </div>
  )
}
