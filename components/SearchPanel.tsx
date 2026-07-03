'use client'

import { useEffect } from 'react'
import { useStore } from '@tanstack/react-store'
import { searchStore, closeSearch } from '@/store/searchStore'
import { AddPanel } from '@/components/AddPanel'

export function SearchPanel() {
  const isOpen = useStore(searchStore, (state) => state.isOpen)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && searchStore.state.isOpen) closeSearch()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <>
      <div
        aria-hidden="true"
        onClick={closeSearch}
        className={`fixed inset-0 z-40 bg-black/20 transition-opacity duration-300 sm:pointer-events-none ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      <div
        role="dialog"
        aria-label="Add"
        aria-modal={isOpen || undefined}
        aria-hidden={!isOpen}
        className={`fixed top-0 right-0 bottom-0 z-[55] w-full sm:w-[65vw] bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <span className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Add</span>
          <button
            type="button"
            onClick={closeSearch}
            aria-label="Close panel"
            className="rounded-lg p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-8 px-6">
          <div className="max-w-2xl mx-auto flex flex-col gap-8">
            <AddPanel />
          </div>
        </div>
      </div>
    </>
  )
}
