'use client';

import { useState } from 'react';
import Link from 'next/link';
import { signOut } from '@/actions/auth';

export default function NavMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const close = () => setIsOpen(false);

  const links = (
    <>
      <Link href="/terms" onClick={close} className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50 transition-colors">
        Terms
      </Link>
      <Link href="/categories" onClick={close} className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50 transition-colors">
        Categories
      </Link>
      <Link href="/review" onClick={close} className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50 transition-colors">
        Review
      </Link>
      <Link href="/settings" onClick={close} className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50 transition-colors">
        Settings
      </Link>
      <form action={signOut}>
        <button type="submit" className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50 transition-colors">
          Sign out
        </button>
      </form>
    </>
  );

  return (
    <>
      {/* Desktop nav */}
      <nav className="hidden md:flex items-center gap-4">
        {links}
      </nav>

      {/* Mobile hamburger button */}
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className="md:hidden flex flex-col justify-center items-center w-8 h-8 gap-1.5"
        aria-label={isOpen ? 'Close menu' : 'Open menu'}
      >
        <span className={`block w-5 h-0.5 bg-zinc-600 dark:bg-zinc-400 transition-transform duration-200 ${isOpen ? 'translate-y-2 rotate-45' : ''}`} />
        <span className={`block w-5 h-0.5 bg-zinc-600 dark:bg-zinc-400 transition-opacity duration-200 ${isOpen ? 'opacity-0' : ''}`} />
        <span className={`block w-5 h-0.5 bg-zinc-600 dark:bg-zinc-400 transition-transform duration-200 ${isOpen ? '-translate-y-2 -rotate-45' : ''}`} />
      </button>

      {/* Mobile dropdown */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={close}
            aria-hidden="true"
          />
          <nav className="absolute top-full left-0 right-0 z-50 flex flex-col gap-0 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 shadow-lg">
            {[
              { href: '/terms', label: 'Terms' },
              { href: '/categories', label: 'Categories' },
              { href: '/review', label: 'Review' },
              { href: '/settings', label: 'Settings' },
            ].map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                onClick={close}
                className="px-6 py-3 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 border-t border-zinc-100 dark:border-zinc-800 transition-colors"
              >
                {label}
              </Link>
            ))}
            <form action={signOut} className="border-t border-zinc-100 dark:border-zinc-800" onSubmit={close}>
              <button
                type="submit"
                className="w-full text-left px-6 py-3 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Sign out
              </button>
            </form>
          </nav>
        </>
      )}
    </>
  );
}
