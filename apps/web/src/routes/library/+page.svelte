<script lang="ts">
	import { onDestroy, tick, untrack } from "svelte";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import PdfCard from "$lib/components/PdfCard.svelte";
	import PdfLibrarySidebar from "$lib/components/PdfLibrarySidebar.svelte";
	import { deletePdf, type PdfDocumentMeta } from "$lib/services/pdf-api";
	import { currentPdfStore } from "$lib/stores/currentPdf.svelte.js";
	import { pendingPdfStore } from "$lib/stores/pendingPdf.svelte.js";
	import { sidebarStore } from "$lib/stores/sidebar.svelte.js";
	import { formatDate, formatFileSize } from "$lib/utils/format";
	import { flyToDock } from "$lib/utils/flyToDock";

	let { data } = $props();

	// data.pdfs is the load snapshot; keep a local copy so deletes update the grid.
	// The page remounts on every navigation, so seeding from data once is intended.
	let pdfs = $state<PdfDocumentMeta[]>(untrack(() => data.pdfs));
	let deleteError = $state<string | null>(null);

	async function openPdf(pdf: PdfDocumentMeta, cover: HTMLElement) {
		const subtitle = `${formatFileSize(pdf.fileSize)} · ${formatDate(pdf.uploadedAt)}`;

		// Populate the dock now so it's mounted as the flight's landing target;
		// the viewer re-affirms it from the pending request after navigation.
		currentPdfStore.set({ id: pdf.id, filename: pdf.filename, subtitle });
		pendingPdfStore.request({
			type: "saved",
			id: pdf.id,
			filename: pdf.filename,
			subtitle,
		});

		await tick();
		const target = document.querySelector<HTMLElement>(
			"[data-now-viewing-cover]",
		);
		if (target) flyToDock(cover, target);

		goto(resolve("/"));
	}

	async function removePdf(pdf: PdfDocumentMeta) {
		deleteError = null;
		const previous = pdfs;
		pdfs = pdfs.filter((p) => p.id !== pdf.id); // optimistic
		try {
			await deletePdf(pdf.id);
		} catch (err) {
			pdfs = previous;
			deleteError = err instanceof Error ? err.message : "Delete failed";
		}
	}

	// Own the sidebar while this route is mounted (mirrors the viewer's pattern).
	$effect(() => {
		sidebarStore.set(PdfLibrarySidebar, {});
	});

	onDestroy(() => sidebarStore.clear());
</script>

<div class="px-[34px] pb-16 pt-[30px]">
	<div class="mb-6">
		<h1 class="text-[21px] font-bold tracking-tight text-surface-900">
			My PDFs
		</h1>
		<p class="mt-1 text-[13.5px] text-surface-500">
			Pick up where you left off — choose a document by its cover.
		</p>
	</div>

	{#if data.loadError}
		<p class="text-sm text-error-500">{data.loadError}</p>
	{:else if pdfs.length === 0}
		<div
			class="flex max-w-[1100px] flex-col items-center justify-center rounded-xl border border-dashed border-surface-300 py-16 text-center"
		>
			<p class="text-sm font-medium text-surface-600">
				No saved PDFs yet
			</p>
			<p class="mt-1 text-[13px] text-surface-400">
				Open a PDF and it'll show up here for next time.
			</p>
		</div>
	{:else}
		{#if deleteError}
			<p class="mb-4 text-sm text-error-500">{deleteError}</p>
		{/if}
		<div
			class="grid max-w-[1100px] grid-cols-[repeat(auto-fill,minmax(158px,1fr))] gap-x-[22px] gap-y-[26px]"
		>
			{#each pdfs as pdf (pdf.id)}
				<PdfCard {pdf} onOpen={openPdf} onDelete={removePdf} />
			{/each}
		</div>
	{/if}
</div>
