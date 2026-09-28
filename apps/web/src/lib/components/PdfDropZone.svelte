<script lang="ts">
	import { MAX_FILE_SIZE } from "@pdfwasm/shared/constants";
	import { createDragDepth, hasExternalFiles } from "$lib/utils/pdfFile";
	import { takePdf } from "$lib/utils/takePdf";

	interface Props {
		onFile: (file: File) => void;
	}

	let { onFile }: Props = $props();

	const depth = createDragDepth();
	let active = $state(false);

	// Listeners sit on the window so a drop anywhere is caught. Without
	// preventDefault on dragover/drop the browser would open the file itself and
	// navigate away. Non-file drags are left alone so text can still be dropped
	// into inputs.
	function handleDragEnter(e: DragEvent) {
		if (!hasExternalFiles(e.dataTransfer)) return;
		e.preventDefault();
		active = depth.enter();
	}

	function handleDragOver(e: DragEvent) {
		if (!hasExternalFiles(e.dataTransfer)) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
	}

	function handleDragLeave(e: DragEvent) {
		if (!hasExternalFiles(e.dataTransfer)) return;
		active = depth.leave();
	}

	function handleDrop(e: DragEvent) {
		if (!hasExternalFiles(e.dataTransfer)) return;
		e.preventDefault();
		depth.reset();
		active = false;
		const file = takePdf(e.dataTransfer?.files);
		if (file) onFile(file);
	}
</script>

<svelte:window
	ondragenter={handleDragEnter}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
/>

{#if active}
	<!-- pointer-events-none: the overlay must not become the drag target itself. -->
	<div
		class="pointer-events-none fixed inset-0 z-50 flex bg-surface-50-950/80 p-6 backdrop-blur-sm"
	>
		<div
			class="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary-500 text-center"
		>
			<svg
				width="28"
				height="28"
				viewBox="0 0 14 14"
				fill="none"
				aria-hidden="true"
				class="text-primary-500"
			>
				<path
					d="M7 1v8M3 6l4 4 4-4M2 11h10"
					stroke="currentColor"
					stroke-width="1.2"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
			<p class="text-base font-semibold text-surface-950-50">
				Drop a PDF to open it
			</p>
			<p class="text-[13px] text-surface-600-400">
				One PDF at a time, up to {MAX_FILE_SIZE / (1024 * 1024)} MB
			</p>
		</div>
	</div>
{/if}
