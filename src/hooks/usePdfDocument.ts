import { useState, useRef, useCallback } from 'react';
import type { PDFiumLibrary, PDFiumPage, PDFiumDocument } from '@hyzyla/pdfium';
import type { CharBox, PageData } from '../types';

const RENDER_SCALE = 2;

/**
 * Extract per-character bounding boxes from a PDFium page using the raw Wasm module.
 *
 * PDFium coordinate space: origin bottom-left, Y-up, units = PDF points.
 * The caller converts to canvas space using the anti-drift formula.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractCharBoxes(page: PDFiumPage): CharBox[] {
  // Access the raw Emscripten module through the private field.
  // PDFiumPage stores these as `module` and `pageIdx` (the PDFium page handle).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = (page as any).module as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pageIdx = (page as any).pageIdx as number;

  const textPage: number = mod._FPDFText_LoadPage(pageIdx);
  const charCount: number = mod._FPDFText_CountChars(textPage);
  const chars: CharBox[] = [];

  if (typeof mod._FPDFText_GetCharBox !== 'function') {
    // Should not happen with v2.x — guard just in case
    console.warn('_FPDFText_GetCharBox not exported; no char boxes available.');
    mod._FPDFText_ClosePage(textPage);
    return chars;
  }

  // Allocate 4 × 8 bytes (4 doubles) for left / right / bottom / top output params
  const boxPtr: number = mod.wasmExports.malloc(32);

  try {
    for (let i = 0; i < charCount; i++) {
      const unicode: number = mod._FPDFText_GetUnicode(textPage, i);
      const char = String.fromCodePoint(unicode);

      // _FPDFText_GetCharBox(textPage, index, *left, *right, *bottom, *top) → bool
      const ok: number = mod._FPDFText_GetCharBox(
        textPage,
        i,
        boxPtr,       // double* left
        boxPtr + 8,   // double* right
        boxPtr + 16,  // double* bottom
        boxPtr + 24,  // double* top
      );

      if (ok) {
        // module.HEAPU8.buffer is the full Wasm linear memory ArrayBuffer.
        // boxPtr is an absolute byte offset into it.
        const view = new DataView(mod.HEAPU8.buffer as ArrayBuffer, boxPtr, 32);
        chars.push({
          char,
          left:   view.getFloat64(0,  true),
          right:  view.getFloat64(8,  true),
          bottom: view.getFloat64(16, true),
          top:    view.getFloat64(24, true),
        });
      } else {
        // Include placeholder so char indices stay aligned with the text string
        chars.push({ char, left: 0, right: 0, bottom: 0, top: 0 });
      }
    }
  } finally {
    mod.wasmExports.free(boxPtr);
    mod._FPDFText_ClosePage(textPage);
  }

  return chars;
}

interface UsePdfDocumentResult {
  pages: PageData[];
  loading: boolean;
  error: Error | null;
  loadFile: (file: File) => Promise<void>;
}

export function usePdfDocument(library: PDFiumLibrary | null): UsePdfDocumentResult {
  const [pages, setPages] = useState<PageData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const docRef = useRef<PDFiumDocument | null>(null);

  const loadFile = useCallback(
    async (file: File) => {
      if (!library) return;

      setLoading(true);
      setError(null);
      setPages([]);

      // Free previous document to prevent Wasm heap leaks
      docRef.current?.destroy();
      docRef.current = null;

      try {
        const buffer = await file.arrayBuffer();
        const uint8 = new Uint8Array(buffer);
        const doc = await library.loadDocument(uint8);
        docRef.current = doc;

        const pageDataList: PageData[] = [];

        for (const page of doc.pages()) {
          // Extract char boxes BEFORE render: the library calls _FPDF_ClosePage inside render(),
          // which frees the page handle. Using it afterwards causes "table index is out of bounds".
          const chars = extractCharBoxes(page);

          const rendered = await page.render({ scale: RENDER_SCALE, render: 'bitmap' });

          // rendered.data is a fresh RGBA Uint8Array (copied off the Wasm heap by the library)
          const imageData = new ImageData(
            new Uint8ClampedArray(rendered.data.buffer),
            rendered.width,
            rendered.height,
          );

          pageDataList.push({
            index: page.number,
            imageData,
            width: rendered.width,
            height: rendered.height,
            originalWidth: rendered.originalWidth,
            originalHeight: rendered.originalHeight,
            chars,
            scale: RENDER_SCALE,
          });
        }

        setPages(pageDataList);
      } catch (err: unknown) {
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setLoading(false);
      }
    },
    [library],
  );

  return { pages, loading, error, loadFile };
}
