<script lang="ts">
	import { untrack } from "svelte";
	import type { PDFiumDocument } from "@hyzyla/pdfium";
	import type { PageData, SearchMatch } from "$lib/types";
	import { findMatches } from "$lib/services/search";
	import { splitPdf, downloadSplitPdfs } from "$lib/services/splitPdf";
	import PdfPage from "./PdfPage.svelte";
	import SearchBar from "./SearchBar.svelte";

	interface Props {
		pages: PageData[];
		doc: PDFiumDocument;
		splitMode: boolean;
		pdfBytes: Uint8Array;
	}

	let { pages, doc, splitMode, pdfBytes }: Props = $props();

	let query = $state("");
	let debouncedQuery = $state("");
	let caseSensitive = $state(false);
	let wholeWord = $state(false);
	let currentMatchIndex = $state(-1);
	let splitPoints: Set<number> = $state(new Set());
	let exporting = $state(false);

	let searchInput: HTMLInputElement | undefined = $state();
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
		const next = new Set(splitPoints);
		if (next.has(pageIndex)) {
			next.delete(pageIndex);
		} else {
			next.add(pageIndex);
		}
		splitPoints = next;
	}

	async function handleExport() {
		if (splitPoints.size === 0 || exporting) return;
		exporting = true;
		try {
			const segments = await splitPdf(pdfBytes, [...splitPoints]);
			downloadSplitPdfs(segments);
		} finally {
			exporting = false;
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

	function handleKeyDown(e: KeyboardEvent) {
		if (e.metaKey && !e.altKey && !e.shiftKey && e.code === "KeyF") {
			e.preventDefault();
			searchInput?.focus();
			searchInput?.select();
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
	/>

	{#if splitMode && splitPoints.size > 0}
		<div class="split-toolbar">
			<span class="split-info">
				{splitPoints.size} split point{splitPoints.size > 1 ? "s" : ""} selected
				&rarr; {splitPoints.size + 1} files
			</span>
			<button class="export-button" onclick={handleExport} disabled={exporting}>
				{exporting ? "Exporting…" : "Export Split PDFs"}
			</button>
		</div>
	{/if}

	<div class="pages-container" class:split-grid={splitMode}>
		{#each pages as page, i (page.index)}
			{@const pageMatches = matches.filter(
				(m) => m.pageIndex === page.index,
			)}
			{@const activeCharIndex =
				currentMatchIndex >= 0 &&
				matches[currentMatchIndex]?.pageIndex === page.index
					? matches[currentMatchIndex].charIndex
					: -1}
			<div class="page-cell" use:trackPageRef={page.index}>
				{#if splitMode}
					<div class="page-number">Page {page.index + 1}</div>
				{/if}
				<div
					class="page-scale-wrapper"
					class:thumbnail={splitMode}
					style="--page-aspect-padding: {(page.height / page.width) * 100}%"
				>
					<PdfPage {page} matches={pageMatches} {activeCharIndex} {doc} />
				</div>
				{#if splitMode && i < pages.length - 1}
					<button
						class="split-divider"
						class:split-active={splitPoints.has(page.index)}
						onclick={() => toggleSplitPoint(page.index)}
						title="Split after page {page.index + 1}"
					>
						{#if splitPoints.has(page.index)}
							<span class="split-label">&#9986; Split here</span>
						{:else}
							<span class="split-label-subtle">Click to split</span>
						{/if}
					</button>
				{/if}
			</div>
		{/each}
	</div>
</div>

<style>
	.pages-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		padding: 16px;
		overflow-x: auto;
	}
	.split-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		max-width: 1400px;
		margin: 0 auto;
		gap: 12px;
		align-items: start;
	}
	.page-cell {
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.page-number {
		font-size: 12px;
		color: #666;
		margin-bottom: 4px;
		font-weight: 500;
	}
	.page-scale-wrapper {
		width: 100%;
	}
	.page-scale-wrapper.thumbnail {
		display: flex;
		justify-content: center;
	}
	.page-scale-wrapper.thumbnail :global(.page-wrapper) {
		width: 100% !important;
		height: 0 !important;
		padding-bottom: var(--page-aspect-padding);
		overflow: hidden;
	}
	.page-scale-wrapper.thumbnail :global(canvas) {
		position: absolute;
		top: 0;
		left: 0;
		width: 100% !important;
		height: 100% !important;
	}
	.split-divider {
		width: 100%;
		margin-top: 6px;
		padding: 4px 0;
		border: none;
		border-top: 2px dashed #ccc;
		background: transparent;
		cursor: pointer;
		transition:
			border-color 0.15s,
			background 0.15s;
	}
	.split-divider:hover {
		border-top-color: #4f6ef7;
		background: rgba(79, 110, 247, 0.05);
	}
	.split-divider.split-active {
		border-top: 3px solid #e74c3c;
		background: rgba(231, 76, 60, 0.08);
	}
	.split-label {
		font-size: 11px;
		color: #e74c3c;
		font-weight: 600;
	}
	.split-label-subtle {
		font-size: 11px;
		color: #aaa;
	}
	.split-toolbar {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 8px 16px;
		background: #fff3cd;
		border-bottom: 1px solid #ffc107;
	}
	.split-info {
		font-size: 13px;
		color: #856404;
	}
	.export-button {
		padding: 6px 16px;
		background: #28a745;
		color: #fff;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-size: 13px;
		font-weight: 500;
	}
	.export-button:hover {
		background: #218838;
	}
	.export-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
</style>
