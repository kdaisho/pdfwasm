import { downloadPdf } from "$lib/services/pdf-api";
import { getPdfiumLibrary } from "$lib/services/pdfium";

// First-page thumbnails for the library picker. Rendered client-side via PDFium
// (there is no server-side thumbnail), so each one costs a full download + render.
// We therefore cache by id for the session, dedupe in-flight requests, and cap how
// many render at once so a library of large PDFs doesn't jank the grid.

const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

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

/** Session-cached first-page thumbnail (PNG data URL) for a saved PDF. */
export function getThumbnailById(id: string): Promise<string> {
	const cached = cache.get(id);
	if (cached) return Promise.resolve(cached);

	const existing = inflight.get(id);
	if (existing) return existing;

	const promise = schedule(async () => {
		const bytes = await downloadPdf(id);
		const url = await renderFirstPage(bytes);
		cache.set(id, url);
		return url;
	}).finally(() => inflight.delete(id));

	inflight.set(id, promise);
	return promise;
}
