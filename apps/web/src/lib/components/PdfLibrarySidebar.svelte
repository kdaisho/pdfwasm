<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { pendingPdfStore } from "$lib/stores/pendingPdf.svelte.js";

	// Opening a local file is a viewer action; stash the file and hand off to /.
	function handleFileChange(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) {
			pendingPdfStore.request({ type: "file", file });
			goto(resolve("/"));
		}
	}
</script>

<div class="flex flex-col gap-2 p-[10px]">
	<label
		class="flex w-full cursor-pointer items-center gap-2 rounded-lg bg-primary-500 px-[10px] py-2 text-[13px] font-medium text-primary-contrast-500 transition-colors hover:bg-primary-600"
	>
		<svg
			width="14"
			height="14"
			viewBox="0 0 14 14"
			fill="none"
			aria-hidden="true"
		>
			<path
				d="M7 1v8M3 6l4 4 4-4M2 11h10"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
		Open PDF
		<input
			type="file"
			accept=".pdf"
			onchange={handleFileChange}
			class="hidden"
		/>
	</label>

	<span
		class="flex w-full items-center gap-2 rounded-lg bg-primary-50 px-[10px] py-2 text-[13px] font-medium text-primary-600"
		aria-current="page"
	>
		<svg
			width="14"
			height="14"
			viewBox="0 0 14 14"
			fill="none"
			aria-hidden="true"
		>
			<rect
				x="2"
				y="2"
				width="4"
				height="4"
				rx="1"
				stroke="currentColor"
				stroke-width="1.3"
			/>
			<rect
				x="8"
				y="2"
				width="4"
				height="4"
				rx="1"
				stroke="currentColor"
				stroke-width="1.3"
			/>
			<rect
				x="2"
				y="8"
				width="4"
				height="4"
				rx="1"
				stroke="currentColor"
				stroke-width="1.3"
			/>
			<rect
				x="8"
				y="8"
				width="4"
				height="4"
				rx="1"
				stroke="currentColor"
				stroke-width="1.3"
			/>
		</svg>
		My PDFs
	</span>
</div>
