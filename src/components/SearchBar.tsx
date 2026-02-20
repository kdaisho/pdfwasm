import type { CSSProperties } from 'react';

interface SearchBarProps {
  query: string;
  onChange: (q: string) => void;
  matchCount: number;
}

export function SearchBar({ query, onChange, matchCount }: SearchBarProps) {
  return (
    <div style={styles.container}>
      <input
        type="text"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search in document…"
        style={styles.input}
      />
      {query && (
        <span style={styles.count}>
          {matchCount} match{matchCount !== 1 ? 'es' : ''}
        </span>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    position: 'sticky',
    top: 0,
    zIndex: 100,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 16px',
    background: '#fff',
    borderBottom: '1px solid #ddd',
    boxShadow: '0 2px 4px rgba(0,0,0,0.08)',
  },
  input: {
    flex: 1,
    maxWidth: 400,
    padding: '6px 10px',
    fontSize: 14,
    border: '1px solid #ccc',
    borderRadius: 4,
    outline: 'none',
  },
  count: {
    fontSize: 13,
    color: '#666',
    whiteSpace: 'nowrap',
  },
};
