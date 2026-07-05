<script lang="ts">
	import { getThumbnailById } from "$lib/services/thumbnails";

	interface Props {
		id: string;
		filename: string;
		/** Sizing / rounding / shadow are owned by the caller (the card / dock). */
		class?: string;
	}

	let { id, filename, class: klass = "" }: Props = $props();

	let src = $state<string | null>(null);
	let failed = $state(false);

	// Render the first page as the cover. Re-runs if the id changes (dock reuse).
	$effect(() => {
		const currentId = id;
		src = null;
		failed = false;
		let cancelled = false;
		getThumbnailById(currentId)
			.then((url) => {
				if (!cancelled) src = url;
			})
			.catch(() => {
				if (!cancelled) failed = true;
			});
		return () => {
			cancelled = true;
		};
	});
</script>

<div class="relative overflow-hidden bg-white {klass}">
	{#if src}
		<img
			{src}
			alt="First page of {filename}"
			class="h-full w-full object-cover object-top"
		/>
	{:else if failed}
		<div
			class="flex h-full w-full flex-col items-center justify-center gap-2 bg-surface-100 p-3 text-surface-400"
		>
			<svg
				width="22"
				height="22"
				viewBox="0 0 14 14"
				fill="none"
				aria-hidden="true"
			>
				<rect
					x="2"
					y="1"
					width="8"
					height="11"
					rx="1.5"
					stroke="currentColor"
					stroke-width="1.3"
				/>
				<path
					d="M5 5h4M5 7.5h3"
					stroke="currentColor"
					stroke-width="1.1"
					stroke-linecap="round"
				/>
			</svg>
			<span class="line-clamp-2 text-center text-[11px] font-medium">
				{filename}
			</span>
		</div>
	{:else}
		<div class="h-full w-full animate-pulse bg-surface-200"></div>
	{/if}
</div>
