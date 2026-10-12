<script lang="ts">
	// Shown in place of the viewer while an EPUB is open, until the EPUB reader
	// (KDA-92) lands. Takes the same inputs the reader will, so swapping it in
	// is a one-line change in routes/+page.svelte.
	import type { ParsedEpub } from "$lib/services/epub";
	import { documentTitle, readEpubCover } from "$lib/services/openDocument";
	import TitleCover from "./TitleCover.svelte";

	interface Props {
		epub: ParsedEpub;
		filename: string;
	}

	let { epub, filename }: Props = $props();

	let title = $derived(documentTitle(epub.book, filename));
	let author = $derived(epub.book.metadata.creators.join(", ") || null);
	let coverUrl = $state<string | null>(null);

	$effect(() => {
		const current = epub;
		let url: string | null = null;
		let cancelled = false;
		coverUrl = null;
		readEpubCover(current)
			.then((image) => {
				if (cancelled || !image) return;
				url = URL.createObjectURL(image);
				coverUrl = url;
			})
			// A cover that can't be read just falls back to the title cover.
			.catch(() => {});
		return () => {
			cancelled = true;
			if (url) URL.revokeObjectURL(url);
		};
	});
</script>

<div class="flex h-full items-center justify-center p-8">
	<div class="flex max-w-sm flex-col items-center text-center">
		<div
			class="aspect-[1/1.45] w-44 overflow-hidden rounded-lg bg-white shadow-xl"
		>
			{#if coverUrl}
				<img
					src={coverUrl}
					alt="Cover of {title}"
					class="h-full w-full object-cover"
				/>
			{:else}
				<TitleCover {title} {author} class="h-full w-full" />
			{/if}
		</div>
		<h1 class="mt-6 text-[19px] font-bold tracking-tight text-surface-900">
			{title}
		</h1>
		{#if author}
			<p class="mt-1 text-[13.5px] text-surface-600">{author}</p>
		{/if}
		<p
			class="mt-5 rounded-lg bg-surface-100 px-4 py-2.5 text-[13px] text-surface-500"
		>
			Reading EPUBs in the app is coming soon.
		</p>
	</div>
</div>
