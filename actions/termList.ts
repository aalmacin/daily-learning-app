'use server';

import {
  addTermToList as dbAdd,
  removeFromTermList as dbRemove,
  removeFromTermListByTermId as dbRemoveByTermId,
  reorderTermList as dbReorder,
  getTermList as dbGetList,
} from '@/lib/db';
import type { TermListItem } from '@/lib/db';
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
