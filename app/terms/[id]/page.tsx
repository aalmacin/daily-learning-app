import { notFound } from 'next/navigation';
import { getTermById, getRefinementsByTermId, getChatsByRefinementIds, getExplainedAtForTerm, getFlashcardsByTermId } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { TermDetailPage } from '@/components/TermDetailPage';

export default async function TermPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (isNaN(id)) notFound();

  const user = await getCurrentUser();
  if (!user) notFound();

  const [term, refinements] = await Promise.all([getTermById(id), getRefinementsByTermId(id)]);
  if (!term) notFound();

  const [initialChats, explainedAt, flashcards] = await Promise.all([
    getChatsByRefinementIds(refinements.map((r) => r.id)),
    getExplainedAtForTerm(id),
    getFlashcardsByTermId(id, user.id),
  ]);

  return <TermDetailPage term={term} initialRefinements={refinements} initialChats={initialChats} explainedAt={explainedAt} initialFlashcards={flashcards} />;
}
