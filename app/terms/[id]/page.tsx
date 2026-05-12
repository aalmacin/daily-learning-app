import { notFound } from 'next/navigation';
import { getTermById, getRefinementsByTermId, getChatsByRefinementIds, getExplainedAtForTerm } from '@/lib/db';
import { TermDetailPage } from '@/components/TermDetailPage';

export default async function TermPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (isNaN(id)) notFound();

  const [term, refinements] = await Promise.all([getTermById(id), getRefinementsByTermId(id)]);
  if (!term) notFound();

  const [initialChats, explainedAt] = await Promise.all([
    getChatsByRefinementIds(refinements.map((r) => r.id)),
    getExplainedAtForTerm(id),
  ]);

  return <TermDetailPage term={term} initialRefinements={refinements} initialChats={initialChats} explainedAt={explainedAt} />;
}
