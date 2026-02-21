import type { PageData, SearchMatch, SearchOptions } from '../types';

function isWordChar(ch: string): boolean {
  return /\w/.test(ch);
}

/** Returns all positions of `query` across all pages. */
export function findMatches(pages: PageData[], query: string, options: SearchOptions): SearchMatch[] {
  if (!query.trim()) return [];

  const { caseSensitive, wholeWord } = options;
  const matches: SearchMatch[] = [];
  const normalizedQuery = caseSensitive ? query : query.toLowerCase();

  for (const page of pages) {
    const rawText = page.chars.map((c) => c.char).join('');
    const text = caseSensitive ? rawText : rawText.toLowerCase();

    let startIdx = 0;
    while (true) {
      const idx = text.indexOf(normalizedQuery, startIdx);
      if (idx === -1) break;

      if (wholeWord) {
        const before = idx > 0 ? text[idx - 1] : ' ';
        const after =
          idx + normalizedQuery.length < text.length
            ? text[idx + normalizedQuery.length]
            : ' ';
        if (isWordChar(before) || isWordChar(after)) {
          startIdx = idx + 1;
          continue;
        }
      }

      matches.push({ pageIndex: page.index, charIndex: idx, charCount: query.length });
      startIdx = idx + 1;
    }
  }

  return matches;
}
