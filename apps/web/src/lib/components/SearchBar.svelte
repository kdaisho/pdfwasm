<script lang="ts">
	import { fly } from "svelte/transition";

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
		onclose: () => void;
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
		onclose,
	}: Props = $props();

	let hasMatches = $derived(matchCount > 0);

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === "Escape") {
			onclose();
		} else if (e.key === "Enter") {
			e.preventDefault();
			if (e.shiftKey) onprev();
			else onnext();
		}
	}
</script>

<div
	class="fixed top-3 right-4 z-50 flex items-center gap-1.5 rounded-lg bg-surface-50-950 border border-surface-300-700 shadow-lg px-3 py-2"
	transition:fly={{ y: -40, duration: 150 }}
>
	<input
		bind:this={inputElement}
		type="text"
		value={query}
		oninput={(e) => onchange((e.target as HTMLInputElement).value)}
		onkeydown={handleKeyDown}
		placeholder="Find in document…"
		class="input w-[200px] text-sm"
	/>
	<button
		onclick={ontogglecasesensitive}
		title="Case sensitive (⌘⌥C)"
		class="btn-icon btn-icon-sm {caseSensitive
			? 'preset-filled'
			: 'preset-tonal-surface'}"
	>
		Aa
	</button>
	<button
		onclick={ontogglewholeword}
		title="Whole word (⌘⌥W)"
		class="btn-icon btn-icon-sm {wholeWord
			? 'preset-filled'
			: 'preset-tonal-surface'}"
	>
		W
	</button>
	{#if query}
		<span
			class="text-xs text-surface-500 whitespace-nowrap min-w-[60px] text-center"
		>
			{matchCount === 0
				? "No matches"
				: `${currentMatchIndex + 1} of ${matchCount}`}
		</span>
	{/if}
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
	<button
		onclick={onclose}
		title="Close (Esc)"
		class="btn-icon btn-icon-sm preset-tonal-surface"
	>
		✕
	</button>
</div>
