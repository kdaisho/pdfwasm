import type { PDFiumPage } from "@hyzyla/pdfium";
import type { CharBox } from "$lib/types";

export const RENDER_SCALE = 2;

/** Page box in raw PDF page space (what FPDF_GetPageBoundingBox reports). */
export interface PageBox {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

/**
 * Map a box from raw PDF page space into render space (still Y-up, in points).
 *
 * PDFium renders the *bounding box* (CropBox ∩ MediaBox) with /Rotate applied,
 * but FPDFText_GetCharBox reports coordinates in raw page space — the crop
 * origin is not subtracted and the rotation is not applied. On a PDF whose
 * CropBox differs from its MediaBox (common in print-ready books) that makes
 * highlights land cropBottom points too high and cropLeft points too far right.
 *
 * The four cases below reproduce PDFium's own FPDF_PageToDevice mapping, with
 * the Y axis kept pointing up so callers can keep using the anti-drift formula
 * `y = (renderHeight - top) * scale`.
 */
export function toRenderSpace(
	box: CharBox,
	pageBox: PageBox,
	rotation: number,
): CharBox {
	const { left: l, right: r, bottom: b, top: t } = box;

	switch (rotation) {
		case 1: // 90° clockwise
			return {
				char: box.char,
				left: b - pageBox.bottom,
				right: t - pageBox.bottom,
				bottom: pageBox.right - r,
				top: pageBox.right - l,
			};
		case 2: // 180°
			return {
				char: box.char,
				left: pageBox.right - r,
				right: pageBox.right - l,
				bottom: pageBox.top - t,
				top: pageBox.top - b,
			};
		case 3: // 270° clockwise
			return {
				char: box.char,
				left: pageBox.top - t,
				right: pageBox.top - b,
				bottom: l - pageBox.left,
				top: r - pageBox.left,
			};
		default:
			return {
				char: box.char,
				left: l - pageBox.left,
				right: r - pageBox.left,
				bottom: b - pageBox.bottom,
				top: t - pageBox.bottom,
			};
	}
}

/**
 * Read the page's rendered bounding box (CropBox ∩ MediaBox). Falls back to the
 * MediaBox-sized box implied by the page dimensions if PDFium refuses.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readPageBox(mod: any, pageHandle: number): PageBox {
	const rectPtr: number = mod.wasmExports.malloc(16);
	try {
		if (mod._FPDF_GetPageBoundingBox(pageHandle, rectPtr)) {
			// FS_RECTF is four float32s in left/top/right/bottom order.
			const view = new DataView(
				mod.HEAPU8.buffer as ArrayBuffer,
				rectPtr,
				16,
			);
			return {
				left: view.getFloat32(0, true),
				top: view.getFloat32(4, true),
				right: view.getFloat32(8, true),
				bottom: view.getFloat32(12, true),
			};
		}
	} finally {
		mod.wasmExports.free(rectPtr);
	}

	return {
		left: 0,
		bottom: 0,
		right: mod._FPDF_GetPageWidth(pageHandle),
		top: mod._FPDF_GetPageHeight(pageHandle),
	};
}

/**
 * Extract per-character bounding boxes from a PDFium page using the raw Wasm module.
 *
 * Boxes are returned in render space: origin at the bottom-left of the *rendered*
 * page (CropBox ∩ MediaBox, /Rotate applied), Y-up, units = PDF points. The caller
 * converts to canvas space using the anti-drift formula.
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

	const pageBox = readPageBox(mod, pageIdx);
	const rotation: number = mod._FPDFPage_GetRotation(pageIdx);
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
				chars.push(
					toRenderSpace(
						{
							char,
							left: view.getFloat64(0, true),
							right: view.getFloat64(8, true),
							bottom: view.getFloat64(16, true),
							top: view.getFloat64(24, true),
						},
						pageBox,
						rotation,
					),
				);
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
