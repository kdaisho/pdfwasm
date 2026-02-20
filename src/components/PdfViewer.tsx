import { useState } from 'react';
import type { PageData } from '../types';
import { PdfPage } from './PdfPage';
import { SearchBar } from './SearchBar';
import { useSearch } from '../hooks/useSearch';

interface PdfViewerProps {
  pages: PageData[];
}

export function PdfViewer({ pages }: PdfViewerProps) {
  const [query, setQuery] = useState('');
  const matches = useSearch(pages, query);

  return (
    <div>
      <SearchBar query={query} onChange={setQuery} matchCount={matches.length} />
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
