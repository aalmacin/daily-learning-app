'use client';

import { useRouter, useSearchParams } from 'next/navigation';

export function SearchBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams.get('q') ?? '';

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const trimmed = (formData.get('q') as string).trim();
    if (trimmed) {
      router.push(`/terms?q=${encodeURIComponent(trimmed)}`);
    } else {
      router.push('/terms');
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 min-w-[120px] max-w-[280px] w-[30%]"
    >
      <svg
        className="shrink-0 text-zinc-400 dark:text-zinc-500"
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        key={q}
        type="text"
        name="q"
        aria-label="Search terms"
        defaultValue={q}
        placeholder="Search terms…"
        className="flex-1 bg-transparent text-sm text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none min-w-0"
      />
    </form>
  );
}
