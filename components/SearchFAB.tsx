'use client'

import { useStore } from '@tanstack/react-store'
import { searchStore, toggleSearch } from '@/store/searchStore'

export function SearchFAB() {
  const isOpen = useStore(searchStore, (state) => state.isOpen)

  return (
    <button
      type="button"
      onClick={toggleSearch}
      aria-label={isOpen ? 'Close search' : 'Open search'}
      className="fixed bottom-6 right-6 z-[60] flex h-[52px] w-[52px] items-center justify-center rounded-full bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 shadow-lg hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
    >
      {isOpen ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      )}
    </button>
  )
}
