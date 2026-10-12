import { DOCUMENT_MIME_TYPES } from "@pdfwasm/shared/constants";
import {
	EpubError,
	parseEpub,
	type EpubBook,
	type EpubErrorCode,
	type ParsedEpub,
} from "./epub";

/** A file that has been identified by its content and is ready to show. */
export type OpenedDocument =
	| { type: "pdf"; bytes: Uint8Array }
	| { type: "epub"; bytes: Uint8Array; epub: ParsedEpub };

/** Why a file couldn't be opened, ready for a toast. */
export interface DocumentError {
	title: string;
	description: string;
}

export type ReadDocumentResult =
	| { ok: true; document: OpenedDocument }
	| { ok: false; error: DocumentError };

/** `not-epub`: a zip archive without the EPUB `mimetype` entry. */
export type EpubOpenFailure = EpubErrorCode | "not-epub";

const PDF_HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
const ZIP_HEADER = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04"
// PDF readers accept the header anywhere in the first 1 KB.
const PDF_HEADER_WINDOW = 1024;

function startsWith(bytes: Uint8Array, signature: number[], at = 0): boolean {
	return signature.every((byte, i) => bytes[at + i] === byte);
}

/** What the bytes look like: a PDF, a zip archive (maybe an EPUB), or neither. */
export function sniffDocumentType(bytes: Uint8Array): "pdf" | "zip" | null {
	if (startsWith(bytes, ZIP_HEADER)) return "zip";
	const end = Math.min(bytes.length, PDF_HEADER_WINDOW) - PDF_HEADER.length;
	for (let at = 0; at <= end; at++) {
		if (startsWith(bytes, PDF_HEADER, at)) return "pdf";
	}
	return null;
}

const DAMAGED = "Couldn't open file";

const EPUB_FAILURE_REASONS: Record<
	Exclude<EpubOpenFailure, "drm-encrypted">,
	string
> = {
	"invalid-zip":
		"isn't a valid EPUB. The file is damaged, or isn't an EPUB at all.",
	"missing-container":
		"isn't a valid EPUB. It's missing the container file that says where the book starts.",
	"missing-package":
		"is damaged. The book's package document (its metadata and chapter list) is missing.",
	"invalid-package":
		"is damaged. The book's package document can't be read, or lists no chapters.",
	"missing-resource": "is damaged. A file inside the book is missing.",
	"not-epub":
		"isn't an EPUB. It's a zip archive without the EPUB mimetype marker.",
};

/** A readable reason for each way an EPUB can fail to open. */
export function epubOpenError(
	failure: EpubOpenFailure,
	filename: string,
): DocumentError {
	if (failure === "drm-encrypted") {
		return {
			title: "Can't open a DRM-protected book",
			description: `"${filename}" is locked with DRM (copy protection), so it can't be opened or saved here. Try a DRM-free copy of the book.`,
		};
	}
	return {
		title: DAMAGED,
		description: `"${filename}" ${EPUB_FAILURE_REASONS[failure]}`,
	};
}

async function hasEpubMimetype(epub: ParsedEpub): Promise<boolean> {
	if (!epub.archive.has("mimetype")) return false;
	const mimetype = await epub.archive.readText("mimetype");
	return mimetype.trim() === DOCUMENT_MIME_TYPES.epub;
}

async function readEpub(
	bytes: Uint8Array,
	filename: string,
): Promise<ReadDocumentResult> {
	try {
		const epub = await parseEpub(bytes);
		if (!(await hasEpubMimetype(epub))) {
			return { ok: false, error: epubOpenError("not-epub", filename) };
		}
		return { ok: true, document: { type: "epub", bytes, epub } };
	} catch (err) {
		if (err instanceof EpubError) {
			return { ok: false, error: epubOpenError(err.code, filename) };
		}
		return {
			ok: false,
			error: {
				title: DAMAGED,
				description: `"${filename}" couldn't be read as an EPUB.`,
			},
		};
	}
}

/**
 * Identify a file by its content and get it ready to show.
 *
 * A PDF header means PDF; a zip archive is opened as an EPUB, which must carry
 * the EPUB `mimetype` entry. Only when the content is neither do the name and
 * MIME type choose the parser: an `.epub` goes to the EPUB parser (which
 * explains what's wrong), anything else to the PDF viewer, as before EPUB
 * support.
 */
export async function readDocument(
	bytes: Uint8Array,
	filename: string,
	mimeType = "",
): Promise<ReadDocumentResult> {
	const sniffed = sniffDocumentType(bytes);
	const namedEpub =
		mimeType === DOCUMENT_MIME_TYPES.epub || /\.epub$/i.test(filename);
	if (sniffed === "zip" || (sniffed === null && namedEpub)) {
		return readEpub(bytes, filename);
	}
	return { ok: true, document: { type: "pdf", bytes } };
}

/** The book's cover image, or null when it has none (or it isn't in the zip). */
export async function readEpubCover(epub: ParsedEpub): Promise<Blob | null> {
	const cover = epub.book.cover;
	if (!cover || cover.remote || !epub.archive.has(cover.path)) return null;
	const bytes = await epub.archive.readBytes(cover.path);
	return new Blob([bytes], { type: cover.mediaType });
}

/** The book's own title, else the filename without its extension. */
export function documentTitle(book: EpubBook, filename: string): string {
	return (
		book.metadata.title ?? (filename.replace(/\.[^.]+$/, "") || "Untitled")
	);
}
