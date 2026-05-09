'use client'

import { useState, useEffect } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

declare global {
  interface Window {
    __pwaInstallPrompt: BeforeInstallPromptEvent | null
  }
}

export function usePWAInstall() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    // Pick up the event if it already fired before React mounted
    if (window.__pwaInstallPrompt) {
      setPromptEvent(window.__pwaInstallPrompt)
    }

    const onReady = () => {
      if (window.__pwaInstallPrompt) setPromptEvent(window.__pwaInstallPrompt)
    }
    window.addEventListener('pwaInstallPromptReady', onReady)
    return () => window.removeEventListener('pwaInstallPromptReady', onReady)
  }, [])

  const install = async () => {
    if (!promptEvent) return
    await promptEvent.prompt()
    const { outcome } = await promptEvent.userChoice
    if (outcome === 'accepted') {
      setPromptEvent(null)
      window.__pwaInstallPrompt = null
    }
  }

  return { canInstall: !!promptEvent, install }
}
