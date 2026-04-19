import { PDFDocument } from "pdf-lib";

/**
 * Compute the page indices that make up each exported segment, given split
 * points and excluded pages. Empty segments (all pages excluded) are dropped.
 * Exported so the viewer can derive the live file count without duplicating
 * the segment-building rules.
 */
export function computeSegmentPageIndices(
	totalPages: number,
	splitPoints: number[],
	excludedPages: number[] = [],
): number[][] {
	const sorted = [...splitPoints].sort((a, b) => a - b);
	const excluded = new Set(excludedPages);

	const segments: number[][] = [];
	let start = 0;

	const pushSegment = (rangeStart: number, rangeEnd: number) => {
		const indices: number[] = [];
		for (let i = rangeStart; i < rangeEnd; i++) {
			if (!excluded.has(i)) indices.push(i);
		}
		if (indices.length > 0) segments.push(indices);
	};

	for (const sp of sorted) {
		const end = sp + 1;
		if (end > start && end <= totalPages) {
			pushSegment(start, end);
			start = end;
		}
	}
	if (start < totalPages) {
		pushSegment(start, totalPages);
	}
	return segments;
}

/**
 * Split a PDF into multiple documents at the given split points, omitting any
 * excluded pages from the output.
 *
 * @param pdfBytes - Original PDF file bytes
 * @param splitPoints - Sorted array of page indices *after* which to split (0-based).
 *                      e.g. [2, 5] splits after page 2 and after page 5.
 * @param excludedPages - 0-based page indices to omit from every segment.
 *                        Empty segments (those whose pages are all excluded)
 *                        are dropped from the output.
 * @returns Array of Uint8Array, one per non-empty segment
 */
export async function splitPdf(
	pdfBytes: Uint8Array,
	splitPoints: number[],
	excludedPages: number[] = [],
): Promise<Uint8Array[]> {
	const srcDoc = await PDFDocument.load(pdfBytes);
	const totalPages = srcDoc.getPageCount();
	const segments = computeSegmentPageIndices(
		totalPages,
		splitPoints,
		excludedPages,
	);

	const results: Uint8Array[] = [];
	for (const indices of segments) {
		const newDoc = await PDFDocument.create();
		const copiedPages = await newDoc.copyPages(srcDoc, indices);
		for (const p of copiedPages) {
			newDoc.addPage(p);
		}
		results.push(await newDoc.save());
	}

	return results;
}

export function downloadSplitPdfs(segments: Uint8Array[]) {
	for (let i = 0; i < segments.length; i++) {
		const blob = new Blob([segments[i]], { type: "application/pdf" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `split-${i + 1}.pdf`;
		a.click();
		URL.revokeObjectURL(url);
	}
}
