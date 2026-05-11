'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import {
  getUserSettings,
  updateNotionDatabaseId,
  clearNotionCredentials,
  updateTimezone,
  type UserSettings,
} from '@/lib/db';
import { createNotionDataSource as createNotionDataSourceInNotion } from '@/lib/notion';

export async function getNotionSettings(): Promise<UserSettings | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  return getUserSettings(user.id);
}

export async function saveNotionDatabaseId(databaseId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  await updateNotionDatabaseId(user.id, databaseId);
  revalidatePath('/settings');
}

export async function disconnectNotion(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  await clearNotionCredentials(user.id);
  revalidatePath('/settings');
}

export async function saveTimezone(timezone: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  await updateTimezone(user.id, timezone);
  revalidatePath('/settings');
}

export async function createNotionDataSource(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  const settings = await getUserSettings(user.id);
  if (!settings?.notion_api_key) throw new Error('Notion is not connected');

  const dataSource = await createNotionDataSourceInNotion(settings.notion_api_key);
  await updateNotionDatabaseId(user.id, dataSource.id);
  revalidatePath('/settings');
}
