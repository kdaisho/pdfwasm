import { PDFiumLibrary } from "@hyzyla/pdfium";
import wasmUrl from "@hyzyla/pdfium/pdfium.wasm?url";

let libraryPromise: Promise<PDFiumLibrary> | null = null;

/** Returns the singleton PDFiumLibrary instance (lazy-initialised). */
export function getPdfiumLibrary(): Promise<PDFiumLibrary> {
	if (!libraryPromise) {
		libraryPromise = PDFiumLibrary.init({ wasmUrl });
	}
	return libraryPromise;
}
