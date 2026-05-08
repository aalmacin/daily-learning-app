'use client'

import { usePWAInstall } from '@/hooks/usePWAInstall'

export function InstallButton() {
  const { canInstall, install } = usePWAInstall()
  if (!canInstall) return null

  return (
    <button
      onClick={install}
      className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50 transition-colors"
    >
      Install App
    </button>
  )
}
