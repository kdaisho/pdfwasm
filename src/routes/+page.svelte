<script lang="ts">
	import { onMount } from "svelte";
	import { AppBar } from "@skeletonlabs/skeleton-svelte";
	import type { PDFiumLibrary, PDFiumDocument } from "@hyzyla/pdfium";
	import { getPdfiumLibrary } from "$lib/services/pdfium";
	import { extractCharBoxes, RENDER_SCALE } from "$lib/services/charBoxes";
	import type { PageData } from "$lib/types";
	import PdfViewer from "$lib/components/PdfViewer.svelte";

	let library: PDFiumLibrary | null = $state(null);
	let libLoading = $state(true);
	let libError: Error | null = $state(null);

	let pages: PageData[] = $state([]);
	let docLoading = $state(false);
	let docError: Error | null = $state(null);
	let currentDoc: PDFiumDocument | null = $state(null);
	let charExtractionId = 0;
	let pdfBytes: Uint8Array | null = $state(null);
	let splitMode = $state(false);

	onMount(() => {
		getPdfiumLibrary()
			.then((lib) => {
				library = lib;
			})
			.catch((err: unknown) => {
				libError = err instanceof Error ? err : new Error(String(err));
			})
			.finally(() => {
				libLoading = false;
			});
	});

	async function loadFile(file: File) {
		if (!library) return;

		docLoading = true;
		docError = null;
		pages = [];
		splitMode = false;

		currentDoc?.destroy();
		currentDoc = null;

		// Cancel any in-progress background char extraction
		const extractionId = ++charExtractionId;

		try {
			const buffer = await file.arrayBuffer();
			const uint8 = new Uint8Array(buffer);
			pdfBytes = uint8;
			const doc = await library.loadDocument(uint8);
			currentDoc = doc;

			// Phase 1: Build page metadata instantly (no render, no char extraction)
			const pageCount = doc.getPageCount();
			const pageDataList: PageData[] = [];

			for (let i = 0; i < pageCount; i++) {
				const page = doc.getPage(i);
				const size = page.getSize(true);
				pageDataList.push({
					index: i,
					originalWidth: size.width,
					originalHeight: size.height,
					width: Math.round(size.width * RENDER_SCALE),
					height: Math.round(size.height * RENDER_SCALE),
					chars: [],
					scale: RENDER_SCALE,
				});
			}

			pages = pageDataList;
			docLoading = false;

			// Phase 2: Background char extraction for search
			for (let i = 0; i < pageCount; i++) {
				if (extractionId !== charExtractionId) return;
				const page = doc.getPage(i);
				const chars = extractCharBoxes(page);
				pages[i].chars = chars;
				// Yield to main thread between pages
				await new Promise((r) => setTimeout(r, 0));
			}
		} catch (err: unknown) {
			docError = err instanceof Error ? err : new Error(String(err));
			docLoading = false;
		}
	}

	function handleFileChange(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) void loadFile(file);
	}
</script>

{#if libLoading}
	<div
		class="flex items-center justify-center h-[80vh] text-lg text-surface-500"
	>
		Loading PDFium Wasm…
	</div>
{:else if libError}
	<div
		class="flex items-center justify-center h-[80vh] text-lg text-error-500"
	>
		Failed to load PDFium: {libError.message}
	</div>
{:else}
	<div>
		<AppBar>
			<AppBar.Toolbar class="flex gap-4 items-center px-4 py-2">
				<AppBar.Lead>
					<h2 class="text-lg font-semibold">PDF Viewer</h2>
				</AppBar.Lead>
				<AppBar.Trail class="flex gap-2">
					<label class="btn preset-filled cursor-pointer">
						Open PDF
						<input
							type="file"
							accept=".pdf"
							onchange={handleFileChange}
							class="hidden"
						/>
					</label>
					{#if pages.length > 0}
						<button
							class="btn {splitMode
								? 'preset-filled-error-500'
								: 'preset-filled'}"
							onclick={() => {
								splitMode = !splitMode;
							}}
						>
							{splitMode ? "Exit Split Mode" : "Split Mode"}
						</button>
					{/if}
					{#if docLoading}
						<span class="text-sm text-surface-500"
							>Rendering pages…</span
						>
					{/if}
					{#if docError}
						<span class="text-sm text-error-500"
							>Error: {docError.message}</span
						>
					{/if}
				</AppBar.Trail>
			</AppBar.Toolbar>
		</AppBar>

		{#if pages.length > 0 && currentDoc && pdfBytes}
			<PdfViewer {pages} doc={currentDoc} {splitMode} {pdfBytes} />
		{:else if !docLoading}
			<div
				class="flex items-center justify-center h-[80vh] text-lg text-surface-500"
			>
				Open a PDF file to get started.
			</div>
		{/if}
	</div>
{/if}
