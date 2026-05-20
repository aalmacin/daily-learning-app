'use client';

import { useState, useEffect, useRef } from 'react';

type CategoryMultiSelectDropdownProps = {
  categories: string[];
  selected: string[];
  onChange: (cats: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
};

export function CategoryMultiSelectDropdown({
  categories,
  selected,
  onChange,
  disabled,
  placeholder = 'Categories',
}: CategoryMultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = categories.filter((c) => c.toLowerCase().includes(search.toLowerCase()));

  const toggle = (cat: string) =>
    onChange(selected.includes(cat) ? selected.filter((c) => c !== cat) : [...selected, cat]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {selected.length > 0 ? `${selected.length} categor${selected.length === 1 ? 'y' : 'ies'}` : placeholder}
        <span className="text-zinc-400">▾</span>
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-56 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg">
          <div className="p-2 border-b border-zinc-100 dark:border-zinc-800">
            <input
              type="text"
              placeholder="Search categories…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-2 py-1.5 text-xs rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-600"
              autoFocus
            />
          </div>
          <ul className="max-h-48 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-xs text-zinc-400">No categories found</li>
            ) : (
              filtered.map((cat) => (
                <li key={cat}>
                  <label className="flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.includes(cat)}
                      onChange={() => toggle(cat)}
                      className="accent-zinc-900 dark:accent-zinc-50"
                    />
                    {cat}
                  </label>
                </li>
              ))
            )}
          </ul>
          {selected.length > 0 && (
            <div className="p-2 border-t border-zinc-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
