import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getVocabularyWords } from '@/lib/db';
import { VocabularyList } from '@/components/VocabularyList';
import { VocabularyForm } from '@/components/VocabularyForm';
import { VocabularyResult } from '@/components/VocabularyResult';

export default async function VocabularyPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const words = await getVocabularyWords(user.id);

  return (
    <div className="bg-zinc-50 dark:bg-black p-4 md:p-8 min-h-screen">
      <div className="max-w-2xl mx-auto flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Vocabulary
          </h1>
          <Link
            href="/vocabulary/flashcards"
            className="px-3 py-1.5 text-sm font-medium rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
          >
            Flashcards
          </Link>
        </div>
        <VocabularyForm />
        <VocabularyResult />
        <VocabularyList initialWords={words} />
      </div>
    </div>
  );
}
