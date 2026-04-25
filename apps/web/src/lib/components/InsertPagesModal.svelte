<script lang="ts">
	import { Dialog, Portal } from "@skeletonlabs/skeleton-svelte";
	import type { PDFiumDocument } from "@hyzyla/pdfium";
	import { getPdfiumLibrary } from "$lib/services/pdfium";

	export interface ConfirmPayload {
		sourceName: string;
		sourceBytes: Uint8Array;
		sourcePageCount: number;
		selectedPageIndices: number[];
	}

	interface Props {
		open: boolean;
		onconfirm: (payload: ConfirmPayload) => void;
		oncancel: () => void;
	}

	let { open = $bindable(), onconfirm, oncancel }: Props = $props();

	const INSERT_PDF_SIZE_WARN_BYTES = 100 * 1024 * 1024;
	const THUMB_SCALE = 0.4;

	type Phase = "idle" | "warn-confirm" | "loading" | "select" | "error";
	let phase: Phase = $state("idle");
	let pickedFile: File | null = $state(null);
	let sourceBytes: Uint8Array | null = $state(null);
	let sourceDoc: PDFiumDocument | null = $state(null);
	let sourcePageCount = $state(0);
	let selectedPageIndices: Set<number> = $state(new Set());
	let errorMessage = $state("");

	function destroySourceDoc() {
		if (sourceDoc) {
			try {
				sourceDoc.destroy();
			} catch {
				/* noop */
			}
			sourceDoc = null;
		}
	}

	function resetState() {
		destroySourceDoc();
		phase = "idle";
		pickedFile = null;
		sourceBytes = null;
		sourcePageCount = 0;
		selectedPageIndices = new Set();
		errorMessage = "";
	}

	// Reset whenever the modal closes, regardless of reason.
	$effect(() => {
		if (!open) resetState();
	});

	function handleFilePicked(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		pickedFile = file;
		if (file.size > INSERT_PDF_SIZE_WARN_BYTES) {
			phase = "warn-confirm";
		} else {
			void loadPickedFile();
		}
	}

	async function loadPickedFile() {
		if (!pickedFile) return;
		phase = "loading";
		try {
			const bytes = new Uint8Array(await pickedFile.arrayBuffer());
			const library = await getPdfiumLibrary();
			const doc = await library.loadDocument(bytes);
			sourceBytes = bytes;
			sourceDoc = doc;
			sourcePageCount = doc.getPageCount();
			phase = "select";
		} catch {
			errorMessage =
				"This file could not be opened. It may be invalid, corrupted, or password-protected.";
			phase = "error";
		}
	}

	function pickAnotherFile() {
		destroySourceDoc();
		pickedFile = null;
		sourceBytes = null;
		sourcePageCount = 0;
		selectedPageIndices = new Set();
		errorMessage = "";
		phase = "idle";
	}

	function togglePage(i: number) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local throwaway, reassigned below
		const next = new Set(selectedPageIndices);
		if (next.has(i)) next.delete(i);
		else next.add(i);
		selectedPageIndices = next;
	}

	function handleConfirm() {
		if (selectedPageIndices.size === 0 || !sourceBytes || !pickedFile)
			return;
		const payload: ConfirmPayload = {
			sourceName: pickedFile.name,
			sourceBytes,
			sourcePageCount,
			selectedPageIndices: [...selectedPageIndices].sort((a, b) => a - b),
		};
		destroySourceDoc();
		onconfirm(payload);
		// Parent closes the modal by setting open = false.
	}

	function handleCancelBtn() {
		open = false;
		oncancel();
	}

	// Serialize thumbnail rendering so we don't pound PDFium with parallel
	// render calls on a large secondary PDF.
	let renderQueue: Promise<void> = Promise.resolve();

	function renderThumb(canvas: HTMLCanvasElement, pageIndex: number) {
		let aborted = false;
		renderQueue = renderQueue.then(async () => {
			if (aborted || !sourceDoc) return;
			try {
				const pdfPage = sourceDoc.getPage(pageIndex);
				const rendered = await pdfPage.render({
					scale: THUMB_SCALE,
					render: "bitmap",
				});
				if (aborted) return;
				canvas.width = rendered.width;
				canvas.height = rendered.height;
				const imageData = new ImageData(
					new Uint8ClampedArray(rendered.data.buffer as ArrayBuffer),
					rendered.width,
					rendered.height,
				);
				canvas.getContext("2d")?.putImageData(imageData, 0, 0);
			} catch {
				/* skip failed pages silently */
			}
		});
		return {
			destroy() {
				aborted = true;
			},
		};
	}
</script>

<Dialog
	{open}
	onOpenChange={({ open: newOpen }) => {
		if (!newOpen) {
			open = false;
			oncancel();
		}
	}}
>
	<Portal>
		<Dialog.Backdrop class="bg-black/50 fixed inset-0 z-50" />
		<Dialog.Positioner
			class="fixed inset-0 flex items-center justify-center z-50"
		>
			<Dialog.Content
				class="card preset-outlined-surface-200 p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-surface-50-950 rounded-xl"
			>
				<div class="flex items-center justify-between mb-4">
					<Dialog.Title class="text-xl font-bold"
						>Insert pages</Dialog.Title
					>
					<Dialog.CloseTrigger>
						<button
							class="btn-icon preset-tonal-surface"
							aria-label="Close">&times;</button
						>
					</Dialog.CloseTrigger>
				</div>

				{#if phase === "idle"}
					<div class="flex flex-col gap-4 py-6 text-center">
						<p class="text-sm text-surface-500">
							Choose a PDF to insert pages from.
						</p>
						<label
							class="btn preset-filled-primary-500 self-center cursor-pointer"
						>
							<span>Choose PDF…</span>
							<input
								type="file"
								accept="application/pdf"
								class="hidden"
								onchange={handleFilePicked}
							/>
						</label>
					</div>
				{:else if phase === "warn-confirm"}
					<div
						class="p-4 rounded-lg bg-warning-100-900 border border-warning-400-600 space-y-3"
						role="alert"
					>
						<div class="font-semibold text-warning-900-100">
							Large file
						</div>
						<p class="text-sm text-warning-800-200">
							{pickedFile?.name} is {Math.round(
								(pickedFile?.size ?? 0) / 1024 / 1024,
							)} MB. Continue loading? This may briefly slow the app.
						</p>
						<div class="flex justify-end gap-2">
							<button
								class="btn btn-sm preset-tonal-surface"
								onclick={pickAnotherFile}>Cancel</button
							>
							<button
								class="btn btn-sm preset-filled-primary-500"
								onclick={() => void loadPickedFile()}
								>Continue</button
							>
						</div>
					</div>
				{:else if phase === "loading"}
					<div class="flex flex-col items-center gap-3 py-12">
						<span
							class="spinner size-8 border-3 border-[#ddd] border-t-[#4f6ef7] rounded-full"
						></span>
						<p class="text-sm text-surface-500">Loading PDF…</p>
					</div>
				{:else if phase === "error"}
					<div
						class="p-4 rounded-lg bg-error-50 border border-error-300 space-y-3"
						role="alert"
					>
						<p class="text-sm text-error-700">{errorMessage}</p>
						<div class="flex justify-end">
							<button
								class="btn btn-sm preset-filled-primary-500"
								onclick={pickAnotherFile}
								>Pick another file</button
							>
						</div>
					</div>
				{:else if phase === "select"}
					<div class="space-y-4">
						<p class="text-sm text-surface-500">
							Click pages to select. {selectedPageIndices.size} of
							{sourcePageCount} selected.
						</p>
						<div
							class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 max-h-[55vh] overflow-y-auto p-1"
						>
							{#each Array.from({ length: sourcePageCount }, (_, i) => i) as i (i)}
								{@const selected = selectedPageIndices.has(i)}
								<button
									type="button"
									class="relative flex flex-col items-center gap-1 rounded-lg p-2 hover:bg-surface-100-900 transition-colors {selected
										? 'ring-2 ring-primary-500 ring-offset-2 bg-primary-50-950'
										: ''}"
									onclick={() => togglePage(i)}
									aria-pressed={selected}
									aria-label={selected
										? `Deselect page ${i + 1}`
										: `Select page ${i + 1}`}
								>
									<canvas
										use:renderThumb={i}
										class="w-full aspect-[3/4] bg-surface-100-900 rounded object-contain"
									></canvas>
									<span class="text-xs text-surface-500"
										>{i + 1}</span
									>
								</button>
							{/each}
						</div>
						<div class="flex justify-end gap-2">
							<button
								class="btn btn-sm preset-tonal-surface"
								onclick={handleCancelBtn}>Cancel</button
							>
							<button
								class="btn btn-sm preset-filled-primary-500"
								onclick={handleConfirm}
								disabled={selectedPageIndices.size === 0}
								>Confirm</button
							>
						</div>
					</div>
				{/if}
			</Dialog.Content>
		</Dialog.Positioner>
	</Portal>
</Dialog>

<style>
	/* @keyframes — not expressible as a Tailwind utility */

	.spinner {
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
