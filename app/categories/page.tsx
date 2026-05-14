import Link from 'next/link';
import { connection } from 'next/server';
import { getAllCategories } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { CategoriesManager } from '@/components/CategoriesManager';

export default async function CategoriesPage() {
  await connection();
  const user = await getCurrentUser();
  const categories = await getAllCategories(user!.id);

  return (
    <div className="bg-zinc-50 dark:bg-black p-8">
      <div className="max-w-xl mx-auto">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 mb-6">Categories</h1>
        <CategoriesManager initialData={categories} />
      </div>
    </div>
  );
}
