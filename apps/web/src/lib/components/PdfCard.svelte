<script lang="ts">
	import type { PdfDocumentMeta } from "$lib/services/pdf-api";
	import PdfCover from "./PdfCover.svelte";

	interface Props {
		pdf: PdfDocumentMeta;
		onOpen: (pdf: PdfDocumentMeta) => void;
		onDelete: (pdf: PdfDocumentMeta) => void;
	}

	let { pdf, onOpen, onDelete }: Props = $props();

	function formatSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString();
	}
</script>

<div class="group relative flex flex-col text-left">
	<button
		type="button"
		class="block cursor-pointer border-none bg-transparent p-0 transition-transform duration-200 ease-out hover:-translate-y-[3px]"
		onclick={() => onOpen(pdf)}
	>
		<PdfCover
			id={pdf.id}
			filename={pdf.filename}
			class="aspect-[1/1.3] w-full rounded-lg shadow-md transition-shadow duration-200 group-hover:shadow-xl"
		/>
	</button>

	<div class="mt-3 truncate text-[12.5px] font-semibold text-surface-700">
		{pdf.filename}
	</div>
	<div class="mt-[3px] font-mono text-[10.5px] text-surface-400">
		{formatSize(pdf.fileSize)} · {formatDate(pdf.uploadedAt)}
	</div>

	<button
		type="button"
		class="absolute right-1.5 top-1.5 flex h-[22px] w-[22px] cursor-pointer items-center justify-center rounded-full border-none bg-error-500 text-[13px] font-bold text-white opacity-0 shadow-md transition-opacity duration-150 hover:bg-error-600 group-hover:opacity-100"
		title="Delete {pdf.filename}"
		aria-label="Delete {pdf.filename}"
		onclick={(e) => {
			e.stopPropagation();
			onDelete(pdf);
		}}
	>
		x
	</button>
</div>
