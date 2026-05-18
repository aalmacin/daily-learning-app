import { getCurrentUser } from '@/lib/auth';
import { getAllCategories } from '@/lib/db';
import { redirect } from 'next/navigation';
import { FlashcardsReview } from '@/components/FlashcardsReview';

export default async function FlashcardsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const categories = await getAllCategories(user.id);

  return <FlashcardsReview categories={categories} />;
}
