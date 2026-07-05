<script lang="ts">
	import CheckIcon from "./icons/CheckIcon.svelte";
	import XIcon from "./icons/XIcon.svelte";

	interface Props {
		/** Called only on the second click (the confirming check). */
		onConfirm: () => void;
		/** Subject name for tooltips / labels, e.g. a filename. */
		label?: string;
		/** Positioning / sizing classes from the caller. */
		class?: string;
	}

	let { onConfirm, label = "", class: klass = "" }: Props = $props();

	// Inline confirmation instead of a modal: the first click arms the button
	// (X → check, "Are you sure?"); the second click commits the delete. Leaving
	// the button or losing focus disarms it, so an accidental delete needs a
	// deliberate second click on the check.
	let confirming = $state(false);

	function handleClick(e: MouseEvent) {
		e.stopPropagation();
		if (confirming) {
			confirming = false;
			onConfirm();
		} else {
			confirming = true;
		}
	}
</script>

<button
	type="button"
	class="flex cursor-pointer items-center justify-center rounded-full border-none text-white shadow-md transition duration-150 {confirming
		? 'bg-success-500 hover:bg-success-600'
		: 'bg-error-500 hover:bg-error-600'} {klass}"
	title={confirming ? "Are you sure?" : label ? `Delete ${label}` : "Delete"}
	aria-label={confirming
		? `Confirm delete ${label}`.trim()
		: `Delete ${label}`.trim()}
	onclick={handleClick}
	onpointerleave={() => (confirming = false)}
	onblur={() => (confirming = false)}
>
	{#if confirming}
		<CheckIcon size={12} />
	{:else}
		<XIcon size={11} />
	{/if}
</button>
