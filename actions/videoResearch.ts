'use server';

import { after } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  getVideoResearchByTerm,
  getVideoResearchById,
  insertVideoResearch,
  updateVideoResearch,
  deleteVideoResearch,
  type VideoResearch,
} from '@/lib/db';
import { parseVideoId, fetchVideoTitle, fetchTranscript } from '@/lib/youtube';
import {
  summarizeVideo,
  extractVideoKeyTakeaways,
  extractVideoKeyConcepts,
  formatVideoTranscript,
} from '@/lib/openai';

export async function listVideoResearch(termId: number): Promise<VideoResearch[]> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  return getVideoResearchByTerm(termId, user.id);
}

// Runs after the response via after(); fetches transcript and generates study material.
async function processVideoResearch(id: number, videoId: string): Promise<void> {
  try {
    const rawTranscript = await fetchTranscript(videoId);
    const [summary, keyTakeaways, keyConcepts, aiTranscript] = await Promise.all([
      summarizeVideo(rawTranscript),
      extractVideoKeyTakeaways(rawTranscript),
      extractVideoKeyConcepts(rawTranscript),
      formatVideoTranscript(rawTranscript),
    ]);
    await updateVideoResearch(id, {
      status: 'ready',
      error: null,
      raw_transcript: rawTranscript,
      ai_transcript: aiTranscript,
      summary,
      key_takeaways: keyTakeaways,
      key_concepts: keyConcepts,
    });
  } catch (e) {
    await updateVideoResearch(id, {
      status: 'error',
      error: e instanceof Error ? e.message : 'Failed to process video',
    });
  }
}

export async function submitVideoResearch(termId: number, url: string): Promise<VideoResearch> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  const videoId = parseVideoId(url);
  if (!videoId) throw new Error('Enter a valid YouTube URL.');

  const title = await fetchVideoTitle(url);
  const row = await insertVideoResearch({
    termId,
    userId: user.id,
    youtubeUrl: url,
    videoId,
    title,
  });

  after(() => processVideoResearch(row.id, videoId));

  return row;
}

export async function updateVideoResearchTitle(id: number, title: string): Promise<VideoResearch> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const existing = await getVideoResearchById(id);
  if (!existing || existing.user_id !== user.id) throw new Error('Not found');
  const trimmed = title.trim();
  if (!trimmed) throw new Error('Title cannot be empty.');
  return updateVideoResearch(id, { title: trimmed });
}

export async function removeVideoResearch(id: number): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  await deleteVideoResearch(id, user.id);
}

export async function retryVideoResearch(id: number): Promise<VideoResearch> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const existing = await getVideoResearchById(id);
  if (!existing || existing.user_id !== user.id) throw new Error('Not found');
  const row = await updateVideoResearch(id, { status: 'processing', error: null });
  after(() => processVideoResearch(row.id, row.video_id));
  return row;
}
