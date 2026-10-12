import { readDocument, readEpubCover } from "$lib/services/openDocument";
import { downloadPdf } from "$lib/services/pdf-api";
import { getPdfiumLibrary } from "$lib/services/pdfium";

// Covers for the library picker: a PDF's first page, rendered client-side via
// PDFium, or an EPUB's own cover image. There is no server-side thumbnail, so
// each one costs a full download (+ render). We therefore cache by id for the
// session, dedupe in-flight requests, and cap how many load at once so a
// library of large documents doesn't jank the grid.

export interface DocumentCover {
	/** Image to show; null for an EPUB that has no cover image. */
	url: string | null;
	/** An EPUB's own title (for a title-based cover); null for PDFs. */
	title: string | null;
	/** An EPUB's authors, comma-separated; null when unknown or for PDFs. */
	author: string | null;
}

const cache = new Map<string, DocumentCover>();
const inflight = new Map<string, Promise<DocumentCover>>();

const MAX_CONCURRENT = 3;
let active = 0;
const waiting: (() => void)[] = [];

// Target CSS width of a cover is ~160–220px; render a touch larger for crispness
// on HiDPI, but cap the scale so a huge page doesn't produce an enormous bitmap.
const TARGET_WIDTH = 320;
const MAX_SCALE = 2;

async function renderFirstPage(bytes: Uint8Array): Promise<string> {
	const library = await getPdfiumLibrary();
	const doc = await library.loadDocument(bytes);
	try {
		const page = doc.getPage(0);
		const { originalWidth } = page.getOriginalSize();
		const scale = Math.min(MAX_SCALE, TARGET_WIDTH / originalWidth);
		const rendered = await page.render({ scale, render: "bitmap" });

		const canvas = document.createElement("canvas");
		canvas.width = rendered.width;
		canvas.height = rendered.height;
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("2D canvas context unavailable");
		ctx.putImageData(
			new ImageData(
				new Uint8ClampedArray(rendered.data.buffer as ArrayBuffer),
				rendered.width,
				rendered.height,
			),
			0,
			0,
		);
		return canvas.toDataURL("image/png");
	} finally {
		// Free the Wasm document handle — we only needed the first page.
		doc.destroy();
	}
}

// Run `task` under the concurrency gate, releasing the next waiter when done.
function schedule<T>(task: () => Promise<T>): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const run = () => {
			active++;
			task()
				.then(resolve, reject)
				.finally(() => {
					active--;
					waiting.shift()?.();
				});
		};
		if (active < MAX_CONCURRENT) run();
		else waiting.push(run);
	});
}

// The file is identified by content, as when opening it, so the cover is
// right even if the stored type and the bytes ever disagree.
async function loadCover(bytes: Uint8Array): Promise<DocumentCover> {
	const result = await readDocument(bytes, "document");
	if (!result.ok) throw new Error(result.error.description);
	if (result.document.type === "pdf") {
		return { url: await renderFirstPage(bytes), title: null, author: null };
	}
	const { book } = result.document.epub;
	// Never revoked: the cache keeps it for the session, like the PDF data URLs.
	const image = await readEpubCover(result.document.epub);
	return {
		url: image ? URL.createObjectURL(image) : null,
		title: book.metadata.title,
		author: book.metadata.creators.join(", ") || null,
	};
}

/** Session-cached cover for a saved document (PDF first page or EPUB cover). */
export function getThumbnailById(id: string): Promise<DocumentCover> {
	const cached = cache.get(id);
	if (cached) return Promise.resolve(cached);

	const existing = inflight.get(id);
	if (existing) return existing;

	const promise = schedule(async () => {
		const bytes = await downloadPdf(id);
		const cover = await loadCover(bytes);
		cache.set(id, cover);
		return cover;
	}).finally(() => inflight.delete(id));

	inflight.set(id, promise);
	return promise;
}
