import { getUserSettings, getReviewItemsByMonth, getAvailableReviewMonths } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ReviewPage } from '@/components/ReviewPage';

export default async function ReviewRoute() {
  const user = await getCurrentUser();
  if (!user) return null;

  const [settings, availableMonths] = await Promise.all([
    getUserSettings(user.id),
    getAvailableReviewMonths(),
  ]);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const defaultMonth = availableMonths.find((m) => m.year === currentYear && m.month === currentMonth) ?? availableMonths[0];
  const year = defaultMonth?.year ?? currentYear;
  const month = defaultMonth?.month ?? currentMonth;

  const initialData = availableMonths.length > 0 ? await getReviewItemsByMonth(year, month) : [];

  return (
    <div className="bg-zinc-50 dark:bg-black p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 mb-6">Review</h1>
        {availableMonths.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No explained concepts yet. Complete the Feynman Method workflow and sync with Notion to see your content here.
          </p>
        ) : (
          <ReviewPage
            availableMonths={availableMonths}
            initialData={initialData}
            initialYear={year}
            initialMonth={month}
          />
        )}
      </div>
    </div>
  );
}
