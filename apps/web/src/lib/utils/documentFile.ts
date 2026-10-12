import { DOCUMENT_MIME_TYPES, MAX_FILE_SIZE } from "@pdfwasm/shared/constants";

export type DocumentPick =
	| { ok: true; file: File; ignored: number }
	| { ok: false; error: string };

/** For the file picker's `accept` attribute. */
export const DOCUMENT_ACCEPT = [
	".pdf",
	".epub",
	...Object.values(DOCUMENT_MIME_TYPES),
].join(",");

const SUPPORTED_MIME_TYPES = new Set(Object.values(DOCUMENT_MIME_TYPES));

// A first pass on name and MIME type, only to choose which file to open; its
// content decides what it really is (see `readDocument`). Some OSes report no
// MIME type for dropped files, so the extension counts too.
function looksSupported(file: File): boolean {
	return (
		SUPPORTED_MIME_TYPES.has(file.type) || /\.(pdf|epub)$/i.test(file.name)
	);
}

// Chooses the one PDF or EPUB to open from a file picker or a drop. Enforces
// the same size cap as the upload API so a file that opens is also a file that
// can save.
export function pickDocument(files: ArrayLike<File>): DocumentPick {
	const all = Array.from(files);
	const file = all.find(looksSupported);
	if (!file) {
		return {
			ok: false,
			error: all[0]
				? `"${all[0].name}" isn't a PDF or EPUB. Only PDF and EPUB files can be opened.`
				: "No file was dropped.",
		};
	}
	if (file.size > MAX_FILE_SIZE) {
		return {
			ok: false,
			error: `"${file.name}" is too large. The maximum size is ${MAX_FILE_SIZE / (1024 * 1024)} MB.`,
		};
	}
	return { ok: true, file, ignored: all.length - 1 };
}

// Only drags from outside the browser carry "Files"; in-app drags (thumbnails,
// text selections) don't, so they never trigger the drop overlay.
export function hasExternalFiles(dataTransfer: DataTransfer | null): boolean {
	return Array.from(dataTransfer?.types ?? []).includes("Files");
}

// Counts nested dragenter/dragleave pairs. Moving onto a child fires
// dragenter(child) before dragleave(parent), so the depth only returns to 0
// when the drag leaves the window or is cancelled (Esc fires a final dragleave).
export function createDragDepth() {
	let depth = 0;
	return {
		enter(): boolean {
			depth++;
			return true;
		},
		leave(): boolean {
			depth = Math.max(0, depth - 1);
			return depth > 0;
		},
		reset() {
			depth = 0;
		},
	};
}
