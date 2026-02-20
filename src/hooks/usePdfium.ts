import { useState, useEffect } from 'react';
import type { PDFiumLibrary } from '@hyzyla/pdfium';
import { getPdfiumLibrary } from '../services/pdfium';

interface UsePdfiumResult {
  library: PDFiumLibrary | null;
  loading: boolean;
  error: Error | null;
}

/** Loads the PDFium Wasm library once and returns its state. */
export function usePdfium(): UsePdfiumResult {
  const [library, setLibrary] = useState<PDFiumLibrary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    getPdfiumLibrary()
      .then(setLibrary)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err : new Error(String(err))),
      )
      .finally(() => setLoading(false));
  }, []);

  return { library, loading, error };
}
