'use server';

import { revalidatePath } from 'next/cache';
import {
  getVocabularyWords,
  searchVocabularyWords,
  getVocabularyWordById,
  findVocabularyWordByWord,
  insertVocabularyWord,
  deleteVocabularyWord,
  uploadVocabularyImage,
  updateVocabularyImage,
  getDueVocabularyWords,
  getNewVocabularyWords,
  reviewVocabularyWord,
  resetVocabularyReview,
  setMainContextSentence,
  updateVocabularyAnalysis,
  getVocabularyChatMessages,
  insertVocabularyChatMessages,
  getVocabularySentenceAttempts,
  insertVocabularySentenceAttempt,
  fillBlank,
  getUserSettings,
  type VocabularyWord,
  type VocabularyChatMessage,
  type VocabularySentenceAttempt,
} from '@/lib/db';
import {
  analyzeVocabulary,
  buildImagePrompt,
  generateVocabularyImage,
  chatAboutVocabulary,
  evaluateVocabularySentence,
} from '@/lib/openai';
import { isValidImageModel, DEFAULT_IMAGE_MODEL } from '@/lib/imageModels';
import { getCurrentUser } from '@/lib/auth';

export async function addVocabularyWord(
  word: string,
  type: 'word' | 'idiom',
): Promise<VocabularyWord> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  const trimmedWord = word.trim();

  const existing = await findVocabularyWordByWord(user.id, trimmedWord, type);
  if (existing) return existing;

  const analysis = await analyzeVocabulary(trimmedWord, type);
  if (!analysis.recognized) {
    throw new Error(`Could not recognize a valid ${type} from "${trimmedWord}"`);
  }

  const correctedWord = analysis.corrected;
  const mainSentence = analysis.context_sentences[0];

  const existingCorrected = await findVocabularyWordByWord(user.id, correctedWord, type);
  if (existingCorrected) return existingCorrected;

  const entry = await insertVocabularyWord({
    user_id: user.id,
    word: correctedWord,
    type,
    definition: analysis.definition,
    context: fillBlank(mainSentence.sentence, correctedWord),
    context_sentences: analysis.context_sentences,
    connections: analysis.connections,
    morphology: analysis.morphology,
    flashcard_sentence: null,
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

export async function searchVocabulary(q: string): Promise<VocabularyWord[]> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  return searchVocabularyWords(user.id, q);
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

export async function regenerateVocabularyWord(wordId: number): Promise<VocabularyWord> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  const word = await getVocabularyWordById(wordId, user.id);
  if (!word) throw new Error('Word not found');

  const analysis = await analyzeVocabulary(word.word, word.type);
  const mainSentence = analysis.context_sentences[0];
  const context = fillBlank(mainSentence.sentence, word.word);

  let entry = await updateVocabularyAnalysis(wordId, user.id, {
    definition: analysis.definition,
    context,
    context_sentences: analysis.context_sentences,
    connections: analysis.connections,
    morphology: analysis.morphology,
  });

  // Only refresh the image if one was already generated — image generation stays opt-in.
  if (word.image_url) {
    const imageModel = word.image_model ?? DEFAULT_IMAGE_MODEL;
    const prompt = await buildImagePrompt(word.word, context, analysis.definition);
    const bytes = await generateVocabularyImage(prompt, imageModel);
    const publicUrl = await uploadVocabularyImage(user.id, wordId, bytes);
    const imageUrl = `${publicUrl}?v=${Date.now()}`;
    await updateVocabularyImage(wordId, user.id, imageUrl, prompt, imageModel);
    entry = { ...entry, image_url: imageUrl, image_prompt: prompt, image_model: imageModel };
  }

  revalidatePath('/vocabulary');
  revalidatePath('/vocabulary/flashcards');
  return entry;
}

export async function setWordMainContext(
  wordId: number,
  index: number,
): Promise<VocabularyWord> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const entry = await setMainContextSentence(wordId, user.id, index);
  revalidatePath('/vocabulary');
  return entry;
}

export async function getVocabularyChat(wordId: number): Promise<VocabularyChatMessage[]> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const word = await getVocabularyWordById(wordId, user.id);
  if (!word) throw new Error('Word not found');
  return getVocabularyChatMessages(wordId);
}

export async function askVocabularyQuestion(
  wordId: number,
  question: string,
): Promise<VocabularyChatMessage[]> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const word = await getVocabularyWordById(wordId, user.id);
  if (!word) throw new Error('Word not found');

  const history = await getVocabularyChatMessages(wordId);
  const answer = await chatAboutVocabulary(
    word.word,
    word.type,
    word.definition,
    history.map((m) => ({ role: m.role, content: m.content })),
    question,
  );
  await insertVocabularyChatMessages(wordId, [
    { role: 'user', content: question },
    { role: 'assistant', content: answer },
  ]);
  return getVocabularyChatMessages(wordId);
}

export async function getVocabularySentenceHistory(wordId: number): Promise<VocabularySentenceAttempt[]> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const word = await getVocabularyWordById(wordId, user.id);
  if (!word) throw new Error('Word not found');
  return getVocabularySentenceAttempts(wordId);
}

export async function submitVocabularySentenceAttemptAction(
  wordId: number,
  sentence: string,
): Promise<VocabularySentenceAttempt> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const word = await getVocabularyWordById(wordId, user.id);
  if (!word) throw new Error('Word not found');

  const { isCorrect, feedback } = await evaluateVocabularySentence(
    word.word,
    word.type,
    word.definition,
    sentence,
  );
  return insertVocabularySentenceAttempt(wordId, sentence, isCorrect, feedback);
}

export async function getVocabularyReviewCards(
  type?: 'word' | 'idiom',
): Promise<{ due: VocabularyWord[]; new: VocabularyWord[] }> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const [due, newWords] = await Promise.all([
    getDueVocabularyWords(user.id, type),
    getNewVocabularyWords(user.id, type),
  ]);
  return { due, new: newWords };
}

export async function submitVocabularyReview(id: number, correct: boolean): Promise<VocabularyWord> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const settings = await getUserSettings(user.id);
  const word = await reviewVocabularyWord(id, user.id, correct, settings?.timezone);
  revalidatePath('/vocabulary/flashcards');
  return word;
}

export async function resetVocabularyReviewAction(id: number): Promise<VocabularyWord> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const word = await resetVocabularyReview(id, user.id);
  revalidatePath('/vocabulary');
  return word;
}
