'use server';

import { revalidatePath } from 'next/cache';
import { updateTerm } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function saveTermNote(termId: number, markdown: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  await updateTerm(termId, { notes: markdown });

  revalidatePath(`/terms/${termId}`);
  revalidatePath('/terms');
}
