<script lang="ts">
	import { onDestroy } from "svelte";
	import type { PDFiumLibrary, PDFiumDocument } from "@hyzyla/pdfium";
	import { extractCharBoxes, RENDER_SCALE } from "$lib/services/charBoxes";
	import { getAuth } from "$lib/stores/auth.svelte.js";
	import { sidebarStore } from "$lib/stores/sidebar.svelte.js";
	import { uploadPdf, downloadPdf, setLastPdf } from "$lib/services/pdf-api";
	import type { PageData as PdfPageData } from "$lib/types";
	import PdfViewer from "$lib/components/PdfViewer.svelte";
	import PdfSidebarItems from "$lib/components/PdfSidebarItems.svelte";

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
	let pdfFilename: string | null = $state(null);
	let splitMode = $state(false);
	let uploadStatus: "idle" | "uploading" | "saved" | "error" = $state("idle");
	let uploadError: string | null = $state(null);
	let thumbnailWidth = $state(250);

	// Both started in parallel by +page.ts load — just await them here
	async function init() {
		try {
			const [lib, lastPdfBytes] = await Promise.all([
				data.libraryPromise,
				data.lastPdfPromise,
			]);
			library = lib;

			if (lastPdfBytes) {
				uploadStatus = "saved";
				pdfFilename = data.lastPdfFilename;
				await loadPdfBytes(lastPdfBytes);
			}
		} catch (err: unknown) {
			libError = err instanceof Error ? err : new Error(String(err));
		} finally {
			libLoading = false;
		}
	}

	init();

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

			for (let i = 0; i < pageCount; i++) {
				if (extractionId !== charExtractionId) return;
				const page = doc.getPage(i);
				const chars = extractCharBoxes(page);
				pages[i].chars = chars;
				await new Promise((r) => setTimeout(r, 0));
			}
		} catch (err: unknown) {
			docError = err instanceof Error ? err : new Error(String(err));
			docLoading = false;
		}
	}

	async function loadFile(file: File) {
		if (!library) return;

		uploadStatus = "idle";
		uploadError = null;

		const buffer = await file.arrayBuffer();
		const uint8 = new Uint8Array(buffer);

		pdfFilename = file.name;
		await loadPdfBytes(uint8);

		if (auth.isAuthenticated) {
			uploadStatus = "uploading";
			uploadPdf(file)
				.then((meta) => {
					uploadStatus = "saved";
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
			pdfFilename = filename ?? null;
			await loadPdfBytes(uint8);
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
		const file = input.files?.[0];
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
			onSelectPdf: (id: string, filename: string) =>
				loadFromServer(id, filename),
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
		});
	});

	onDestroy(() => {
		sidebarStore.clear();
	});
</script>

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
{:else if pages.length > 0 && currentDoc && pdfBytes}
	<PdfViewer
		{pages}
		doc={currentDoc}
		{splitMode}
		{pdfBytes}
		sourceFilename={pdfFilename}
		{thumbnailWidth}
	/>
{:else if !docLoading}
	<div
		class="flex items-center justify-center h-full text-lg text-surface-500"
	>
		Open a PDF file to get started.
	</div>
{/if}
