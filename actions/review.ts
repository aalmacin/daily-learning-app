'use server';

import { type ReviewItem, getReviewItemsByMonth } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function getReviewData(year: number, month: number): Promise<ReviewItem[]> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  return getReviewItemsByMonth(year, month, user.id);
}
