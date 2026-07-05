import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { VocabularyFlashcards } from '@/components/VocabularyFlashcards';

export default async function VocabularyFlashcardsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <div className="bg-zinc-50 dark:bg-black p-4 md:p-8 min-h-screen">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            Vocabulary Flashcards
          </h1>
          <Link
            href="/vocabulary"
            className="px-3 py-1.5 text-sm font-medium rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
          >
            Vocabulary
          </Link>
        </div>
        <VocabularyFlashcards />
      </div>
    </div>
  );
}
