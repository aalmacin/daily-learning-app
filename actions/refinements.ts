'use server';

import { revalidatePath } from 'next/cache';
import {
  createRefinement,
  updatePreRefinementResult,
  setPreRefinement,
  updateRefinementData,
  deleteConceptRefinement,
  getRefinementById,
  getTermById,
  updateTerm,
  setTermNotionDate,
  getUserSettings,
  getChatsByRefinementId,
  type ConceptRefinement,
} from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { evaluatePreRefinement, evaluateRefinement } from '@/lib/openai';
import { createNotionPage, appendRefinementToNotionPage, updateNotionPageDate } from '@/lib/notion';

export async function submitPreRefinement(
  termId: number,
  userExplanation: string,
): Promise<ConceptRefinement> {
  const term = await getTermById(termId);
  if (!term) throw new Error('Term not found');

  const refinement = await createRefinement(termId, userExplanation);
  const result = await evaluatePreRefinement(term.name, userExplanation);
  const updated = await updatePreRefinementResult(refinement.id, result.accuracy, result.review);

  revalidatePath(`/terms/${termId}`);
  return updated;
}

export async function submitRefinement(
  refinementId: number,
  termId: number,
  userExplanation: string,
): Promise<ConceptRefinement> {
  const term = await getTermById(termId);
  if (!term) throw new Error('Term not found');

  const result = await evaluateRefinement(term.name, userExplanation);
  const updated = await updateRefinementData(refinementId, {
    refinement: userExplanation,
    refinement_accuracy: result.accuracy,
    refinement_review: result.review,
    refinement_formatted_note: result.formattedNote,
    refinement_additional_note: result.additionalNote,
  });

  revalidatePath(`/terms/${termId}`);
  revalidatePath('/terms');
  return updated;
}

export async function setExplanationDate(termId: number, date: string | null): Promise<void> {
  const user = await getCurrentUser();

  await setTermNotionDate(termId, date);

  if (user) {
    const [term, settings] = await Promise.all([
      getTermById(termId),
      getUserSettings(user.id),
    ]);
    if (term?.notion_page_id && settings?.notion_api_key && settings?.notion_database_id) {
      await updateNotionPageDate(
        { apiKey: settings.notion_api_key, databaseId: settings.notion_database_id },
        term.notion_page_id,
        date,
      );
    }
  }

  revalidatePath(`/terms/${termId}`);
  revalidatePath('/terms');
}

export async function addRefinementToNotion(termId: number, refinementId: number): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  const settings = await getUserSettings(user.id);
  if (!settings?.notion_api_key || !settings?.notion_database_id) {
    throw new Error('Notion credentials not configured. Go to Settings to add your Notion API key and database ID.');
  }
  const credentials = { apiKey: settings.notion_api_key, databaseId: settings.notion_database_id };

  const term = await getTermById(termId);
  if (!term) throw new Error('Term not found');

  const refinement = await getRefinementById(refinementId);
  if (
    !refinement?.refinement ||
    !refinement.refinement_formatted_note ||
    !refinement.refinement_additional_note
  ) {
    throw new Error('Refinement not complete');
  }

  let pageId = term.notion_page_id;
  if (!pageId) {
    pageId = await createNotionPage(credentials, {
      name: term.name,
      content: term.content,
      categories: term.categories,
      priority: term.priority,
    });
    await updateTerm(termId, { notion_page_id: pageId });
  }

  const chats = await getChatsByRefinementId(refinementId);

  await appendRefinementToNotionPage(
    credentials,
    pageId,
    {
      refinement: refinement.refinement,
      refinement_formatted_note: refinement.refinement_formatted_note,
      refinement_additional_note: refinement.refinement_additional_note,
    },
    term.name,
    settings.timezone,
    chats,
    term.notion_date ?? undefined,
    term.notes,
  );

  revalidatePath(`/terms/${termId}`);
  revalidatePath('/terms');
}

export async function submitRefinementOnly(
  termId: number,
  userExplanation: string,
): Promise<ConceptRefinement> {
  const term = await getTermById(termId);
  if (!term) throw new Error('Term not found');

  // Empty pre_refinement signals this attempt skipped the cold start step
  const refinement = await createRefinement(termId, '');
  const result = await evaluateRefinement(term.name, userExplanation);
  const updated = await updateRefinementData(refinement.id, {
    refinement: userExplanation,
    refinement_accuracy: result.accuracy,
    refinement_review: result.review,
    refinement_formatted_note: result.formattedNote,
    refinement_additional_note: result.additionalNote,
  });

  revalidatePath(`/terms/${termId}`);
  revalidatePath('/terms');
  return updated;
}

export async function attachColdExplanation(
  refinementId: number,
  termId: number,
  userExplanation: string,
): Promise<ConceptRefinement> {
  const term = await getTermById(termId);
  if (!term) throw new Error('Term not found');

  const result = await evaluatePreRefinement(term.name, userExplanation);
  const updated = await setPreRefinement(refinementId, userExplanation, result.accuracy, result.review);

  revalidatePath(`/terms/${termId}`);
  return updated;
}

export async function createAttempt(termId: number): Promise<ConceptRefinement> {
  const term = await getTermById(termId);
  if (!term) throw new Error('Term not found');
  const refinement = await createRefinement(termId, '');
  revalidatePath(`/terms/${termId}`);
  return refinement;
}

export async function removeRefinement(id: number, termId: number): Promise<void> {
  await deleteConceptRefinement(id);
  revalidatePath(`/terms/${termId}`);
  revalidatePath('/terms');
}
