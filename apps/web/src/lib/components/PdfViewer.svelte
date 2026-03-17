<script lang="ts">
	import { untrack } from "svelte";
	import type { PDFiumDocument } from "@hyzyla/pdfium";
	import type { PageData, SearchMatch } from "$lib/types";
	import { findMatches } from "$lib/services/search";
	import { splitPdf, downloadSplitPdfs } from "$lib/services/splitPdf";
	import { getAuth } from "$lib/stores/auth.svelte.js";
	import PdfPage from "./PdfPage.svelte";
	import SearchBar from "./SearchBar.svelte";
	import AuthModal from "./AuthModal.svelte";
	import { SvelteMap } from "svelte/reactivity";

	interface Props {
		pages: PageData[];
		doc: PDFiumDocument;
		splitMode: boolean;
		pdfBytes: Uint8Array;
	}

	let { pages, doc, splitMode, pdfBytes }: Props = $props();

	const auth = getAuth();
	let showAuthModal = $state(false);
	let pendingExport = $state(false);

	let searchOpen = $state(false);
	let query = $state("");
	let debouncedQuery = $state("");
	let caseSensitive = $state(false);
	let wholeWord = $state(false);
	let currentMatchIndex = $state(-1);
	let splitPoints: Set<number> = $state(new Set());
	let exporting = $state(false);
	let thumbnailWidth = $state(250);

	const groupColors = [
		"#4f6ef7", // blue
		"#e5484d", // red
		"#30a46c", // green
		"#e38c2d", // amber
		"#8e4ec6", // purple
		"#0ea5e9", // sky
	];

	let searchInput: HTMLInputElement | undefined = $state();
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- not reactive state, tracks DOM refs imperatively via bind:this
	let pageElements = new Map<number, HTMLDivElement>();

	$effect(() => {
		const q = query;
		if (q === "") {
			debouncedQuery = "";
			return;
		}
		const timer = setTimeout(() => {
			debouncedQuery = q;
		}, 250);
		return () => clearTimeout(timer);
	});

	let matches: SearchMatch[] = $derived(
		findMatches(pages, debouncedQuery, { caseSensitive, wholeWord }),
	);

	/** Map each page index → its group number (0-based) */
	let pageGroupMap = $derived(
		(() => {
			const map = new SvelteMap<number, number>();
			let groupIdx = 0;
			for (const page of pages) {
				map.set(page.index, groupIdx);
				if (splitPoints.has(page.index)) groupIdx++;
			}
			return map;
		})(),
	);

	let groupCount = $derived(splitPoints.size > 0 ? splitPoints.size + 1 : 1);

	// Reset to first match only when search parameters change (not when background extraction adds chars)
	$effect(() => {
		debouncedQuery;
		caseSensitive;
		wholeWord;
		currentMatchIndex = untrack(() => matches.length) > 0 ? 0 : -1;
	});

	// Scroll active match into view
	$effect(() => {
		if (currentMatchIndex < 0 || matches.length === 0) return;
		const match = matches[currentMatchIndex];
		const pageEl = pageElements.get(match.pageIndex);
		if (!pageEl) return;

		// In split mode, thumbnails are small — just scroll the page cell into view
		if (splitMode) {
			pageEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
			return;
		}

		const page = pages.find((p) => p.index === match.pageIndex);
		if (!page) return;
		const char = page.chars[match.charIndex];
		if (!char) {
			pageEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
			return;
		}
		const charYInPage = (page.originalHeight - char.top) * page.scale;
		const pageRect = pageEl.getBoundingClientRect();
		const targetY =
			window.scrollY +
			pageRect.top +
			charYInPage -
			window.innerHeight / 2;
		window.scrollTo({ top: targetY, behavior: "smooth" });
	});

	// Clear split points when exiting split mode
	$effect(() => {
		if (!splitMode) {
			splitPoints = new Set();
		}
	});

	function toggleSplitPoint(pageIndex: number) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local throwaway copy, not reactive state
		const next = new Set(splitPoints);
		if (next.has(pageIndex)) {
			next.delete(pageIndex);
		} else {
			next.add(pageIndex);
		}
		splitPoints = next;
	}

	async function doExport() {
		if (splitPoints.size === 0 || exporting) return;
		exporting = true;
		try {
			const segments = await splitPdf(pdfBytes, [...splitPoints]);
			downloadSplitPdfs(segments);
		} finally {
			exporting = false;
		}
	}

	function handleExport() {
		if (splitPoints.size === 0 || exporting) return;
		if (auth.isAuthenticated) {
			doExport();
		} else {
			pendingExport = true;
			showAuthModal = true;
		}
	}

	function handleAuthSuccess() {
		showAuthModal = false;
		if (pendingExport) {
			pendingExport = false;
			doExport();
		}
	}

	function goToNext() {
		const n = matches.length;
		if (n === 0) return;
		currentMatchIndex = (currentMatchIndex + 1) % n;
	}

	function goToPrev() {
		const n = matches.length;
		if (n === 0) return;
		currentMatchIndex = (currentMatchIndex - 1 + n) % n;
	}

	function closeSearch() {
		searchOpen = false;
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.metaKey && !e.altKey && !e.shiftKey && e.code === "KeyF") {
			e.preventDefault();
			searchOpen = true;
			// Focus after the bar renders
			requestAnimationFrame(() => {
				searchInput?.focus();
				searchInput?.select();
			});
			return;
		}

		if (e.metaKey && !e.altKey && e.code === "KeyG") {
			e.preventDefault();
			const n = matches.length;
			if (n === 0) return;
			if (e.shiftKey) {
				currentMatchIndex = (currentMatchIndex - 1 + n) % n;
			} else {
				currentMatchIndex = (currentMatchIndex + 1) % n;
			}
			return;
		}

		if (!e.metaKey || !e.altKey) return;
		if (e.code === "KeyW") {
			e.preventDefault();
			wholeWord = !wholeWord;
		} else if (e.code === "KeyC") {
			e.preventDefault();
			caseSensitive = !caseSensitive;
		}
	}

	function trackPageRef(node: HTMLDivElement, pageIndex: number) {
		pageElements.set(pageIndex, node);
		return {
			destroy() {
				pageElements.delete(pageIndex);
			},
		};
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<div>
	{#if searchOpen}
		<SearchBar
			bind:inputElement={searchInput}
			{query}
			onchange={(q) => {
				query = q;
			}}
			matchCount={matches.length}
			{currentMatchIndex}
			onnext={goToNext}
			onprev={goToPrev}
			{caseSensitive}
			{wholeWord}
			ontogglecasesensitive={() => {
				caseSensitive = !caseSensitive;
			}}
			ontogglewholeword={() => {
				wholeWord = !wholeWord;
			}}
			onclose={closeSearch}
		/>
	{/if}

	{#if splitMode}
		<div
			class="flex items-center justify-center gap-3 px-4 py-2 bg-warning-100-900 border-b border-warning-400-600"
		>
			<label
				class="flex items-center gap-1.5 text-sm text-warning-800-200"
			>
				Size
				<input
					type="range"
					min="100"
					max="800"
					step="50"
					bind:value={thumbnailWidth}
					class="w-[100px] cursor-pointer"
				/>
			</label>
			{#if splitPoints.size > 0}
				<span class="text-sm text-warning-800-200">
					{splitPoints.size} split point{splitPoints.size > 1
						? "s"
						: ""} selected &rarr; {splitPoints.size + 1} files
				</span>
				<button
					class="btn btn-sm preset-filled-success-500"
					onclick={handleExport}
					disabled={exporting}
				>
					{exporting ? "Exporting…" : "Export Split PDFs"}
				</button>
			{/if}
		</div>
	{/if}

	<div
		class="flex gap-4 p-4 overflow-x-auto {splitMode
			? 'flex-row flex-wrap items-stretch mx-auto gap-y-8 gap-x-0'
			: 'flex-col items-center'}"
	>
		{#each pages as page, i (page.index)}
			{@const pageMatches = matches.filter(
				(m) => m.pageIndex === page.index,
			)}
			{@const activeCharIndex =
				currentMatchIndex >= 0 &&
				matches[currentMatchIndex]?.pageIndex === page.index
					? matches[currentMatchIndex].charIndex
					: -1}
			{@const gIdx = pageGroupMap.get(page.index) ?? 0}
			<div
				class="flex flex-col items-center rounded-lg p-2 -m-1"
				style="{splitMode
					? `width: ${thumbnailWidth}px`
					: ''}{splitMode && groupCount > 1
					? `; background: ${groupColors[gIdx % groupColors.length]}15`
					: ''}"
				use:trackPageRef={page.index}
			>
				{#if splitMode && groupCount > 1}
					<div
						class="text-xs font-medium mb-1 rounded-full px-2 py-0.5"
						style="background: {groupColors[
							gIdx % groupColors.length
						]}20; color: {groupColors[gIdx % groupColors.length]}"
					>
						File {gIdx + 1}
					</div>
				{/if}
				<div
					class="w-full {splitMode ? 'flex justify-center' : ''}"
					class:thumbnail={splitMode}
					style="--page-aspect-padding: {(page.height / page.width) *
						100}%"
				>
					<PdfPage
						{page}
						matches={pageMatches}
						{activeCharIndex}
						{doc}
					/>
				</div>
				{#if splitMode}
					<div class="text-xs text-surface-500 mt-3">
						{page.index + 1}
					</div>
				{/if}
			</div>
			{#if splitMode && i < pages.length - 1}
				<button
					class="group flex flex-col items-center justify-center w-9 border-none bg-transparent cursor-pointer px-4 mx-4 relative"
					class:split-active={splitPoints.has(page.index)}
					onclick={() => toggleSplitPoint(page.index)}
					title="Split after page {page.index + 1}"
				>
					<span
						class="w-0 h-full min-h-[40px] border-l-2 border-dashed opacity-50 transition-opacity duration-150 {splitPoints.has(
							page.index,
						)
							? 'border-solid! border-primary-600 opacity-100!'
							: 'border-surface-300 group-hover:border-primary-500 group-hover:opacity-100'}"
					></span>
					<span
						class="absolute text-base rounded-full w-[26px] h-[26px] flex items-center justify-center shadow transition-[color,background-color,box-shadow] duration-150 bg-surface-50 {splitPoints.has(
							page.index,
						)
							? 'bg-primary-600! text-white shadow-[0_1px_6px_rgba(79,110,247,0.5)]'
							: 'text-surface-400 shadow-[0_1px_4px_rgba(0,0,0,0.15)] group-hover:text-primary-500 group-hover:shadow-[0_1px_4px_rgba(79,110,247,0.3)]'}"
						>&#9986;</span
					>
				</button>
			{/if}
		{/each}
	</div>
</div>

<AuthModal
	open={showAuthModal}
	onOpenChange={(details) => {
		showAuthModal = details.open;
		if (!details.open) pendingExport = false;
	}}
	onAuthSuccess={handleAuthSuccess}
/>

<style>
	/* :global() rules — can't be expressed as Tailwind utilities */

	.thumbnail :global(.page-wrapper) {
		width: 100% !important;
		height: 0 !important;
		padding-bottom: var(--page-aspect-padding);
		overflow: hidden;
	}

	.thumbnail :global(canvas) {
		position: absolute;
		top: 0;
		left: 0;
		width: 100% !important;
		height: 100% !important;
	}
</style>
