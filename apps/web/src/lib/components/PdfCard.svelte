<script lang="ts">
	import type { PdfDocumentMeta } from "$lib/services/pdf-api";
	import { formatDate, formatFileSize } from "$lib/utils/format";
	import DeleteWithConfirmation from "./DeleteWithConfirmation.svelte";
	import PdfCover from "./PdfCover.svelte";

	interface Props {
		pdf: PdfDocumentMeta;
		/** `cover` is the DOM node to fly to the dock on open. */
		onOpen: (pdf: PdfDocumentMeta, cover: HTMLElement) => void;
		onDelete: (pdf: PdfDocumentMeta) => void;
	}

	let { pdf, onOpen, onDelete }: Props = $props();

	let coverEl: HTMLElement | undefined = $state();
</script>

<!-- The whole card is the click target so the pointer cursor and open action
     are consistent across the cover and its filename/meta, not just the cover. -->
<div
	class="group relative flex cursor-pointer flex-col text-left"
	role="button"
	tabindex="0"
	onclick={() => coverEl && onOpen(pdf, coverEl)}
	onkeydown={(e) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			if (coverEl) onOpen(pdf, coverEl);
		}
	}}
>
	<div
		bind:this={coverEl}
		class="aspect-[1/1.3] w-full overflow-hidden rounded-lg shadow-md transition-[transform,box-shadow] duration-200 ease-out group-hover:-translate-y-[3px] group-hover:shadow-xl"
	>
		<PdfCover id={pdf.id} filename={pdf.filename} class="h-full w-full" />
	</div>

	<div class="mt-3 truncate text-[12.5px] font-semibold text-surface-700">
		{pdf.filename}
	</div>
	<div class="mt-[3px] font-mono text-[10.5px] text-surface-400">
		{formatFileSize(pdf.fileSize)} · {formatDate(pdf.uploadedAt)}
	</div>

	<DeleteWithConfirmation
		label={pdf.filename}
		onConfirm={() => onDelete(pdf)}
		class="absolute right-1.5 top-1.5 h-[22px] w-[22px] opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
	/>
</div>
