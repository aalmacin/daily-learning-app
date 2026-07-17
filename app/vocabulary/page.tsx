import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getVocabularyWords } from '@/lib/db';
import { VocabularyPageContent } from '@/components/VocabularyPageContent';

export default async function VocabularyPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const words = await getVocabularyWords(user.id);

  return (
    <div className="bg-zinc-50 dark:bg-black p-4 md:p-8 min-h-screen">
      <div className="max-w-2xl mx-auto">
        <VocabularyPageContent initialWords={words} />
      </div>
    </div>
  );
}
