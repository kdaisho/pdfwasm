import { PDFiumLibrary } from "@hyzyla/pdfium";
import wasmUrl from "@hyzyla/pdfium/pdfium.wasm?url";

console.log("==>", { wasmUrl });

let libraryPromise: Promise<PDFiumLibrary> | null = null;

/** Returns the singleton PDFiumLibrary instance (lazy-initialised). */
export function getPdfiumLibrary(): Promise<PDFiumLibrary> {
	if (!libraryPromise) {
		libraryPromise = PDFiumLibrary.init({ wasmUrl });
	}
	return libraryPromise;
}
