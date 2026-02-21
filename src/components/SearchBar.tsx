import type { CSSProperties, RefObject } from 'react';

interface SearchBarProps {
  inputRef: RefObject<HTMLInputElement>;
  query: string;
  onChange: (q: string) => void;
  matchCount: number;
  currentMatchIndex: number;
  onNext: () => void;
  onPrev: () => void;
  caseSensitive: boolean;
  wholeWord: boolean;
  onToggleCaseSensitive: () => void;
  onToggleWholeWord: () => void;
}

export function SearchBar({
  inputRef,
  query,
  onChange,
  matchCount,
  currentMatchIndex,
  onNext,
  onPrev,
  caseSensitive,
  wholeWord,
  onToggleCaseSensitive,
  onToggleWholeWord,
}: SearchBarProps) {
  const hasMatches = matchCount > 0;

  return (
    <div style={styles.container}>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search in document…"
        style={styles.input}
      />
      <button
        onClick={onToggleCaseSensitive}
        title="Case sensitive (⌘⌥C)"
        style={toggleStyle(caseSensitive)}
      >
        Aa
      </button>
      <button
        onClick={onToggleWholeWord}
        title="Whole word (⌘⌥W)"
        style={toggleStyle(wholeWord)}
      >
        W
      </button>
      {query && (
        <>
          <span style={styles.count}>
            {matchCount === 0
              ? 'No matches'
              : `${currentMatchIndex + 1} of ${matchCount}`}
          </span>
          <div style={styles.navGroup}>
            <button
              onClick={onPrev}
              disabled={!hasMatches}
              title="Previous match (⌘⇧G)"
              style={navStyle(!hasMatches)}
            >
              ↑
            </button>
            <button
              onClick={onNext}
              disabled={!hasMatches}
              title="Next match (⌘G)"
              style={navStyle(!hasMatches)}
            >
              ↓
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function toggleStyle(active: boolean): CSSProperties {
  return {
    width: 28,
    height: 28,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 4,
    border: '1px solid transparent',
    cursor: 'pointer',
    background: active ? '#0066cc' : 'transparent',
    color: active ? '#fff' : '#555',
  };
}

function navStyle(disabled: boolean): CSSProperties {
  return {
    width: 28,
    height: 28,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    borderRadius: 4,
    border: '1px solid transparent',
    cursor: disabled ? 'default' : 'pointer',
    background: 'transparent',
    color: disabled ? '#bbb' : '#555',
  };
}

const styles: Record<string, CSSProperties> = {
  container: {
    position: 'sticky',
    top: 0,
    zIndex: 100,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
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
    marginRight: 4,
  },
  count: {
    fontSize: 13,
    color: '#666',
    whiteSpace: 'nowrap',
    marginLeft: 4,
    minWidth: 80,
  },
  navGroup: {
    display: 'flex',
    gap: 2,
  },
};
