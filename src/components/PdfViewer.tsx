import { useState, useEffect, useRef } from 'react';
import type { PageData, SearchMatch } from '../types';
import { PdfPage } from './PdfPage';
import { SearchBar } from './SearchBar';
import { useSearch } from '../hooks/useSearch';

interface PdfViewerProps {
  pages: PageData[];
}

export function PdfViewer({ pages }: PdfViewerProps) {
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  // Stable ref so the keydown handler never closes over stale matches
  const matchesRef = useRef<SearchMatch[]>([]);

  const matches = useSearch(pages, query, { caseSensitive, wholeWord });
  matchesRef.current = matches;

  // Reset to first match whenever the result set changes
  useEffect(() => {
    setCurrentMatchIndex(matches.length > 0 ? 0 : -1);
  }, [matches.length, query, caseSensitive, wholeWord]);

  // Scroll active match into view (centered vertically)
  useEffect(() => {
    if (currentMatchIndex < 0 || matches.length === 0) return;
    const match = matches[currentMatchIndex];
    const pageEl = pageRefs.current.get(match.pageIndex);
    if (!pageEl) return;

    const page = pages.find((p) => p.index === match.pageIndex);
    if (!page) return;
    const char = page.chars[match.charIndex];
    if (!char) {
      pageEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    const charYInPage = (page.originalHeight - char.top) * page.scale;
    const pageRect = pageEl.getBoundingClientRect();
    const targetY = window.scrollY + pageRect.top + charYInPage - window.innerHeight / 2;
    window.scrollTo({ top: targetY, behavior: 'smooth' });
  }, [currentMatchIndex, matches, pages]);

  function goToNext() {
    const n = matchesRef.current.length;
    if (n === 0) return;
    setCurrentMatchIndex((i) => (i + 1) % n);
  }

  function goToPrev() {
    const n = matchesRef.current.length;
    if (n === 0) return;
    setCurrentMatchIndex((i) => (i - 1 + n) % n);
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Meta+F → hijack browser find, focus our search input
      if (e.metaKey && !e.altKey && !e.shiftKey && e.code === 'KeyF') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      // Meta+G → next match, Meta+Shift+G → previous match
      if (e.metaKey && !e.altKey && e.code === 'KeyG') {
        e.preventDefault();
        const n = matchesRef.current.length;
        if (n === 0) return;
        if (e.shiftKey) {
          setCurrentMatchIndex((i) => (i - 1 + n) % n);
        } else {
          setCurrentMatchIndex((i) => (i + 1) % n);
        }
        return;
      }

      if (!e.metaKey || !e.altKey) return;
      // Use e.code (physical key) so Option on Mac doesn't produce a dead character
      if (e.code === 'KeyW') {
        e.preventDefault();
        setWholeWord((v) => !v);
      } else if (e.code === 'KeyC') {
        e.preventDefault();
        setCaseSensitive((v) => !v);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div>
      <SearchBar
        inputRef={searchInputRef}
        query={query}
        onChange={setQuery}
        matchCount={matches.length}
        currentMatchIndex={currentMatchIndex}
        onNext={goToNext}
        onPrev={goToPrev}
        caseSensitive={caseSensitive}
        wholeWord={wholeWord}
        onToggleCaseSensitive={() => setCaseSensitive((v) => !v)}
        onToggleWholeWord={() => setWholeWord((v) => !v)}
      />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
          padding: 16,
          overflowX: 'auto',
        }}
      >
        {pages.map((page) => {
          const pageMatches = matches.filter((m) => m.pageIndex === page.index);
          const activeCharIndex =
            currentMatchIndex >= 0 && matches[currentMatchIndex]?.pageIndex === page.index
              ? matches[currentMatchIndex].charIndex
              : -1;
          return (
            <div
              key={page.index}
              ref={(el) => {
                if (el) pageRefs.current.set(page.index, el);
                else pageRefs.current.delete(page.index);
              }}
            >
              <PdfPage page={page} matches={pageMatches} activeCharIndex={activeCharIndex} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
