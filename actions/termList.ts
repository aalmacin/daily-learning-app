'use server';

import {
  addTermToList as dbAdd,
  removeFromTermList as dbRemove,
  removeFromTermListByTermId as dbRemoveByTermId,
  reorderTermList as dbReorder,
  getTermList as dbGetList,
  getTermById,
  getRefinementsByTermId,
  getChatsByRefinementIds,
  getFlashcardsByTermId,
  getExplainedAtForTerm,
} from '@/lib/db';
import type { TermListItem, Term, ConceptRefinement, ChatMessage, Flashcard } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export async function addToTermList(termId: number): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  await dbAdd(termId, user.id);
  revalidatePath('/term-list');
}

export async function removeFromTermList(id: number): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  await dbRemove(id, user.id);
  revalidatePath('/term-list');
}

export async function removeFromTermListByTermId(termId: number): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  await dbRemoveByTermId(termId, user.id);
  revalidatePath('/term-list');
}

export async function reorderTermList(orderedIds: number[]): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  await dbReorder(orderedIds, user.id);
  revalidatePath('/term-list');
}

export async function fetchTermList(): Promise<TermListItem[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  return dbGetList(user.id);
}

export type TermDetailData = {
  term: Term;
  refinements: ConceptRefinement[];
  chats: Record<number, ChatMessage[]>;
  flashcards: Flashcard[];
  explainedAt: string | null;
};

export async function getTermDetailForList(termId: number): Promise<TermDetailData> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  const [term, refinements] = await Promise.all([
    getTermById(termId),
    getRefinementsByTermId(termId),
  ]);
  if (!term) throw new Error('Term not found');

  const [chats, flashcards, explainedAt] = await Promise.all([
    getChatsByRefinementIds(refinements.map((r) => r.id)),
    getFlashcardsByTermId(termId, user.id),
    getExplainedAtForTerm(termId),
  ]);

  return { term, refinements, chats, flashcards, explainedAt };
}
