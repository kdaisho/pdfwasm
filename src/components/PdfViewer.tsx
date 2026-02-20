import { useState, useEffect, useRef } from 'react';
import type { PageData } from '../types';
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
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Meta+F → hijack browser find, focus our search input
      if (e.metaKey && e.code === 'KeyF') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
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

  const matches = useSearch(pages, query, { caseSensitive, wholeWord });

  return (
    <div>
      <SearchBar
        inputRef={searchInputRef}
        query={query}
        onChange={setQuery}
        matchCount={matches.length}
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
          return <PdfPage key={page.index} page={page} matches={pageMatches} />;
        })}
      </div>
    </div>
  );
}
