'use server';

import { revalidatePath } from 'next/cache';
import {
  getVocabularyWords,
  insertVocabularyWord,
  deleteVocabularyWord,
  type VocabularyWord,
} from '@/lib/db';
import { analyzeVocabulary } from '@/lib/openai';
import { getCurrentUser } from '@/lib/auth';

export async function addVocabularyWord(
  word: string,
  type: 'word' | 'idiom',
): Promise<VocabularyWord> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  const analysis = await analyzeVocabulary(word, type);

  const entry = await insertVocabularyWord({
    user_id: user.id,
    word,
    type,
    definition: analysis.definition,
    context: analysis.context,
    connections: analysis.connections,
    morphology: analysis.morphology,
    flashcard_sentence: analysis.flashcard_sentence,
  });

  revalidatePath('/vocabulary');
  return entry;
}

export async function removeVocabularyWord(id: number): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  await deleteVocabularyWord(id, user.id);
  revalidatePath('/vocabulary');
}

export async function fetchVocabularyWords(
  type?: 'word' | 'idiom',
): Promise<VocabularyWord[]> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  return getVocabularyWords(user.id, type);
}
