import Link from 'next/link';
import { getTermsPaginated, getAllCategories } from '@/lib/db';
import { TermsTable } from '@/components/TermsTable';
import type { TermsQuery } from '@/lib/db';

const PAGE_SIZE = 25;

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
    params.notion === 'added' || params.notion === 'all' ? params.notion : 'pending';
  const sort: TermsQuery['sort'] =
    params.sort === 'name' || params.sort === 'priority' ? params.sort : 'created_at';
  const dir: TermsQuery['dir'] = params.dir === 'asc' ? 'asc' : 'desc';

  const [{ terms, total }, categories] = await Promise.all([
    getTermsPaginated({ page, pageSize: PAGE_SIZE, q, categoryNames, notion, sort, dir }),
    getAllCategories(),
  ]);

  return (
    <div className="bg-zinc-50 dark:bg-black p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex items-center gap-4">
          <Link
            href="/"
            className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
          >
            ← Home
          </Link>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Terms</h1>
          <Link
            href="/categories"
            className="ml-auto text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
          >
            Manage Categories
          </Link>
        </div>
        <TermsTable
          initialTerms={terms}
          total={total}
          allCategories={categories}
          currentPage={page}
          pageSize={PAGE_SIZE}
          currentQ={q}
          currentCategories={categoryNames}
          currentNotion={notion}
          currentSort={sort}
          currentDir={dir}
        />
      </div>
    </div>
  );
}
