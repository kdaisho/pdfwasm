import { PDFDocument } from "pdf-lib";

/**
 * Split a PDF into multiple documents at the given split points.
 * @param pdfBytes - Original PDF file bytes
 * @param splitPoints - Sorted array of page indices *after* which to split (0-based).
 *                      e.g. [2, 5] splits after page 2 and after page 5.
 * @returns Array of Uint8Array, one per segment
 */
export async function splitPdf(
	pdfBytes: Uint8Array,
	splitPoints: number[],
): Promise<Uint8Array[]> {
	const srcDoc = await PDFDocument.load(pdfBytes);
	const totalPages = srcDoc.getPageCount();

	const sorted = [...splitPoints].sort((a, b) => a - b);

	// Build page ranges: [start, end) for each segment
	const ranges: [number, number][] = [];
	let start = 0;
	for (const sp of sorted) {
		const end = sp + 1;
		if (end > start && end <= totalPages) {
			ranges.push([start, end]);
			start = end;
		}
	}
	// Final segment
	if (start < totalPages) {
		ranges.push([start, totalPages]);
	}

	const results: Uint8Array[] = [];
	for (const [rangeStart, rangeEnd] of ranges) {
		const newDoc = await PDFDocument.create();
		const indices = Array.from(
			{ length: rangeEnd - rangeStart },
			(_, i) => rangeStart + i,
		);
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
