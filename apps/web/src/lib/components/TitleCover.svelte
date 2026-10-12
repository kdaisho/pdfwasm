<script lang="ts">
	// Stand-in cover for a book without a cover image: its title (and author)
	// on a plain jacket. Text scales with the cover's width (cqw), so the same
	// component reads on a library card and still looks like a book in the dock.
	interface Props {
		title: string;
		author?: string | null;
		/** Sizing / rounding / shadow are owned by the caller. */
		class?: string;
	}

	let { title, author = null, class: klass = "" }: Props = $props();
</script>

<div
	class="@container flex flex-col justify-between overflow-hidden border-l-4 border-primary-500 bg-primary-50 {klass}"
	role="img"
	aria-label="Cover: {title}{author ? ` by ${author}` : ''}"
>
	<div class="p-[9cqw]">
		<p
			class="line-clamp-5 font-serif text-[10cqw] font-semibold leading-tight text-primary-900"
		>
			{title}
		</p>
	</div>
	{#if author}
		<p
			class="line-clamp-2 px-[9cqw] pb-[9cqw] text-[7cqw] leading-snug text-primary-700"
		>
			{author}
		</p>
	{/if}
</div>
