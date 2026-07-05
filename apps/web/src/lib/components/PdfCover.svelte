<script lang="ts">
	interface Props {
		filename: string;
		/** Sizing / rounding / shadow are owned by the caller (the card). */
		class?: string;
	}

	let { filename, class: klass = "" }: Props = $props();

	// Generative cover art. This is a fixed *categorical* palette used purely to
	// give each saved document a distinct, recognizable cover — like a book spine
	// or album art — so the library is browsable at a glance. These are decorative
	// document identity, NOT app theme: using theme tokens here would make every
	// cover identical and defeat the point, so raw values are the correct choice.
	const PALETTES: { bg: string; fg: string; accent: string }[] = [
		{ bg: "#1e3a5f", fg: "#dbeafe", accent: "#60a5fa" }, // deep blue
		{ bg: "#2e1065", fg: "#ede9fe", accent: "#a78bfa" }, // violet
		{ bg: "#134e4a", fg: "#ccfbf1", accent: "#5eead4" }, // teal
		{ bg: "#0f172a", fg: "#e2e8f0", accent: "#818cf8" }, // slate
		{ bg: "#3f2d1e", fg: "#fef3c7", accent: "#fbbf24" }, // warm brown
		{ bg: "#4c1d95", fg: "#f5f3ff", accent: "#c4b5fd" }, // purple
		{ bg: "#164e3b", fg: "#d1fae5", accent: "#34d399" }, // green
		{ bg: "#3b0764", fg: "#f3e8ff", accent: "#d8b4fe" }, // grape
	];

	// Stable hash so a given filename always maps to the same cover.
	function hash(str: string): number {
		let h = 0;
		for (let i = 0; i < str.length; i++) {
			h = (h << 5) - h + str.charCodeAt(i);
			h |= 0;
		}
		return Math.abs(h);
	}

	// Drop the extension and turn separators into spaces for a readable cover title.
	function toTitle(name: string): string {
		return (
			name
				.replace(/\.pdf$/i, "")
				.replace(/[-_]+/g, " ")
				.trim() || name
		);
	}

	const palette = $derived(PALETTES[hash(filename) % PALETTES.length]);
	const title = $derived(toTitle(filename));
</script>

<div
	class="relative flex flex-col overflow-hidden {klass}"
	style="background: {palette.bg}; color: {palette.fg}"
>
	<div class="flex flex-1 flex-col justify-center px-[14%] py-[16%]">
		<div
			class="mb-[16%] h-[3px] w-[26%] rounded-full"
			style="background: {palette.accent}"
		></div>
		<div
			class="line-clamp-4 text-[17px] font-bold leading-tight tracking-tight"
		>
			{title}
		</div>
	</div>
	<div class="h-[7%] w-full" style="background: {palette.accent}"></div>
</div>
