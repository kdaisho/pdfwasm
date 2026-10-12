<script lang="ts">
	import { onDestroy } from "svelte";
	import type { PDFiumLibrary, PDFiumDocument } from "@hyzyla/pdfium";
	import EpubPlaceholder from "$lib/components/EpubPlaceholder.svelte";
	import PdfDropZone from "$lib/components/PdfDropZone.svelte";
	import PdfSidebarItems from "$lib/components/PdfSidebarItems.svelte";
	import PdfViewer from "$lib/components/PdfViewer.svelte";
	import { ZOOM_BASE_WIDTH } from "$lib/constants/zoom";
	import { extractCharBoxes, RENDER_SCALE } from "$lib/services/charBoxes";
	import type { ParsedEpub } from "$lib/services/epub";
	import {
		readDocument,
		type OpenedDocument,
	} from "$lib/services/openDocument";
	import { downloadPdf, setLastPdf, uploadPdf } from "$lib/services/pdf-api";
	import { getAuth } from "$lib/stores/auth.svelte.js";
	import { currentPdfStore } from "$lib/stores/currentPdf.svelte.js";
	import { pendingPdfStore } from "$lib/stores/pendingPdf.svelte.js";
	import { sidebarStore } from "$lib/stores/sidebar.svelte.js";
	import { toaster } from "$lib/stores/toaster";
	import { formatFileSize } from "$lib/utils/format";
	import { takeDocument } from "$lib/utils/takeDocument";
	import type { PageData as PdfPageData } from "$lib/types";

	let { data } = $props();

	const auth = getAuth();

	let library: PDFiumLibrary | null = $state(null);
	let libLoading = $state(true);
	let libError: Error | null = $state(null);

	let pages: PdfPageData[] = $state([]);
	let docLoading = $state(false);
	let docError: Error | null = $state(null);
	let currentDoc: PDFiumDocument | null = $state(null);
	let charExtractionId = 0;
	let pdfBytes: Uint8Array | null = $state(null);
	// The open EPUB, if the current document is one (PDF state is cleared then).
	// Raw: the parsed book is large plain data and the archive wraps a JSZip
	// instance, neither of which should become a deep reactive proxy.
	let epub: ParsedEpub | null = $state.raw(null);
	let pdfFilename: string | null = $state(null);
	let splitMode = $state(false);
	let uploadStatus: "idle" | "uploading" | "saved" | "error" = $state("idle");
	let uploadError: string | null = $state(null);
	let thumbnailWidth = $state(ZOOM_BASE_WIDTH);

	// Both started in parallel by +page.ts load — just await them here
	async function init() {
		try {
			const [lib, lastPdfBytes] = await Promise.all([
				data.libraryPromise,
				data.lastPdfPromise,
			]);
			library = lib;

			// A selection handed off from the library picker takes precedence over
			// the last-opened PDF; consumed once so a refresh falls back to lastPdf.
			const pending = pendingPdfStore.take();
			if (pending?.type === "saved") {
				currentPdfStore.set({
					id: pending.id,
					type: pending.documentType,
					filename: pending.filename,
					subtitle: pending.subtitle,
				});
				await loadFromServer(pending.id, pending.filename);
			} else if (pending?.type === "file") {
				await loadFile(pending.file);
			} else if (lastPdfBytes) {
				const filename = data.lastPdfFilename ?? "Document";
				const result = await readDocument(lastPdfBytes, filename);
				if (result.ok) {
					uploadStatus = "saved";
					pdfFilename = data.lastPdfFilename;
					currentPdfStore.set({
						id: data.lastPdfId,
						type: result.document.type,
						filename,
						subtitle: null,
					});
					await showDocument(result.document);
				} else {
					docError = new Error(result.error.description);
				}
			}
		} catch (err: unknown) {
			libError = err instanceof Error ? err : new Error(String(err));
		} finally {
			libLoading = false;
		}
	}

	init();

	// Swap the viewer to `doc`, closing whatever was open before.
	async function showDocument(doc: OpenedDocument) {
		if (doc.type === "epub") {
			closePdf();
			epub = doc.epub;
			return;
		}
		epub = null;
		await loadPdfBytes(doc.bytes);
	}

	function closePdf() {
		charExtractionId++; // cancel any in-flight char extraction
		currentDoc?.destroy();
		currentDoc = null;
		pages = [];
		pdfBytes = null;
		splitMode = false;
		docError = null;
		docLoading = false;
	}

	async function loadPdfBytes(uint8: Uint8Array) {
		if (!library) return;

		docLoading = true;
		docError = null;
		pages = [];
		splitMode = false;

		currentDoc?.destroy();
		currentDoc = null;

		const extractionId = ++charExtractionId;

		try {
			pdfBytes = uint8;
			const doc = await library.loadDocument(uint8);
			currentDoc = doc;

			const pageCount = doc.getPageCount();
			const pageDataList: PdfPageData[] = [];

			for (let i = 0; i < pageCount; i++) {
				const page = doc.getPage(i);
				const { originalWidth, originalHeight } =
					page.getOriginalSize();
				pageDataList.push({
					index: i,
					originalWidth,
					originalHeight,
					width: Math.round(originalWidth * RENDER_SCALE),
					height: Math.round(originalHeight * RENDER_SCALE),
					chars: [],
					scale: RENDER_SCALE,
				});
			}

			pages = pageDataList;
			docLoading = false;

			// Not awaited: callers (e.g. init) must not hold the viewer behind a
			// loading screen until every page's text has been extracted.
			void extractAllChars(doc, extractionId);
		} catch (err: unknown) {
			docError = err instanceof Error ? err : new Error(String(err));
			docLoading = false;
		}
	}

	async function extractAllChars(doc: PDFiumDocument, extractionId: number) {
		try {
			for (let i = 0; i < pages.length; i++) {
				if (extractionId !== charExtractionId) return;
				// Visible pages extract their own chars on render; re-extracting
				// would swap in a new array and invalidate that page's search cache.
				if (pages[i].chars.length > 0) continue;
				const page = doc.getPage(i);
				const chars = extractCharBoxes(page);
				pages[i].chars = chars;
				await new Promise((r) => setTimeout(r, 0));
			}
		} catch (err: unknown) {
			if (extractionId !== charExtractionId) return;
			docError = err instanceof Error ? err : new Error(String(err));
		}
	}

	async function loadFile(file: File) {
		if (!library) return;

		const buffer = await file.arrayBuffer();
		const result = await readDocument(
			new Uint8Array(buffer),
			file.name,
			file.type,
		);
		// An unreadable EPUB leaves the current document open and isn't saved.
		if (!result.ok) {
			toaster.error(result.error);
			return;
		}

		uploadStatus = "idle";
		uploadError = null;

		const type = result.document.type;
		pdfFilename = file.name;
		currentPdfStore.set({
			id: null,
			type,
			filename: file.name,
			subtitle: formatFileSize(file.size),
		});
		await showDocument(result.document);

		if (auth.isAuthenticated) {
			uploadStatus = "uploading";
			uploadPdf(file)
				.then((meta) => {
					uploadStatus = "saved";
					// Now that it's saved, the dock can show its cover.
					if (currentPdfStore.value?.filename === file.name) {
						currentPdfStore.set({
							id: meta.id,
							type,
							filename: file.name,
							subtitle: formatFileSize(file.size),
						});
					}
					setLastPdf(meta.id).catch(() => {});
				})
				.catch((err: unknown) => {
					uploadStatus = "error";
					uploadError =
						err instanceof Error ? err.message : "Upload failed";
				});
		}
	}

	async function loadFromServer(id: string, filename?: string) {
		if (!library) return;

		uploadStatus = "idle";
		uploadError = null;

		try {
			const uint8 = await downloadPdf(id);
			const result = await readDocument(uint8, filename ?? "Document");
			if (!result.ok) throw new Error(result.error.description);
			pdfFilename = filename ?? null;
			await showDocument(result.document);
			uploadStatus = "saved";
			setLastPdf(id).catch(() => {});
		} catch (err: unknown) {
			docError = err instanceof Error ? err : new Error(String(err));
		}
	}

	function dismissDocError() {
		docError = null;
	}

	function handleFileChange(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = takeDocument(input.files);
		if (file) void loadFile(file);
	}

	// Register sidebar items
	$effect(() => {
		sidebarStore.set(PdfSidebarItems, {
			onFileChange: handleFileChange,
			splitMode,
			onToggleSplit: () => {
				splitMode = !splitMode;
			},
			showSplit: pages.length > 0,
			uploadStatus,
			uploadError,
			docLoading,
			docError,
			onDismissError: dismissDocError,
			thumbnailWidth,
			onThumbnailWidthChange: (value: number) => {
				thumbnailWidth = value;
			},
			showZoom: pages.length > 0,
			hasDocument: pages.length > 0 || epub !== null,
		});
	});

	// On logout, clear the open document and per-document controls so the view
	// reflects a signed-out, empty state. Only fire on the authenticated →
	// unauthenticated transition, not on initial load or while staying logged out
	// (a signed-out user can still open a local PDF).
	let wasAuthenticated = auth.isAuthenticated;
	$effect(() => {
		const isAuth = auth.isAuthenticated;
		if (wasAuthenticated && !isAuth) resetViewer();
		wasAuthenticated = isAuth;
	});

	function resetViewer() {
		closePdf();
		epub = null;
		pdfFilename = null;
		uploadStatus = "idle";
		uploadError = null;
		currentPdfStore.clear();
	}

	onDestroy(() => {
		sidebarStore.clear();
	});
</script>

<PdfDropZone onFile={(file) => void loadFile(file)} />

{#if libLoading}
	<div
		class="flex items-center justify-center h-full text-lg text-surface-500"
	>
		Loading PDFium Wasm…
	</div>
{:else if libError}
	<div class="flex items-center justify-center h-full text-lg text-error-500">
		Failed to load PDFium: {libError.message}
	</div>
{:else if epub}
	<EpubPlaceholder {epub} filename={pdfFilename ?? "Document"} />
{:else if pages.length > 0 && currentDoc && pdfBytes}
	<PdfViewer
		{pages}
		doc={currentDoc}
		{splitMode}
		{pdfBytes}
		sourceFilename={pdfFilename}
		{thumbnailWidth}
		onThumbnailWidthChange={(value) => {
			thumbnailWidth = value;
		}}
	/>
{:else if !docLoading}
	<div
		class="flex items-center justify-center h-full text-lg text-surface-500"
	>
		Open a PDF or EPUB file to get started.
	</div>
{/if}
