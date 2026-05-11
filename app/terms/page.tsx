import Link from 'next/link';
import { getAllTerms, getAllCategories, getUserSettings } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { TermsTable } from '@/components/TermsTable';

export default async function TermsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { category } = await searchParams;
  const user = await getCurrentUser();
  const [terms, categories, settings] = await Promise.all([
    getAllTerms(),
    getAllCategories(),
    user ? getUserSettings(user.id) : null,
  ]);
  const initialCategory = typeof category === 'string' ? category : undefined;
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
        <TermsTable initialData={terms} initialCategories={categories} initialCategory={initialCategory} timezone={settings?.timezone ?? 'UTC'} />
      </div>
    </div>
  );
}
