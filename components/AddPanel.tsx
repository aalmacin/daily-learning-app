'use client'

import { useState } from 'react'
import { TermForm } from '@/components/TermForm'
import { TermResult } from '@/components/TermResult'
import { VocabularyForm } from '@/components/VocabularyForm'
import { VocabularyResult } from '@/components/VocabularyResult'

type Tab = 'explain' | 'vocabulary'

export function AddPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('explain')

  return (
    <div className="flex flex-col gap-8">
      <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
        {([
          { id: 'explain', label: 'Explain a Term' },
          { id: 'vocabulary', label: 'Vocabulary' },
        ] as { id: Tab; label: string }[]).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'border-zinc-900 dark:border-zinc-50 text-zinc-900 dark:text-zinc-50'
                : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'explain' ? (
        <>
          <TermForm />
          <TermResult />
        </>
      ) : (
        <>
          <VocabularyForm />
          <VocabularyResult />
        </>
      )}
    </div>
  )
}
