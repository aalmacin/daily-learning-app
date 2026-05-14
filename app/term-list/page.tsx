import { getTermList } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { TermList } from '@/components/TermList';

export default async function TermListPage() {
  const user = await getCurrentUser();
  const items = user ? await getTermList(user.id) : [];

  return (
    <div className="bg-zinc-50 dark:bg-black p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 mb-6">Term List</h1>
        <TermList initialItems={items} />
      </div>
    </div>
  );
}
