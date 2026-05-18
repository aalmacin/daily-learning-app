export function renderClozeFront(content: string): string {
  return content.replace(/__([^_]+)__/g, '___');
}

export function renderClozeBack(content: string): string {
  return content.replace(/__([^_]+)__/g, '$1');
}

export function extractClozeTerms(content: string): string[] {
  const matches = content.match(/__([^_]+)__/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(2, -2));
}

export function hasClozeMarkers(content: string): boolean {
  return /__([^_]+)__/g.test(content);
}
