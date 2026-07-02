'use server';

import { deleteTerm as dbDeleteTerm, getAllCategories, getAllTerms, getTermById, getTermsPaginated, getUserSettings, insertTermCitations, updateTerm } from '@/lib/db';
import { explainTermWithAI } from '@/lib/openai';
import { getCurrentUser } from '@/lib/auth';
import { archiveNotionPage, unarchiveNotionPage, updateNotionPageContent, updateNotionPageMetadata } from '@/lib/notion';
import { revalidatePath } from 'next/cache';
import type { Term, Priority } from '@/lib/db';

async function getNotionCredentials() {
  const user = await getCurrentUser();
  if (!user) return { credentials: null, timezone: 'UTC' };
  const settings = await getUserSettings(user.id);
  if (!settings?.notion_api_key || !settings?.notion_database_id) return { credentials: null, timezone: settings?.timezone ?? 'UTC' };
  return { credentials: { apiKey: settings.notion_api_key, databaseId: settings.notion_database_id }, timezone: settings.timezone };
}

export async function deleteTerm(id: number): Promise<void> {
  const { credentials } = await getNotionCredentials();
  const notionPageId = credentials ? (await getTermById(id))?.notion_page_id ?? null : null;

  if (credentials && notionPageId) {
    await archiveNotionPage(credentials, notionPageId);
  }

  try {
    await dbDeleteTerm(id);
  } catch (err) {
    if (credentials && notionPageId) {
      await unarchiveNotionPage(credentials, notionPageId).catch(() => {});
    }
    throw err;
  }

  revalidatePath('/terms');
}

export async function updateTermPriority(id: number, priority: Priority): Promise<Term> {
  const { credentials } = await getNotionCredentials();
  const current = await getTermById(id);
  if (!current) throw new Error('Term not found');
  const updated = await updateTerm(id, { priority });
  if (!updated) throw new Error('Term not found');
  if (updated.notion_page_id && credentials) {
    try {
      await updateNotionPageMetadata(credentials, updated.notion_page_id, updated.categories, updated.priority);
    } catch (err) {
      await updateTerm(id, { priority: current.priority }).catch(() => {});
      throw err;
    }
  }
  revalidatePath('/terms');
  return updated;
}

export async function fetchAllTerms(): Promise<Term[]> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  return getAllTerms(user.id);
}

const PRIORITY_ORDER: Record<Term['priority'], number> = { High: 0, Medium: 1, Low: 2 };

export async function searchTerms(q: string): Promise<Term[]> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const { terms } = await getTermsPaginated({ userId: user.id, page: 1, pageSize: 20, q });
  return terms.sort((a, b) => {
    if (a.explained !== b.explained) return a.explained ? -1 : 1;
    return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  });
}

export async function regenerateTerm(id: number, name: string, context?: string, useWeb = false): Promise<Term> {
  const [{ credentials }, user] = await Promise.all([getNotionCredentials(), getCurrentUser()]);
  if (!user) throw new Error('Not authenticated');
  const dbCategories = await getAllCategories(user.id);
  const categoryNames = dbCategories.map((c) => c.name);
  const explanation = await explainTermWithAI(name, categoryNames, context, useWeb);
  const updated = await updateTerm(id, {
    content: explanation.content,
    categories: explanation.categories,
  }, user.id);

  if (!updated) throw new Error('Term not found');

  await insertTermCitations(updated.id, explanation.citations);

  if (updated.notion_page_id && credentials) {
    await Promise.all([
      updateNotionPageContent(credentials, updated.notion_page_id, updated.content),
      updateNotionPageMetadata(credentials, updated.notion_page_id, updated.categories, updated.priority),
    ]);
  }

  revalidatePath('/terms');
  return updated;
}
