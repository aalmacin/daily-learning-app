'use server';

import { APIResponseError } from '@notionhq/client';
import { revalidatePath } from 'next/cache';
import { type Term, getAllTerms, insertTerm, updateTerm, getUserSettings, getExplainedContent, insertExplainedContent, updateExplainedContent, markTermSynced } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import {
  createNotionPage,
  getAllNotionPages,
  getNotionPageContent,
  getNotionPageFullContent,
  updateNotionPageMetadata,
} from '@/lib/notion';

const STALE_NOTION_CODES = new Set(['object_not_found', 'validation_error']);

export async function addToNotion(
  termId: number,
  term: { name: string; content: string; categories: string[]; priority: string },
): Promise<Term> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  const settings = await getUserSettings(user.id);
  if (!settings?.notion_api_key || !settings?.notion_database_id) {
    throw new Error('Notion credentials not configured. Go to Settings to add your Notion API key and database ID.');
  }

  const pageId = await createNotionPage(
    { apiKey: settings.notion_api_key, databaseId: settings.notion_database_id },
    term,
  );
  const updated = await updateTerm(termId, { notion_page_id: pageId });

  if (!updated) {
    throw new Error(`Term ${termId} not found`);
  }

  revalidatePath('/terms');
  return updated;
}

const NOTION_UUID_RE = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

function isValidNotionId(id: string): boolean {
  return NOTION_UUID_RE.test(id.trim());
}

export async function syncWithNotion(): Promise<{ synced: number; imported: number; pushed: number; contentSynced: number; skipped: number; stale: string[]; dbError?: string }> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  const settings = await getUserSettings(user.id);
  if (!settings?.notion_api_key || !settings?.notion_database_id) {
    throw new Error('Notion credentials not configured. Go to Settings to add your Notion API key and database ID.');
  }

  const credentials = { apiKey: settings.notion_api_key, databaseId: settings.notion_database_id };
  const timezone = settings.timezone;

  const [terms, notionPagesResult] = await Promise.all([
    getAllTerms(user.id),
    getAllNotionPages(credentials).catch((err: unknown) => err),
  ]);

  const notionPages = notionPagesResult instanceof Error ? [] : (notionPagesResult as Awaited<ReturnType<typeof getAllNotionPages>>);
  const dbError = notionPagesResult instanceof Error ? (notionPagesResult as Error).message : undefined;

  const notionPageMap = new Map(notionPages.map((p) => [p.id, p]));
  const linkedIds = new Set(terms.map((t) => t.notion_page_id).filter(Boolean));
  const linked = terms.filter((t) => t.notion_page_id && isValidNotionId(t.notion_page_id));
  const unsynced = terms.filter((t) => !t.notion_page_id);
  const notionOnly = notionPages.filter((p) => !linkedIds.has(p.id));
  const stale: string[] = [];
  let pushed = 0;
  let skipped = 0;

  await Promise.allSettled([
    // Update existing linked terms
    ...linked.map(async (term) => {
      const pageId = term.notion_page_id!;
      const notionPage = notionPageMap.get(pageId);

      // Skip if neither Notion nor DB has changed since last sync,
      // and daily_learning_done is already in sync
      const notionUnchanged = notionPage && term.notion_last_edited === notionPage.lastEditedTime;
      const dbUnchanged = term.last_synced_at && term.updated_at <= term.last_synced_at;
      const dailyLearningInSync = term.daily_learning_done === (notionPage?.dailyLearningDone ?? false);
      const notionDateInSync = term.notion_date === (notionPage?.date ?? null);
      if (notionUnchanged && dbUnchanged && dailyLearningInSync && notionDateInSync) {
        skipped++;
        return;
      }

      try {
        const calls: Promise<unknown>[] = [];

        // Only fetch content from Notion if the page was edited
        if (!notionUnchanged) {
          calls.push(
            getNotionPageContent(credentials, pageId).then(async (notionContent) => {
              if (notionContent && notionContent !== term.content) {
                await updateTerm(term.id, { content: notionContent });
              }
            }),
          );
        }

        // Only push metadata to Notion if DB changed
        if (!dbUnchanged) {
          calls.push(updateNotionPageMetadata(credentials, pageId, term.categories, term.priority));
        }

        await Promise.all(calls);
        await markTermSynced(term.id, notionPage?.lastEditedTime ?? term.notion_last_edited ?? '', notionPage?.dailyLearningDone ?? false, notionPage?.date ?? null);
      } catch (err) {
        if (err instanceof APIResponseError && STALE_NOTION_CODES.has(err.code)) {
          stale.push(term.name);
          await updateTerm(term.id, { notion_page_id: null });
        }
      }
    }),
    // Push local terms not yet on Notion
    ...unsynced.map(async (term) => {
      const pageId = await createNotionPage(credentials, term);
      await updateTerm(term.id, { notion_page_id: pageId });
      pushed++;
    }),
    // Import Notion pages that have no local DB entry
    ...notionOnly.map(async (page) => {
      const content = await getNotionPageContent(credentials, page.id);
      await insertTerm({
        name: page.name,
        content,
        categories: page.categories,
        priority: page.priority,
        notion_page_id: page.id,
        updated_at: new Date().toISOString(),
        notion_last_edited: null,
        last_synced_at: null,
        daily_learning_done: false,
        notion_date: null,
        flashcards_disabled: false,
      }, user.id);
    }),
  ]);

  // Sync explained content for completed terms
  let contentSynced = 0;
  if (!dbError) {
    const completedTerms = terms.filter((t) => {
      if (!t.notion_page_id) return false;
      const page = notionPageMap.get(t.notion_page_id);
      if (!page) return false;
      return page.dailyLearningDone;
    });

    if (completedTerms.length > 0) {
      const existing = await getExplainedContent(completedTerms.map((t) => t.id));
      const existingByTermId = new Map(existing.map((e) => [e.term_id, e]));

      await Promise.allSettled(
        completedTerms.map(async (term) => {
          const page = notionPageMap.get(term.notion_page_id!)!;
          // Only sync explained content when the Date was set via the explanation page
          if (!page.date) return;
          const explainedAt = page.date;
          const row = existingByTermId.get(term.id);

          const fullContent = await getNotionPageFullContent(credentials, term.notion_page_id!);
          const content = fullContent || '(No content)';

          if (row) {
            // Skip if Notion page hasn't been edited since last sync
            if (row.notion_last_edited === page.lastEditedTime) return;
            await updateExplainedContent(row.id, content, explainedAt, page.lastEditedTime);
            contentSynced++;
          } else {
            await insertExplainedContent(term.id, content, explainedAt, page.lastEditedTime);
            contentSynced++;
          }
        }),
      );
    }
  }

  revalidatePath('/terms');
  revalidatePath('/review');
  return { synced: linked.length - stale.length - skipped, imported: notionOnly.length, pushed, contentSynced, skipped, stale, dbError };
}
