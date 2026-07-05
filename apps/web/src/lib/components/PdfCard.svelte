<script lang="ts">
	import type { PdfDocumentMeta } from "$lib/services/pdf-api";
	import { formatDate, formatFileSize } from "$lib/utils/format";
	import XIcon from "./icons/XIcon.svelte";
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

<div class="group relative flex flex-col text-left">
	<button
		type="button"
		class="block cursor-pointer border-none bg-transparent p-0 transition-transform duration-200 ease-out hover:-translate-y-[3px]"
		onclick={() => coverEl && onOpen(pdf, coverEl)}
	>
		<div
			bind:this={coverEl}
			class="aspect-[1/1.3] w-full cursor-pointer overflow-hidden rounded-lg shadow-md transition-shadow duration-200 group-hover:shadow-xl"
		>
			<PdfCover
				id={pdf.id}
				filename={pdf.filename}
				class="h-full w-full"
			/>
		</div>
	</button>

	<div class="mt-3 truncate text-[12.5px] font-semibold text-surface-700">
		{pdf.filename}
	</div>
	<div class="mt-[3px] font-mono text-[10.5px] text-surface-400">
		{formatFileSize(pdf.fileSize)} · {formatDate(pdf.uploadedAt)}
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
		<XIcon size={11} />
	</button>
</div>
