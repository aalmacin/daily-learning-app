'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { signOut } from '@/actions/auth';

const NAV_LINKS = [
  { href: '/terms', label: 'Terms' },
  { href: '/term-list', label: 'Term List' },
  { href: '/flashcards', label: 'Flashcards' },
  { href: '/categories', label: 'Categories' },
  { href: '/settings', label: 'Settings' },
] as const;

export default function NavMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className="flex flex-col justify-center items-center w-8 h-8 gap-1.5"
        aria-label={isOpen ? 'Close menu' : 'Open menu'}
      >
        <span className={`block w-5 h-0.5 bg-zinc-600 dark:bg-zinc-400 transition-transform duration-200 ${isOpen ? 'translate-y-2 rotate-45' : ''}`} />
        <span className={`block w-5 h-0.5 bg-zinc-600 dark:bg-zinc-400 transition-opacity duration-200 ${isOpen ? 'opacity-0' : ''}`} />
        <span className={`block w-5 h-0.5 bg-zinc-600 dark:bg-zinc-400 transition-transform duration-200 ${isOpen ? '-translate-y-2 -rotate-45' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-44 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-lg z-50 overflow-hidden">
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setIsOpen(false)}
              className="block px-4 py-2.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors border-b border-zinc-100 dark:border-zinc-800 last:border-0"
            >
              {label}
            </Link>
          ))}
          <form action={signOut}>
            <button
              type="submit"
              onClick={() => setIsOpen(false)}
              className="w-full text-left px-4 py-2.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors border-t border-zinc-100 dark:border-zinc-800"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
