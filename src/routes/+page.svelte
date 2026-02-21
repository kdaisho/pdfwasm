<script lang="ts">
	import { onMount } from "svelte";
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
	let currentDoc: PDFiumDocument | null = null;

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

		currentDoc?.destroy();
		currentDoc = null;

		try {
			const buffer = await file.arrayBuffer();
			const uint8 = new Uint8Array(buffer);
			const doc = await library.loadDocument(uint8);
			currentDoc = doc;

			const pageDataList: PageData[] = [];

			for (const page of doc.pages()) {
				const chars = extractCharBoxes(page);
				const rendered = await page.render({
					scale: RENDER_SCALE,
					render: "bitmap",
				});

				const imageData = new ImageData(
					new Uint8ClampedArray(rendered.data.buffer),
					rendered.width,
					rendered.height,
				);

				pageDataList.push({
					index: page.number,
					imageData,
					width: rendered.width,
					height: rendered.height,
					originalWidth: rendered.originalWidth,
					originalHeight: rendered.originalHeight,
					chars,
					scale: RENDER_SCALE,
				});
			}

			pages = pageDataList;
		} catch (err: unknown) {
			docError = err instanceof Error ? err : new Error(String(err));
		} finally {
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
	<div class="center">Loading PDFium Wasm…</div>
{:else if libError}
	<div class="center">Failed to load PDFium: {libError.message}</div>
{:else}
	<div>
		<div class="toolbar">
			<h2 class="title">PDF Viewer</h2>
			<label class="button">
				Open PDF
				<input
					type="file"
					accept=".pdf"
					onchange={handleFileChange}
					style="display:none"
				/>
			</label>
			{#if docLoading}
				<span class="status">Rendering pages…</span>
			{/if}
			{#if docError}
				<span class="error-text">Error: {docError.message}</span>
			{/if}
		</div>

		{#if pages.length > 0}
			<PdfViewer {pages} />
		{:else if !docLoading}
			<div class="center">Open a PDF file to get started.</div>
		{/if}
	</div>
{/if}

<style>
	.center {
		display: flex;
		justify-content: center;
		align-items: center;
		height: 80vh;
		font-size: 18px;
		color: #555;
	}
	.toolbar {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 10px 16px;
		background: #f5f5f5;
		border-bottom: 1px solid #ddd;
	}
	.title {
		margin: 0;
		font-size: 18px;
		font-weight: 600;
	}
	.button {
		padding: 6px 14px;
		background: #4f6ef7;
		color: #fff;
		border-radius: 4px;
		cursor: pointer;
		font-size: 14px;
		user-select: none;
	}
	.status {
		font-size: 13px;
		color: #555;
	}
	.error-text {
		font-size: 13px;
		color: #c00;
	}
</style>
