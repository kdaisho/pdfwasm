import type { CSSProperties } from 'react';
import { usePdfium } from './hooks/usePdfium';
import { usePdfDocument } from './hooks/usePdfDocument';
import { PdfViewer } from './components/PdfViewer';

export default function App() {
  const { library, loading: libLoading, error: libError } = usePdfium();
  const { pages, loading: docLoading, error: docError, loadFile } = usePdfDocument(library);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void loadFile(file);
  }

  if (libLoading) {
    return <div style={styles.center}>Loading PDFium Wasm…</div>;
  }
  if (libError) {
    return <div style={styles.center}>Failed to load PDFium: {libError.message}</div>;
  }


  return (
    <div>
      <div style={styles.toolbar}>
        <h2 style={styles.title}>PDF Viewer</h2>
        <label style={styles.button}>
          Open PDF
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        </label>
        {docLoading && <span style={styles.status}>Rendering pages…</span>}
        {docError && <span style={styles.errorText}>Error: {docError.message}</span>}
      </div>

      {pages.length > 0 && <PdfViewer pages={pages} />}

      {pages.length === 0 && !docLoading && (
        <div style={styles.center}>Open a PDF file to get started.</div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  center: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '80vh',
    fontSize: 18,
    color: '#555',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '10px 16px',
    background: '#f5f5f5',
    borderBottom: '1px solid #ddd',
  },
  title: {
    margin: 0,
    fontSize: 18,
    fontWeight: 600,
  },
  button: {
    padding: '6px 14px',
    background: '#4f6ef7',
    color: '#fff',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 14,
    userSelect: 'none',
  },
  status: {
    fontSize: 13,
    color: '#555',
  },
  errorText: {
    fontSize: 13,
    color: '#c00',
  },
};
