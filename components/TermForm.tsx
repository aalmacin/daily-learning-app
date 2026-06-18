'use client'

import { useForm } from '@tanstack/react-form'
import { useState } from 'react'
import { explainTerm } from '@/actions/explain'
import { addPendingTerm, addPendingTerms, resolveTermResult, rejectTermResult } from '@/store/termStore'
import { useRecentContexts } from '@/lib/useRecentContexts'

type Mode = 'single' | 'multiple'

type Props = {
  defaultTerm?: string
  compact?: boolean
  onExplainComplete?: () => void
}

export function TermForm({ defaultTerm, compact, onExplainComplete }: Props = {}) {
  const [mode, setMode] = useState<Mode>('single')
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const { recentContexts, saveContext } = useRecentContexts()

  const singleForm = useForm({
    defaultValues: { termName: defaultTerm ?? '', context: '' },
    onSubmit: async ({ value }) => {
      setSubmitAttempted(false)
      const name = value.termName.trim().toLowerCase()
      addPendingTerm(name)
      saveContext(value.context)
      singleForm.setFieldValue('termName', '')
      try {
        const term = await explainTerm(value.termName, value.context || undefined)
        resolveTermResult(name, term)
        onExplainComplete?.()
      } catch (e) {
        rejectTermResult(name, e instanceof Error ? e.message : 'Something went wrong')
      }
    },
  })

  const multipleForm = useForm({
    defaultValues: { terms: '', context: '' },
    onSubmit: async ({ value }) => {
      const terms = value.terms
        .split('\n')
        .map((t) => t.trim())
        .filter((t) => t.length >= 2)
      if (terms.length === 0) return
      const names = terms.map((t) => t.toLowerCase())
      addPendingTerms(names)
      saveContext(value.context)
      multipleForm.setFieldValue('terms', '')
      terms.forEach((termName) => {
        const name = termName.toLowerCase()
        explainTerm(termName, value.context || undefined)
          .then((term) => resolveTermResult(name, term))
          .catch((e) => rejectTermResult(name, e instanceof Error ? e.message : 'Something went wrong'))
      })
    },
  })

  const inputClass =
    'w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-500'

  const datalistId = compact ? 'recent-contexts-list-compact' : 'recent-contexts-list'

  const singleModeForm = (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        setSubmitAttempted(true)
        singleForm.handleSubmit()
      }}
      className="flex flex-col gap-4"
    >
      <singleForm.Field
        name="termName"
        validators={{
          onChange: ({ value }) => {
            if (!value || value.trim().length === 0) return 'Term name is required'
            if (value.trim().length < 2) return 'Term name must be at least 2 characters'
            return undefined
          },
        }}
      >
        {(field) => (
          <div className="flex flex-col gap-1">
            <label htmlFor={field.name} className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Term
            </label>
            <input
              id={field.name}
              name={field.name}
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
              placeholder="e.g. dependency injection"
              className={inputClass}
            />
            {submitAttempted && field.state.meta.errors.length > 0 && (
              <p className="text-xs text-red-600 dark:text-red-400">{field.state.meta.errors[0]}</p>
            )}
          </div>
        )}
      </singleForm.Field>

      <singleForm.Field name="context">
        {(field) => (
          <div className="flex flex-col gap-1">
            <label htmlFor={field.name} className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Context <span className="text-zinc-400 dark:text-zinc-500 font-normal">(optional)</span>
            </label>
            <input
              id={field.name}
              name={field.name}
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
              placeholder="e.g. Kubernetes, AWS, React"
              list={datalistId}
              className={inputClass}
            />
          </div>
        )}
      </singleForm.Field>

      <singleForm.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <button
            type="submit"
            disabled={isSubmitting}
            className="self-start rounded-lg bg-zinc-900 dark:bg-zinc-50 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Explaining…' : 'Explain'}
          </button>
        )}
      </singleForm.Subscribe>
    </form>
  )

  const datalist = (
    <datalist id={datalistId}>
      {recentContexts.map((ctx) => (
        <option key={ctx} value={ctx} />
      ))}
    </datalist>
  )

  if (compact) {
    return (
      <>
        {singleModeForm}
        {datalist}
      </>
    )
  }

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
      <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-4">Explain a Term</h2>

      <div className="flex gap-1 mb-4 border-b border-zinc-200 dark:border-zinc-800">
        {(['single', 'multiple'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setMode(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              mode === tab
                ? 'border-zinc-900 dark:border-zinc-50 text-zinc-900 dark:text-zinc-50'
                : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {mode === 'single' ? (
        singleModeForm
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            multipleForm.handleSubmit()
          }}
          className="flex flex-col gap-4"
        >
          <multipleForm.Field
            name="terms"
            validators={{
              onChange: ({ value }) => {
                const valid = value
                  .split('\n')
                  .map((t) => t.trim())
                  .filter((t) => t.length >= 2)
                if (valid.length === 0) return 'Enter at least one term (min 2 characters)'
                return undefined
              },
            }}
          >
            {(field) => (
              <div className="flex flex-col gap-1">
                <label htmlFor={field.name} className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Terms (one per line)
                </label>
                <textarea
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  placeholder={'dependency injection\nmemoization\nclosure'}
                  rows={6}
                  className={`${inputClass} resize-y`}
                />
                {field.state.meta.errors.length > 0 && (
                  <p className="text-xs text-red-600 dark:text-red-400">{field.state.meta.errors[0]}</p>
                )}
              </div>
            )}
          </multipleForm.Field>

          <multipleForm.Field name="context">
            {(field) => (
              <div className="flex flex-col gap-1">
                <label htmlFor={field.name} className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Context <span className="text-zinc-400 dark:text-zinc-500 font-normal">(optional — applies to all terms)</span>
                </label>
                <input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  placeholder="e.g. Kubernetes, AWS, React"
                  list="recent-contexts-list"
                  className={inputClass}
                />
              </div>
            )}
          </multipleForm.Field>

          <button
            type="submit"
            className="self-start rounded-lg bg-zinc-900 dark:bg-zinc-50 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
          >
            Explain All
          </button>
        </form>
      )}

      {datalist}
    </div>
  )
}
