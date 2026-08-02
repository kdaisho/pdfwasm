<script lang="ts">
	import PrinterIcon from "./icons/PrinterIcon.svelte";

	interface Props {
		onprint: () => void;
		printing?: boolean;
		disabled?: boolean;
	}

	let { onprint, printing = false, disabled = false }: Props = $props();

	/** How long scrolling must run *without a pause* before the button hides. */
	const HIDE_AFTER_CONTINUOUS_MS = 2000;

	/** How long everything must be still before it slides back in. */
	const SHOW_AFTER_IDLE_MS = 3000;

	/** A pause longer than this ends a burst, so short flicks never hide it. */
	const BURST_GAP_MS = 150;

	let visible = $state(true);
	let focused = $state(false);
	let anchor: HTMLDivElement | undefined = $state();

	// Keyboard users get it back the moment it takes focus, so hiding it never
	// strands a focused control off-screen.
	let shown = $derived(visible || focused);

	// The page list scrolls inside <main> (the whole app is h-screen), so the
	// window never scrolls — listen on the actual scroll container.
	$effect(() => {
		const scroller = anchor?.closest("main");
		if (!scroller) return;

		let hideTimer: ReturnType<typeof setTimeout> | undefined;
		let burstEndTimer: ReturnType<typeof setTimeout> | undefined;
		let idleTimer: ReturnType<typeof setTimeout> | undefined;

		function onScroll() {
			// Armed once per burst and never reset by later events, so it times
			// *continuous* scrolling instead of time since the last event —
			// that's what keeps the animation from firing on scroll start.
			if (hideTimer === undefined) {
				hideTimer = setTimeout(() => {
					hideTimer = undefined;
					visible = false;
				}, HIDE_AFTER_CONTINUOUS_MS);
			}

			// Any pause ends the burst and disarms the pending hide, so a quick
			// flick (< 2s) leaves the button where it was.
			clearTimeout(burstEndTimer);
			burstEndTimer = setTimeout(() => {
				clearTimeout(hideTimer);
				hideTimer = undefined;
			}, BURST_GAP_MS);

			clearTimeout(idleTimer);
			idleTimer = setTimeout(() => {
				visible = true;
			}, SHOW_AFTER_IDLE_MS);
		}

		scroller.addEventListener("scroll", onScroll, { passive: true });
		return () => {
			scroller.removeEventListener("scroll", onScroll);
			clearTimeout(hideTimer);
			clearTimeout(burstEndTimer);
			clearTimeout(idleTimer);
		};
	});
</script>

<!-- h-0 so the floating button never takes layout space: it overlays the
     top-right of the viewer and shares the sticky row with the Edit Mode pill
     instead of pushing the pages down. -->
<div
	bind:this={anchor}
	class="pointer-events-none sticky top-4 z-30 flex h-0 justify-end pr-7"
	onfocusin={() => (focused = true)}
	onfocusout={() => (focused = false)}
>
	<button
		type="button"
		class="flex h-9 w-9 items-center justify-center rounded-[14px] bg-white text-surface-600 transition-all duration-300 ease-out hover:text-primary-500 disabled:cursor-not-allowed disabled:opacity-50 {shown
			? 'pointer-events-auto translate-y-0 opacity-100'
			: '-translate-y-16 opacity-0'}"
		style="box-shadow: 0 2px 16px color-mix(in oklab, var(--color-primary-500) 12%, transparent), 0 0 0 1px color-mix(in oklab, var(--color-primary-500) 10%, transparent)"
		onclick={onprint}
		disabled={disabled || printing}
		title="Print (⌘P)"
		aria-label="Print document"
	>
		<PrinterIcon size={16} />
	</button>
</div>
