import type { VideoResearch } from './db';

// A processing row whose updated_at is older than this is treated as stuck
// (the after() pipeline was likely interrupted) — surface Retry and stop polling it.
export const VIDEO_PROCESSING_STALE_MS = 3 * 60 * 1000;

export function isVideoResearchStale(item: VideoResearch): boolean {
  return (
    item.status === 'processing' &&
    Date.now() - new Date(item.updated_at).getTime() > VIDEO_PROCESSING_STALE_MS
  );
}
