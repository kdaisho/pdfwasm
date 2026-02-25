import type { PDFiumPage } from "@hyzyla/pdfium";
import type { CharBox } from "$lib/types";

export const RENDER_SCALE = 2;

/**
 * Extract per-character bounding boxes from a PDFium page using the raw Wasm module.
 *
 * PDFium coordinate space: origin bottom-left, Y-up, units = PDF points.
 * The caller converts to canvas space using the anti-drift formula.
 */
export function extractCharBoxes(page: PDFiumPage): CharBox[] {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const mod = (page as any).module as any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const pageIdx = (page as any).pageIdx as number;

	const textPage: number = mod._FPDFText_LoadPage(pageIdx);
	const charCount: number = mod._FPDFText_CountChars(textPage);
	const chars: CharBox[] = [];

	if (typeof mod._FPDFText_GetCharBox !== "function") {
		console.warn(
			"_FPDFText_GetCharBox not exported; no char boxes available.",
		);
		mod._FPDFText_ClosePage(textPage);
		return chars;
	}

	const boxPtr: number = mod.wasmExports.malloc(32);

	try {
		for (let i = 0; i < charCount; i++) {
			const unicode: number = mod._FPDFText_GetUnicode(textPage, i);
			const char = String.fromCodePoint(unicode);

			const ok: number = mod._FPDFText_GetCharBox(
				textPage,
				i,
				boxPtr,
				boxPtr + 8,
				boxPtr + 16,
				boxPtr + 24,
			);

			if (ok) {
				const view = new DataView(
					mod.HEAPU8.buffer as ArrayBuffer,
					boxPtr,
					32,
				);
				chars.push({
					char,
					left: view.getFloat64(0, true),
					right: view.getFloat64(8, true),
					bottom: view.getFloat64(16, true),
					top: view.getFloat64(24, true),
				});
			} else {
				chars.push({ char, left: 0, right: 0, bottom: 0, top: 0 });
			}
		}
	} finally {
		mod.wasmExports.free(boxPtr);
		mod._FPDFText_ClosePage(textPage);
	}

	return chars;
}
