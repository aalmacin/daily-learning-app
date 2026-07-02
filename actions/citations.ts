'use server';

import { getCitationsByTermId, type TermCitation } from '@/lib/db';

export async function getTermCitations(termId: number): Promise<TermCitation[]> {
  return getCitationsByTermId(termId);
}
