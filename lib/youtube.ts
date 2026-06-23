import { Innertube } from 'youtubei.js';

const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

export function parseVideoId(url: string): string | null {
  const trimmed = url.trim();
  if (VIDEO_ID_RE.test(trimmed)) return trimmed;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^www\./, '');
  if (host === 'youtu.be') {
    const id = parsed.pathname.slice(1);
    return VIDEO_ID_RE.test(id) ? id : null;
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    const v = parsed.searchParams.get('v');
    if (v && VIDEO_ID_RE.test(v)) return v;
    const segments = parsed.pathname.split('/').filter(Boolean);
    if ((segments[0] === 'embed' || segments[0] === 'shorts' || segments[0] === 'live') && segments[1]) {
      return VIDEO_ID_RE.test(segments[1]) ? segments[1] : null;
    }
  }
  return null;
}

export async function fetchVideoTitle(url: string): Promise<string> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
    );
    if (!res.ok) return url;
    const data = (await res.json()) as { title?: unknown };
    return typeof data.title === 'string' && data.title.length > 0 ? data.title : url;
  } catch {
    return url;
  }
}

export async function fetchTranscript(videoId: string): Promise<string> {
  const yt = await Innertube.create({ retrieve_player: false });
  const info = await yt.getInfo(videoId);

  let transcriptInfo: Awaited<ReturnType<typeof info.getTranscript>>;
  try {
    transcriptInfo = await info.getTranscript();
  } catch {
    throw new Error('No transcript available for this video.');
  }

  // v17+: TranscriptInfo.transcript → Transcript → .content (TranscriptSearchPanel) → .body (TranscriptSegmentList) → .initial_segments
  const segments = transcriptInfo?.transcript?.content?.body?.initial_segments;
  if (!segments || segments.length === 0) {
    throw new Error('No transcript available for this video.');
  }

  const text = segments
    .map((s) => (typeof s.snippet.text === 'string' ? s.snippet.text : ''))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) throw new Error('No transcript available for this video.');
  return text;
}
