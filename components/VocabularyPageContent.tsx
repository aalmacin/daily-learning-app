import Link from 'next/link';
import { VocabularyList } from '@/components/VocabularyList';
import { VocabularyForm } from '@/components/VocabularyForm';
import type { VocabularyWord } from '@/lib/db';

type Props = {
  initialWords: VocabularyWord[];
};

export function VocabularyPageContent({ initialWords }: Props) {
  return (
    <div className="flex flex-col gap-8">
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
      <VocabularyList initialWords={initialWords} />
    </div>
  );
}
