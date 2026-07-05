<script lang="ts">
	import { resolve } from "$app/paths";
	import PdfCover from "$lib/components/PdfCover.svelte";
	import { currentPdfStore } from "$lib/stores/currentPdf.svelte.js";

	let current = $derived(currentPdfStore.value);
</script>

{#if current}
	<a
		href={resolve("/")}
		class="mx-3 mt-3 block rounded-xl border border-surface-200 bg-white p-[9px] no-underline shadow-sm transition-colors hover:bg-surface-50"
	>
		<div
			class="mb-2 flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-surface-400"
		>
			<span
				class="h-1.5 w-1.5 rounded-full bg-primary-500"
				style="box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-primary-500) 18%, transparent)"
			></span>
			Now viewing
		</div>
		<div class="flex items-center gap-2.5">
			<div
				data-now-viewing-cover
				class="h-[57px] w-11 flex-shrink-0 overflow-hidden rounded shadow-[0_1px_4px_rgba(0,0,0,0.18)]"
			>
				{#if current.id}
					<PdfCover
						id={current.id}
						filename={current.filename}
						class="h-full w-full"
					/>
				{:else}
					<div class="h-full w-full bg-surface-200"></div>
				{/if}
			</div>
			<div class="min-w-0">
				<div
					class="truncate text-[12px] font-semibold text-surface-900"
				>
					{current.filename}
				</div>
				{#if current.subtitle}
					<div class="mt-0.5 font-mono text-[10px] text-surface-400">
						{current.subtitle}
					</div>
				{/if}
			</div>
		</div>
	</a>
{/if}
