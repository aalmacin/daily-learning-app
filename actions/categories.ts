'use server';

import {
  getAllCategories,
  getTermById,
  insertCategory as dbInsertCategory,
  deleteCategory as dbDeleteCategory,
  updateTermCategories as dbUpdateTermCategories,
  getUserSettings,
} from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { updateNotionPageMetadata } from '@/lib/notion';
import { revalidatePath } from 'next/cache';
import type { Category, Term } from '@/lib/db';

export async function fetchCategories(): Promise<Category[]> {
  return getAllCategories();
}

export async function addCategory(name: string): Promise<Category> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Category name is required');
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const category = await dbInsertCategory(trimmed, user.id);
  revalidatePath('/categories');
  return category;
}

export async function removeCategory(id: number): Promise<void> {
  await dbDeleteCategory(id);
  revalidatePath('/categories');
  revalidatePath('/terms');
}

export async function updateTermCategories(termId: number, categories: string[]): Promise<Term> {
  const [current, user] = await Promise.all([getTermById(termId), getCurrentUser()]);
  if (!current) throw new Error('Term not found');
  if (!user) throw new Error('Not authenticated');
  const updated = await dbUpdateTermCategories(termId, categories, user.id);
  if (!updated) throw new Error('Term not found');
  if (updated.notion_page_id) {
    const user = await getCurrentUser();
    if (user) {
      const settings = await getUserSettings(user.id);
      if (settings?.notion_api_key && settings?.notion_database_id) {
        try {
          await updateNotionPageMetadata(
            { apiKey: settings.notion_api_key, databaseId: settings.notion_database_id },
            updated.notion_page_id,
            updated.categories,
            updated.priority,
          );
        } catch (err) {
          await dbUpdateTermCategories(termId, current.categories, user.id).catch(() => {});
          throw err;
        }
      }
    }
  }
  revalidatePath('/terms');
  return updated;
}
