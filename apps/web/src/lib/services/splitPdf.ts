import { PDFDocument } from "pdf-lib";

/** One entry in the combined sequence: a single page, identified by its source and that source's page index. */
export interface SequenceEntry {
	sourceId: string;
	pageIndex: number;
}

/**
 * Compute the sequence positions that make up each exported segment, given
 * split points and excluded positions. Empty segments (all positions excluded)
 * are dropped. Exported so the viewer can derive the live file count without
 * duplicating the segment-building rules.
 */
export function computeSegmentPositions(
	sequenceLength: number,
	splitPoints: number[],
	excludedPositions: number[] = [],
): number[][] {
	const sorted = [...splitPoints].sort((a, b) => a - b);
	const excluded = new Set(excludedPositions);

	const segments: number[][] = [];
	let start = 0;

	const pushSegment = (rangeStart: number, rangeEnd: number) => {
		const positions: number[] = [];
		for (let i = rangeStart; i < rangeEnd; i++) {
			if (!excluded.has(i)) positions.push(i);
		}
		if (positions.length > 0) segments.push(positions);
	};

	for (const sp of sorted) {
		const end = sp + 1;
		if (end > start && end <= sequenceLength) {
			pushSegment(start, end);
			start = end;
		}
	}
	if (start < sequenceLength) {
		pushSegment(start, sequenceLength);
	}
	return segments;
}

/**
 * Assemble one or more output PDFs by copying pages from multiple source PDFs
 * into segments defined by sequence positions.
 *
 * @param sources - Map from sourceId to raw PDF bytes. Must contain every
 *                  sourceId referenced by `sequence`.
 * @param sequence - Combined, ordered list of page references. `sequence[k]`
 *                   is the page at position `k`.
 * @param splitPoints - Sorted array of sequence positions *after* which to
 *                      split. e.g. [2, 5] splits after position 2 and 5.
 * @param excludedPositions - Sequence positions to omit from every segment.
 *                            Empty segments are dropped.
 * @returns Array of Uint8Array, one per non-empty segment.
 */
export async function splitPdf(args: {
	sources: Map<string, Uint8Array>;
	sequence: SequenceEntry[];
	splitPoints: number[];
	excludedPositions?: number[];
}): Promise<Uint8Array[]> {
	const { sources, sequence, splitPoints, excludedPositions = [] } = args;
	const segmentPositions = computeSegmentPositions(
		sequence.length,
		splitPoints,
		excludedPositions,
	);

	const loaded = new Map<string, PDFDocument>();
	const ensureLoaded = async (id: string) => {
		let doc = loaded.get(id);
		if (!doc) {
			doc = await PDFDocument.load(sources.get(id)!);
			loaded.set(id, doc);
		}
		return doc;
	};

	const results: Uint8Array[] = [];
	for (const positions of segmentPositions) {
		const newDoc = await PDFDocument.create();
		for (const k of positions) {
			const entry = sequence[k];
			const srcDoc = await ensureLoaded(entry.sourceId);
			const [copied] = await newDoc.copyPages(srcDoc, [entry.pageIndex]);
			newDoc.addPage(copied);
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
