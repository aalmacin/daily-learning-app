const STOPWORDS = new Set(['the', 'a', 'an', 'in', 'on', 'of', 'to', 'and', 'or', 'but']);
const SUFFIXES = ['ing', 'ed', 'es', 's'];

function escapeRegex(token: string): string {
  return token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stem(token: string): string {
  const lower = token.toLowerCase();
  for (const suffix of SUFFIXES) {
    if (lower.endsWith(suffix) && lower.length - suffix.length >= 3) {
      return lower.slice(0, lower.length - suffix.length);
    }
  }
  return lower;
}

function buildRedactionRegex(word: string): RegExp {
  const tokens = word.trim().split(/\s+/);
  const parts = tokens.map((token) => {
    const lower = token.toLowerCase();
    if (STOPWORDS.has(lower)) {
      return `\\b${escapeRegex(lower)}\\b`;
    }
    return `\\b${escapeRegex(stem(token))}\\w*\\b`;
  });
  return new RegExp(parts.join('\\s+'), 'gi');
}

function firstSentence(text: string): string {
  const trimmed = text.trim();
  const parts = trimmed.split(/(?<=[.!?])\s+/);
  return (parts[0] ?? trimmed).trim();
}

export function getFlashcardClue(word: string, definition: string): string {
  const sentence = firstSentence(definition);
  const regex = buildRedactionRegex(word);
  return sentence.replace(regex, '____').trim();
}
