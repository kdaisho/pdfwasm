<script lang="ts">
	interface Props {
		inputElement?: HTMLInputElement;
		query: string;
		onchange: (q: string) => void;
		matchCount: number;
		currentMatchIndex: number;
		onnext: () => void;
		onprev: () => void;
		caseSensitive: boolean;
		wholeWord: boolean;
		ontogglecasesensitive: () => void;
		ontogglewholeword: () => void;
	}

	let {
		inputElement = $bindable(),
		query,
		onchange,
		matchCount,
		currentMatchIndex,
		onnext,
		onprev,
		caseSensitive,
		wholeWord,
		ontogglecasesensitive,
		ontogglewholeword,
	}: Props = $props();

	let hasMatches = $derived(matchCount > 0);
</script>

<div class="sticky top-0 z-[100] flex items-center gap-1 px-4 py-2.5 bg-surface-50-950 border-b border-surface-300-700 shadow-sm">
	<input
		bind:this={inputElement}
		type="text"
		value={query}
		oninput={(e) => onchange((e.target as HTMLInputElement).value)}
		placeholder="Search in document…"
		class="input max-w-[400px] mr-1"
	/>
	<button
		onclick={ontogglecasesensitive}
		title="Case sensitive (⌘⌥C)"
		class="btn-icon btn-icon-sm {caseSensitive ? 'preset-filled' : 'preset-tonal-surface'}"
	>
		Aa
	</button>
	<button
		onclick={ontogglewholeword}
		title="Whole word (⌘⌥W)"
		class="btn-icon btn-icon-sm {wholeWord ? 'preset-filled' : 'preset-tonal-surface'}"
	>
		W
	</button>
	{#if query}
		<span class="text-sm text-surface-500 whitespace-nowrap ml-1 min-w-[80px]">
			{matchCount === 0
				? "No matches"
				: `${currentMatchIndex + 1} of ${matchCount}`}
		</span>
		<div class="flex gap-0.5">
			<button
				onclick={onprev}
				disabled={!hasMatches}
				title="Previous match (⌘⇧G)"
				class="btn-icon btn-icon-sm preset-tonal-surface"
				class:opacity-40={!hasMatches}
			>
				↑
			</button>
			<button
				onclick={onnext}
				disabled={!hasMatches}
				title="Next match (⌘G)"
				class="btn-icon btn-icon-sm preset-tonal-surface"
				class:opacity-40={!hasMatches}
			>
				↓
			</button>
		</div>
	{/if}
</div>
