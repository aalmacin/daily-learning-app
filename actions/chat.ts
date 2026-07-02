'use server';

import { getChatsByRefinementId, getRefinementById, getRefinementsByTermId, getTermById, insertChatMessages, insertTermCitations, type ChatMessage } from '@/lib/db';
import { chatAboutTerm } from '@/lib/openai';

export async function askQuestion(
  refinementId: number,
  question: string,
  useWeb = false,
): Promise<ChatMessage[]> {
  const refinement = await getRefinementById(refinementId);
  if (!refinement) throw new Error('Refinement not found');

  const term = await getTermById(refinement.term_id);
  if (!term) throw new Error('Term not found');

  const history = await getChatsByRefinementId(refinementId);

  const { answer, citations } = await chatAboutTerm(
    term.name,
    term.content,
    history.map(({ role, content }) => ({ role, content })),
    question,
    useWeb,
  );

  await insertChatMessages([
    { refinement_id: refinementId, role: 'user', content: question },
    { refinement_id: refinementId, role: 'assistant', content: answer },
  ]);

  await insertTermCitations(term.id, citations);

  return getChatsByRefinementId(refinementId);
}

export async function getLatestResearchChat(
  termId: number,
): Promise<{ refinementId: number; messages: ChatMessage[] } | null> {
  const refinements = await getRefinementsByTermId(termId);
  const latest = refinements[0];
  if (!latest) return null;
  const messages = await getChatsByRefinementId(latest.id);
  return { refinementId: latest.id, messages };
}
