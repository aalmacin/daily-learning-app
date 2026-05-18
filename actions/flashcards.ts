'use server';

import { revalidatePath } from 'next/cache';
import {
  createFlashcard,
  updateFlashcard,
  deleteFlashcard,
  resetFlashcardReview,
  getDueFlashcards,
  getNewFlashcards,
  reviewFlashcard,
  getFlashcardsByTermId,
  getAllCategories,
  getUserSettings,
  type Flashcard,
} from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function addFlashcard(termId: number, content: string): Promise<Flashcard> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const card = await createFlashcard(termId, content, user.id);
  revalidatePath(`/terms/${termId}`);
  return card;
}

export async function editFlashcard(id: number, termId: number, content: string): Promise<Flashcard> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const card = await updateFlashcard(id, content, user.id);
  revalidatePath(`/terms/${termId}`);
  return card;
}

export async function removeFlashcard(id: number, termId: number): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  await deleteFlashcard(id, user.id);
  revalidatePath(`/terms/${termId}`);
}

export async function resetFlashcard(id: number, termId: number): Promise<Flashcard> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const card = await resetFlashcardReview(id, user.id);
  revalidatePath(`/terms/${termId}`);
  return card;
}

export async function getFlashcardsForTerm(termId: number): Promise<Flashcard[]> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  return getFlashcardsByTermId(termId, user.id);
}

export async function getReviewCards(categoryNames?: string[]): Promise<{
  due: (Flashcard & { term_name: string })[];
  new: (Flashcard & { term_name: string })[];
}> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const [allDue, allNew] = await Promise.all([
    getDueFlashcards(user.id, categoryNames),
    getNewFlashcards(user.id, categoryNames),
  ]);

  // One card per term: due cards first, then new cards fill remaining terms
  const seenTerms = new Set<number>();
  const due: (Flashcard & { term_name: string })[] = [];
  for (const card of allDue) {
    if (!seenTerms.has(card.term_id)) {
      seenTerms.add(card.term_id);
      due.push(card);
    }
  }
  const newCards: (Flashcard & { term_name: string })[] = [];
  for (const card of allNew) {
    if (!seenTerms.has(card.term_id)) {
      seenTerms.add(card.term_id);
      newCards.push(card);
    }
  }

  return { due, new: newCards };
}

export async function submitReview(id: number, correct: boolean): Promise<Flashcard> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const settings = await getUserSettings(user.id);
  const card = await reviewFlashcard(id, user.id, correct, settings?.timezone);
  revalidatePath('/flashcards');
  return card;
}

export async function getFlashcardCategories(): Promise<{ id: number; name: string }[]> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  return getAllCategories(user.id);
}
