import { getCurrentUser } from '@/lib/auth';
import { getAllCategories } from '@/lib/db';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { FlashcardsReview } from '@/components/FlashcardsReview';
import { VocabularyFlashcards } from '@/components/VocabularyFlashcards';

type Tab = 'terms' | 'vocabulary';

export default async function FlashcardsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const params = await searchParams;
  const activeTab: Tab = params.tab === 'vocabulary' ? 'vocabulary' : 'terms';
  const categories = await getAllCategories(user.id);

  const tabClass = (tab: Tab) =>
    `px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
      activeTab === tab
        ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
    }`;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black p-4">
      <div className="max-w-lg mx-auto space-y-4">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Flashcards</h1>

        <div className="flex gap-2">
          <Link href="/flashcards?tab=terms" className={tabClass('terms')}>
            Terms
          </Link>
          <Link href="/flashcards?tab=vocabulary" className={tabClass('vocabulary')}>
            Vocabulary
          </Link>
        </div>

        {activeTab === 'terms' ? (
          <FlashcardsReview categories={categories} />
        ) : (
          <VocabularyFlashcards />
        )}
      </div>
    </div>
  );
}
