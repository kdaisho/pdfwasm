<script lang="ts">
	import { getAuth } from "$lib/stores/auth.svelte.js";
	import SavedPdfsPopover from "./SavedPdfsPopover.svelte";

	interface Props {
		onFileChange: (e: Event) => void;
		splitMode: boolean;
		onToggleSplit: () => void;
		showSplit: boolean;
		onSelectPdf: (id: string, filename: string) => void;
		uploadStatus: "idle" | "uploading" | "saved" | "error";
		uploadError: string | null;
		docLoading: boolean;
		docError: Error | null;
		onDismissError: () => void;
	}

	let {
		onFileChange,
		splitMode,
		onToggleSplit,
		showSplit,
		onSelectPdf,
		uploadStatus,
		uploadError,
		docLoading,
		docError,
		onDismissError,
	}: Props = $props();

	const auth = getAuth();
</script>

<div class="flex flex-col gap-2 p-4">
	<label class="btn preset-filled cursor-pointer text-sm">
		Open PDF
		<input
			type="file"
			accept=".pdf"
			onchange={onFileChange}
			class="hidden"
		/>
	</label>

	{#if showSplit}
		<button
			class="btn text-sm {splitMode
				? 'preset-filled-error-500'
				: 'preset-filled'}"
			onclick={onToggleSplit}
		>
			{splitMode ? "Exit Split Mode" : "Split Mode"}
		</button>
	{/if}

	{#if auth.isAuthenticated}
		<SavedPdfsPopover onSelect={onSelectPdf} />
	{/if}

	{#if uploadStatus === "uploading"}
		<span class="text-xs text-surface-500">Saving…</span>
	{:else if uploadStatus === "saved"}
		<span class="text-xs text-success-500">Saved</span>
	{:else if uploadStatus === "error"}
		<span class="text-xs text-error-500"
			>Save failed{uploadError ? `: ${uploadError}` : ""}</span
		>
	{/if}

	{#if docLoading}
		<span class="text-xs text-surface-500">Rendering pages…</span>
	{/if}

	{#if docError}
		<span class="text-xs text-error-500">Error: {docError.message}</span>
		<button
			class="btn btn-sm preset-filled-error-500 text-xs"
			onclick={onDismissError}
		>
			Dismiss
		</button>
	{/if}
</div>
