'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { addCategory, removeCategory } from '@/actions/categories';
import type { Category } from '@/lib/db';

export function CategoriesManager({ initialData }: { initialData: Category[] }) {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [removeSuccess, setRemoveSuccess] = useState(false);

  const { data: categories = initialData } = useQuery({
    queryKey: queryKeys.categories.all(),
    queryFn: async () => initialData,
    initialData,
  });

  const addMutation = useMutation({
    mutationFn: (name: string) => addCategory(name),
    onSuccess: (category) => {
      queryClient.setQueryData<Category[]>(queryKeys.categories.all(), (prev = []) =>
        [...prev, category].sort((a, b) => a.name.localeCompare(b.name))
      );
      setNewName('');
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => removeCategory(id),
    onSuccess: (_, id) => {
      queryClient.setQueryData<Category[]>(queryKeys.categories.all(), (prev = []) =>
        prev.filter((c) => c.id !== id)
      );
      setRemoveSuccess(true);
      setTimeout(() => setRemoveSuccess(false), 3000);
    },
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    addMutation.mutate(newName.trim());
  };

  return (
    <div className="space-y-6">
      {removeSuccess && (
        <p className="text-sm text-green-600 dark:text-green-400">Category removed successfully.</p>
      )}
      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New category name…"
          className="flex-1 px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-600"
        />
        <button
          type="submit"
          disabled={addMutation.isPending || !newName.trim()}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {addMutation.isPending ? 'Adding…' : 'Add'}
        </button>
      </form>

      {addMutation.error && (
        <p className="text-sm text-red-600 dark:text-red-400">
          {addMutation.error instanceof Error ? addMutation.error.message : 'Failed to add category'}
        </p>
      )}

      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        {categories.length === 0 ? (
          <li className="px-4 py-6 text-sm text-center text-zinc-400 dark:text-zinc-600">
            No categories yet.
          </li>
        ) : (
          categories.map((cat) => {
            const isRemoving = removeMutation.isPending && removeMutation.variables === cat.id;
            const isConfirming = confirmingId === cat.id;
            return (
              <li key={cat.id} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-zinc-800 dark:text-zinc-200">{cat.name}</span>
                <div className="flex items-center gap-3">
                  <Link
                    href={`/categories/${cat.id}`}
                    className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                  >
                    View Terms
                  </Link>
                  {isConfirming ? (
                    <>
                      <button
                        onClick={() => { removeMutation.mutate(cat.id); setConfirmingId(null); }}
                        disabled={isRemoving}
                        className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 disabled:opacity-50 transition-colors"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setConfirmingId(null)}
                        className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmingId(cat.id)}
                      disabled={isRemoving}
                      className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 disabled:opacity-50 transition-colors"
                    >
                      {isRemoving ? 'Removing…' : 'Remove'}
                    </button>
                  )}
                </div>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
