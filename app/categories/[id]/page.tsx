import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getAllCategories, getTermsByCategory } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { CategoryTermList } from '@/components/CategoryTermList';

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const categoryId = Number(id);
  if (isNaN(categoryId)) notFound();

  const user = await getCurrentUser();
  const userId = user!.id;

  const [categories, terms] = await Promise.all([
    getAllCategories(userId),
    getTermsByCategory(userId, categoryId),
  ]);

  const category = categories.find((c) => c.id === categoryId);
  if (!category) notFound();

  return (
    <div className="bg-zinc-50 dark:bg-black p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 mb-6">
          {category.name}
        </h1>
        <CategoryTermList items={terms} />
      </div>
    </div>
  );
}
