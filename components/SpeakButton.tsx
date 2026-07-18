'use client';

import { useSyncExternalStore } from 'react';
import { isSpeechSupported, speak } from '@/lib/speech';

const noopSubscribe = () => () => {};

type Props = {
  text: string;
  label?: string;
  className?: string;
};

export function SpeakButton({ text, label, className = '' }: Props) {
  const supported = useSyncExternalStore(noopSubscribe, isSpeechSupported, () => false);

  if (!supported) return null;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    speak(text);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`shrink-0 p-1 text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400 transition-colors ${className}`}
      aria-label={label ?? `Read "${text}" aloud`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      </svg>
    </button>
  );
}
