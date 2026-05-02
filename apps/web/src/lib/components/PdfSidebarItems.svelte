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
		thumbnailWidth: number;
		onThumbnailWidthChange: (value: number) => void;
		showZoom: boolean;
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
		thumbnailWidth,
		onThumbnailWidthChange,
		showZoom,
	}: Props = $props();

	const auth = getAuth();
</script>

<div class="flex flex-col gap-[2px] p-[10px]">
	<label
		class="flex items-center gap-2 w-full px-[10px] py-2 rounded-lg cursor-pointer bg-[#6366f1] text-white text-[13px] font-medium hover:bg-[#5457e5] transition-colors"
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
			onchange={onFileChange}
			class="hidden"
		/>
	</label>

	{#if showSplit}
		{#if splitMode}
			<button
				class="flex items-center gap-2 w-full px-[10px] py-2 rounded-lg border-none bg-[#fef2f2] text-[#ef4444] text-[13px] font-medium hover:bg-[#fee2e2] transition-colors cursor-pointer"
				onclick={onToggleSplit}
			>
				<svg
					width="14"
					height="14"
					viewBox="0 0 14 14"
					fill="none"
					aria-hidden="true"
				>
					<path
						d="M2 2l10 10M12 2L2 12"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
					/>
				</svg>
				Exit Edit Mode
			</button>
		{:else}
			<button
				class="flex items-center gap-2 w-full px-[10px] py-2 rounded-lg border-none bg-transparent text-[#78716c] text-[13px] font-medium hover:bg-[#f0eeec] transition-colors cursor-pointer"
				onclick={onToggleSplit}
			>
				<svg
					width="14"
					height="14"
					viewBox="0 0 14 14"
					fill="none"
					aria-hidden="true"
				>
					<path
						d="M9.5 2.5l2 2L5 11H3V9l6.5-6.5z"
						stroke="currentColor"
						stroke-width="1.4"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
				Edit Mode
			</button>
		{/if}
	{/if}

	{#if auth.isAuthenticated}
		<SavedPdfsPopover onSelect={onSelectPdf} />
	{/if}
</div>

{#if showZoom}
	<div class="mx-4 pt-3 border-t border-[#e7e5e4]">
		<div class="flex justify-between items-center mb-2">
			<span
				class="text-[11px] text-[#a8a29e] font-semibold uppercase tracking-[0.07em]"
				>Zoom</span
			>
			<span class="text-[12px] text-[#78716c] font-mono"
				>{Math.round((thumbnailWidth / 250) * 100)}%</span
			>
		</div>
		<input
			type="range"
			min="100"
			max="800"
			step="50"
			value={thumbnailWidth}
			oninput={(e) =>
				onThumbnailWidthChange(+(e.target as HTMLInputElement).value)}
			class="w-full cursor-pointer accent-[#6366f1]"
		/>
		{#if uploadStatus === "saved"}
			<div class="flex items-center gap-1.5 mt-2">
				<span class="w-1.5 h-1.5 rounded-full bg-[#22c55e]"></span>
				<span class="text-[11px] text-[#a8a29e] font-mono">saved</span>
			</div>
		{/if}
	</div>
{/if}

<div class="px-4 mt-2 flex flex-col gap-1">
	{#if uploadStatus === "uploading"}
		<span class="text-[11px] text-[#a8a29e] font-mono">saving…</span>
	{:else if uploadStatus === "error"}
		<span class="text-[11px] text-[#ef4444]"
			>Save failed{uploadError ? `: ${uploadError}` : ""}</span
		>
	{/if}

	{#if docLoading}
		<span class="text-[11px] text-[#a8a29e]">Rendering pages…</span>
	{/if}

	{#if docError}
		<span class="text-[11px] text-[#ef4444]">Error: {docError.message}</span
		>
		<button
			class="px-[10px] py-1 rounded-lg bg-[#fef2f2] text-[#ef4444] text-[11px] font-medium border-none cursor-pointer hover:bg-[#fee2e2] transition-colors"
			onclick={onDismissError}
		>
			Dismiss
		</button>
	{/if}
</div>
