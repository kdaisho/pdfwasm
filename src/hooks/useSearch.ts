import { useMemo } from 'react';
import type { PageData, SearchMatch } from '../types';

/** Returns all positions of `query` across all pages (case-insensitive). */
export function useSearch(pages: PageData[], query: string): SearchMatch[] {
  return useMemo(() => {
    if (!query.trim()) return [];

    const matches: SearchMatch[] = [];
    const lowerQuery = query.toLowerCase();

    for (const page of pages) {
      const text = page.chars.map((c) => c.char).join('');
      const lowerText = text.toLowerCase();

      let startIdx = 0;
      while (startIdx < lowerText.length) {
        const idx = lowerText.indexOf(lowerQuery, startIdx);
        if (idx === -1) break;
        matches.push({
          pageIndex: page.index,
          charIndex: idx,
          charCount: query.length,
        });
        startIdx = idx + 1;
      }
    }

    return matches;
  }, [pages, query]);
}
