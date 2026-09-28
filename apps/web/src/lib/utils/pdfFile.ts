import { MAX_FILE_SIZE } from "@pdfwasm/shared/constants";

export type PdfPick =
	| { ok: true; file: File; ignored: number }
	| { ok: false; error: string };

// Some OSes report no MIME type for dropped files, so fall back to the extension.
function isPdf(file: File): boolean {
	return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

// Chooses the one PDF to open from a file picker or a drop. Enforces the same
// size cap as the upload API so a file that opens is also a file that can save.
export function pickPdf(files: ArrayLike<File>): PdfPick {
	const all = Array.from(files);
	const file = all.find(isPdf);
	if (!file) {
		return {
			ok: false,
			error: all[0]
				? `"${all[0].name}" isn't a PDF. Only PDF files can be opened.`
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
