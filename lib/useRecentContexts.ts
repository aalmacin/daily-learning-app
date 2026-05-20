'use client'

import { useState, useCallback } from 'react'

const STORAGE_KEY = 'recent-contexts'
const MAX_ENTRIES = 10

function readFromStorage(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function writeToStorage(entries: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // localStorage unavailable (e.g. SSR or private mode)
  }
}

export function useRecentContexts() {
  const [recentContexts, setRecentContexts] = useState<string[]>(() => readFromStorage())

  const saveContext = useCallback((context: string) => {
    const trimmed = context.trim()
    if (!trimmed) return
    setRecentContexts((prev) => {
      const filtered = prev.filter((c) => c.toLowerCase() !== trimmed.toLowerCase())
      const updated = [trimmed, ...filtered].slice(0, MAX_ENTRIES)
      writeToStorage(updated)
      return updated
    })
  }, [])

  return { recentContexts, saveContext }
}
