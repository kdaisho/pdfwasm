<script lang="ts">
	import { resolve } from "$app/paths";
	import {
		ZOOM_BASE_WIDTH,
		ZOOM_MAX_WIDTH,
		ZOOM_MIN_WIDTH,
		ZOOM_STEP,
	} from "$lib/constants/zoom";
	import { getAuth } from "$lib/stores/auth.svelte.js";

	interface Props {
		onFileChange: (e: Event) => void;
		splitMode: boolean;
		onToggleSplit: () => void;
		showSplit: boolean;
		uploadStatus: "idle" | "uploading" | "saved" | "error";
		uploadError: string | null;
		docLoading: boolean;
		docError: Error | null;
		onDismissError: () => void;
		thumbnailWidth: number;
		onThumbnailWidthChange: (value: number) => void;
		showZoom: boolean;
		hasDocument: boolean;
	}

	let {
		onFileChange,
		splitMode,
		onToggleSplit,
		showSplit,
		uploadStatus,
		uploadError,
		docLoading,
		docError,
		onDismissError,
		thumbnailWidth,
		onThumbnailWidthChange,
		showZoom,
		hasDocument,
	}: Props = $props();

	const auth = getAuth();
</script>

<div class="flex flex-col gap-2 p-[10px]">
	<!--
		Open PDF is the primary CTA only when no document is open; once a PDF is
		loaded (View or Edit mode) it demotes to a secondary/ghost button so the
		primary action reflects context.
	-->
	<label
		class="flex items-center gap-2 w-full px-[10px] py-2 rounded-lg cursor-pointer text-[13px] font-medium transition-colors {hasDocument
			? 'bg-transparent text-surface-500 hover:bg-surface-100'
			: 'bg-primary-500 text-primary-contrast-500 hover:bg-primary-600'}"
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
				class="flex items-center gap-2 w-full px-[10px] py-2 rounded-lg border-none bg-error-50 text-error-500 text-[13px] font-medium hover:bg-error-100 transition-colors cursor-pointer"
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
				class="flex items-center gap-2 w-full px-[10px] py-2 rounded-lg border-none bg-transparent text-surface-500 text-[13px] font-medium hover:bg-surface-100 transition-colors cursor-pointer"
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
		<a
			href={resolve("/library")}
			class="flex items-center gap-2 w-full px-[10px] py-2 rounded-lg bg-transparent text-surface-500 text-[13px] font-medium hover:bg-surface-100 transition-colors no-underline"
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
		</a>
	{/if}
</div>

{#if showZoom}
	<div class="mx-4 mt-3 pt-4 border-t border-surface-200">
		<div class="flex justify-between items-center mb-2">
			<span
				class="text-[11px] text-surface-400 font-semibold uppercase tracking-[0.07em]"
				>Zoom</span
			>
			<span class="text-[12px] text-surface-500 font-mono"
				>{Math.round((thumbnailWidth / ZOOM_BASE_WIDTH) * 100)}%</span
			>
		</div>
		<input
			type="range"
			min={ZOOM_MIN_WIDTH}
			max={ZOOM_MAX_WIDTH}
			step={ZOOM_STEP}
			value={thumbnailWidth}
			oninput={(e) =>
				onThumbnailWidthChange(+(e.target as HTMLInputElement).value)}
			class="w-full cursor-pointer accent-primary-500"
		/>
	</div>
{/if}

<div class="px-4 mt-2 flex flex-col gap-1">
	{#if uploadStatus === "uploading"}
		<span class="text-[11px] text-surface-400 font-mono">saving…</span>
	{:else if uploadStatus === "error"}
		<span class="text-[11px] text-error-500"
			>Save failed{uploadError ? `: ${uploadError}` : ""}</span
		>
	{/if}

	{#if docLoading}
		<span class="text-[11px] text-surface-400">Rendering pages…</span>
	{/if}

	{#if docError}
		<span class="text-[11px] text-error-500">Error: {docError.message}</span
		>
		<button
			class="px-[10px] py-1 rounded-lg bg-error-50 text-error-500 text-[11px] font-medium border-none cursor-pointer hover:bg-error-100 transition-colors"
			onclick={onDismissError}
		>
			Dismiss
		</button>
	{/if}
</div>
