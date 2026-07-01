'use server';

import { getTerm, insertTerm, updateTerm, deleteTerm, getAllCategories, getUserSettings, insertTermCitations } from '@/lib/db';
import { explainTermWithAI } from '@/lib/openai';
import { getCurrentUser } from '@/lib/auth';
import { createNotionPage, archiveNotionPage } from '@/lib/notion';
import { revalidatePath } from 'next/cache';
import type { Term } from '@/lib/db';

export type ExplainResult = Term & { alreadyExisted?: true };

function isDuplicateKeyError(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === 'object' &&
    'code' in err &&
    (err as { code: string }).code === '23505'
  );
}

export async function explainTerm(rawName: string, context?: string): Promise<ExplainResult> {
  const name = rawName.trim().toLowerCase();
  if (!name) throw new Error('Term name is required');

  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  if (!context) {
    const cached = await getTerm(name, user.id);
    if (cached) return { ...cached, alreadyExisted: true };
  }

  const dbCategories = await getAllCategories(user.id);
  const categoryNames = dbCategories.map((c) => c.name);
  const explanation = await explainTermWithAI(name, categoryNames, context);

  let term: Term;
  try {
    term = await insertTerm({
      name: explanation.name.trim(),
      content: explanation.content,
      categories: explanation.categories,
      notion_page_id: null,
      priority: 'Medium',
      updated_at: new Date().toISOString(),
      notion_last_edited: null,
      last_synced_at: null,
      daily_learning_done: false,
      notion_date: null,
    }, user.id);
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      const existing = await getTerm(name, user.id);
      if (existing) return { ...existing, alreadyExisted: true };
    }
    throw err;
  }
  await insertTermCitations(term.id, explanation.citations);
  const settings = await getUserSettings(user.id);
  if (settings?.notion_api_key && settings?.notion_database_id) {
    const credentials = { apiKey: settings.notion_api_key, databaseId: settings.notion_database_id };
    let notion_page_id: string | undefined;
    try {
      notion_page_id = await createNotionPage(credentials, {
        name: term.name,
        content: term.content,
        categories: term.categories,
        priority: term.priority,
      });
      const synced = await updateTerm(term.id, { notion_page_id });
      return synced ?? term;
    } catch (err) {
      if (notion_page_id) {
        await archiveNotionPage(credentials, notion_page_id).catch(() => {});
      }
      await deleteTerm(term.id);
      throw err;
    }
  }

  revalidatePath('/terms');
  return term;
}
