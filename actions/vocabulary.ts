'use server';

import { revalidatePath } from 'next/cache';
import {
  getVocabularyWords,
  getVocabularyWordById,
  insertVocabularyWord,
  deleteVocabularyWord,
  uploadVocabularyImage,
  updateVocabularyImage,
  type VocabularyWord,
} from '@/lib/db';
import {
  analyzeVocabulary,
  buildImagePrompt,
  generateVocabularyImage,
} from '@/lib/openai';
import { isValidImageModel } from '@/lib/imageModels';
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

export async function generateWordImage(
  wordId: number,
  model: string,
): Promise<{ imageUrl: string; imageModel: string }> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  if (!isValidImageModel(model)) throw new Error('Invalid image model');

  const word = await getVocabularyWordById(wordId, user.id);
  if (!word) throw new Error('Word not found');

  const prompt = await buildImagePrompt(word.word, word.context, word.definition);
  const bytes = await generateVocabularyImage(prompt, model);
  const publicUrl = await uploadVocabularyImage(user.id, wordId, bytes);
  // Version the URL so overwritten (regenerated) images bypass browser/CDN cache.
  const imageUrl = `${publicUrl}?v=${Date.now()}`;
  await updateVocabularyImage(wordId, user.id, imageUrl, prompt, model);

  revalidatePath('/vocabulary/flashcards');
  return { imageUrl, imageModel: model };
}
