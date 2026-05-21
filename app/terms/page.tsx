import Link from 'next/link';
import { getTermsPaginated, getAllCategories, getUserSettings, getTermListTermIds } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { TermsTable } from '@/components/TermsTable';
import type { TermsQuery, Priority } from '@/lib/db';

const PAGE_SIZE_OPTIONS = [10, 25, 50];

export default async function TermsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;

  const page = Math.max(1, Number(params.page) || 1);
  const q = typeof params.q === 'string' ? params.q : '';
  const rawCategory = params.category;
  const categoryNames =
    typeof rawCategory === 'string'
      ? [rawCategory]
      : Array.isArray(rawCategory)
        ? rawCategory
        : [];
  const notion: TermsQuery['notion'] =
    params.notion === 'added' || params.notion === 'pending' ? params.notion : 'all';
  const sort: TermsQuery['sort'] =
    params.sort === 'name' || params.sort === 'priority' || params.sort === 'explained_at'
      ? params.sort
      : 'created_at';
  const dir: TermsQuery['dir'] = params.dir === 'asc' ? 'asc' : 'desc';
  const rawPriority = params.priority;
  const priority: Priority | 'all' =
    rawPriority === 'High' || rawPriority === 'Medium' || rawPriority === 'Low'
      ? rawPriority
      : 'all';
  const rawDailyLearning = params.dailyLearning;
  const dailyLearning: 'all' | 'done' | 'not-done' =
    rawDailyLearning === 'done' || rawDailyLearning === 'not-done' ? rawDailyLearning : 'all';
  const rawFlashcards = params.flashcards;
  const flashcards: 'all' | 'with' | 'without' =
    rawFlashcards === 'with' || rawFlashcards === 'without' ? rawFlashcards : 'all';
  const rawPageSize = Number(params.pageSize);
  const pageSize = PAGE_SIZE_OPTIONS.includes(rawPageSize) ? rawPageSize : 10;

  const user = await getCurrentUser();
  const userId = user!.id;

  const [{ terms, total }, categories, settings, termListIds] = await Promise.all([
    getTermsPaginated({ userId, page, pageSize, q, categoryNames, notion, sort, dir, priority, dailyLearning, flashcards }),
    getAllCategories(userId),
    getUserSettings(userId),
    getTermListTermIds(userId),
  ]);

  const termListTermIds = new Set(termListIds);

  const notionConfigured = !!(settings?.notion_api_key && settings?.notion_database_id);

  return (
    <div className="bg-zinc-50 dark:bg-black p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {!notionConfigured && (
          <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950 px-4 py-3 flex items-center justify-between gap-4">
            <p className="text-sm text-amber-800 dark:text-amber-300">
              Notion is not configured. Set up your API key and database ID to export terms.
            </p>
            <Link
              href="/settings"
              className="shrink-0 text-sm font-medium text-amber-900 dark:text-amber-200 underline underline-offset-2 hover:no-underline"
            >
              Go to Settings
            </Link>
          </div>
        )}
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 mb-6">Terms</h1>
        <TermsTable
          initialTerms={terms}
          total={total}
          allCategories={categories}
          currentPage={page}
          pageSize={pageSize}
          currentQ={q}
          currentCategories={categoryNames}
          currentNotion={notion}
          currentPriority={priority}
          currentDailyLearning={dailyLearning}
          currentFlashcards={flashcards}
          currentSort={sort}
          currentDir={dir}
          timezone={settings?.timezone ?? 'UTC'}
          initialTermListTermIds={termListTermIds}
        />
      </div>
    </div>
  );
}
