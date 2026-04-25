<script lang="ts">
	import { untrack } from "svelte";
	import type { PDFiumDocument } from "@hyzyla/pdfium";
	import type { PageData, SearchMatch } from "$lib/types";
	import { findMatches } from "$lib/services/search";
	import { RENDER_SCALE } from "$lib/services/charBoxes";
	import { getPdfiumLibrary } from "$lib/services/pdfium";
	import {
		splitPdf,
		downloadSplitPdfs,
		computeSegmentPositions,
		type SequenceEntry,
	} from "$lib/services/splitPdf";
	import { getAuth } from "$lib/stores/auth.svelte.js";
	import PdfPage from "./PdfPage.svelte";
	import SearchBar from "./SearchBar.svelte";
	import AuthModal from "./AuthModal.svelte";
	import InsertPagesModal, {
		type ConfirmPayload,
	} from "./InsertPagesModal.svelte";
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
	let deletedPages: Set<number> = $state(new Set());
	let exporting = $state(false);
	let thumbnailWidth = $state(250);

	interface SourcePdf {
		id: string;
		name: string;
		bytes: Uint8Array;
		doc: PDFiumDocument;
		pageCount: number;
		pages: PageData[];
	}
	interface InsertedPage {
		sourceId: string;
		sourcePageIndex: number;
		insertionAnchor: number;
	}
	type PageRef =
		| { kind: "original"; index: number }
		| { kind: "inserted"; sourceId: string; sourcePageIndex: number };

	let sources: SourcePdf[] = $state([]);
	let insertedPages: InsertedPage[] = $state([]);
	let insertModalOpen = $state(false);
	let pendingInsert: (ConfirmPayload & { sourceId: string }) | null =
		$state(null);

	function buildSequence(
		originalPages: PageData[],
		inserts: InsertedPage[],
	): PageRef[] {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local throwaway map, not reactive state
		const byAnchor = new Map<number, InsertedPage[]>();
		for (const ins of inserts) {
			const list = byAnchor.get(ins.insertionAnchor);
			if (list) list.push(ins);
			else byAnchor.set(ins.insertionAnchor, [ins]);
		}
		const out: PageRef[] = [];
		for (let i = 0; i <= originalPages.length; i++) {
			for (const ins of byAnchor.get(i) ?? []) {
				out.push({
					kind: "inserted",
					sourceId: ins.sourceId,
					sourcePageIndex: ins.sourcePageIndex,
				});
			}
			if (i < originalPages.length)
				out.push({ kind: "original", index: i });
		}
		return out;
	}

	function resolvePageData(ref: PageRef): PageData {
		if (ref.kind === "original") return pages[ref.index];
		const source = sourceById.get(ref.sourceId);
		if (!source) {
			throw new Error(`Source not found: ${ref.sourceId}`);
		}
		return source.pages[ref.sourcePageIndex];
	}

	function resolveDoc(ref: PageRef): PDFiumDocument {
		if (ref.kind === "original") return doc;
		const source = sourceById.get(ref.sourceId);
		if (!source) {
			throw new Error(`Source not found: ${ref.sourceId}`);
		}
		return source.doc;
	}

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

	let combinedSequence: PageRef[] = $derived(
		buildSequence(pages, insertedPages),
	);

	let sourceById = $derived(new SvelteMap(sources.map((s) => [s.id, s])));

	let awaitingAnchor = $derived(pendingInsert !== null);

	/** Map each sequence position → its group number (0-based) */
	let pageGroupMap = $derived(
		(() => {
			const map = new SvelteMap<number, number>();
			let groupIdx = 0;
			for (
				let position = 0;
				position < combinedSequence.length;
				position++
			) {
				map.set(position, groupIdx);
				if (splitPoints.has(position)) groupIdx++;
			}
			return map;
		})(),
	);

	let groupCount = $derived(splitPoints.size > 0 ? splitPoints.size + 1 : 1);

	let effectivePageCount = $derived(
		combinedSequence.length - deletedPages.size,
	);

	let fileCount = $derived(
		computeSegmentPositions(
			combinedSequence.length,
			[...splitPoints],
			[...deletedPages],
		).length,
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

	// Clear split points, exclusions, and inserted-source state when exiting split mode.
	// Order: destroy PDFium handles first (need refs in `sources`), then clear state.
	// `pendingInsert.sourceId` is always present in `sources` (handleInsertConfirm pushes
	// before stashing pendingInsert), so the loop covers it.
	$effect(() => {
		if (splitMode) return;
		untrack(() => {
			for (const s of sources) {
				try {
					s.doc.destroy();
				} catch {
					/* noop */
				}
			}
			splitPoints = new Set();
			deletedPages = new Set();
			sources = [];
			insertedPages = [];
			pendingInsert = null;
		});
	});

	async function handleInsertConfirm(payload: ConfirmPayload) {
		const library = await getPdfiumLibrary();
		const newDoc = await library.loadDocument(payload.sourceBytes);
		const sourceId = crypto.randomUUID();
		const pagesData: PageData[] = [];
		for (let i = 0; i < payload.sourcePageCount; i++) {
			const page = newDoc.getPage(i);
			const { originalWidth, originalHeight } = page.getOriginalSize();
			pagesData.push({
				index: i,
				originalWidth,
				originalHeight,
				width: Math.round(originalWidth * RENDER_SCALE),
				height: Math.round(originalHeight * RENDER_SCALE),
				chars: [],
				scale: RENDER_SCALE,
			});
		}
		sources = [
			...sources,
			{
				id: sourceId,
				name: payload.sourceName,
				bytes: payload.sourceBytes,
				doc: newDoc,
				pageCount: payload.sourcePageCount,
				pages: pagesData,
			},
		];
		pendingInsert = { ...payload, sourceId };
		insertModalOpen = false;
	}

	function handleInsertCancel() {
		insertModalOpen = false;
	}

	function cancelPendingInsert() {
		if (!pendingInsert) return;
		const sourceId = pendingInsert.sourceId;
		const source = sources.find((s) => s.id === sourceId);
		if (source) {
			try {
				source.doc.destroy();
			} catch {
				/* noop */
			}
		}
		sources = sources.filter((s) => s.id !== sourceId);
		pendingInsert = null;
	}

	function commitInsertAt(position: number) {
		if (!pendingInsert) return;
		const n = pendingInsert.selectedPageIndices.length;
		const batch: InsertedPage[] = pendingInsert.selectedPageIndices.map(
			(sourcePageIndex) => ({
				sourceId: pendingInsert!.sourceId,
				sourcePageIndex,
				insertionAnchor: position,
			}),
		);

		// Rebase existing splitPoints / deletedPages: any k >= position shifts by +n.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local throwaway, reassigned below
		const nextSplits = new Set<number>();
		for (const k of splitPoints) nextSplits.add(k >= position ? k + n : k);
		splitPoints = nextSplits;

		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local throwaway, reassigned below
		const nextDeleted = new Set<number>();
		for (const k of deletedPages)
			nextDeleted.add(k >= position ? k + n : k);
		deletedPages = nextDeleted;

		insertedPages = [...insertedPages, ...batch];
		pendingInsert = null;
	}

	function toggleSplitPoint(position: number) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local throwaway copy, not reactive state
		const next = new Set(splitPoints);
		if (next.has(position)) {
			next.delete(position);
		} else {
			next.add(position);
		}
		splitPoints = next;
	}

	function toggleDeletedPage(position: number) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local throwaway copy, not reactive state
		const next = new Set(deletedPages);
		if (next.has(position)) {
			next.delete(position);
		} else {
			next.add(position);
		}
		deletedPages = next;
	}

	async function doExport() {
		if (splitPoints.size === 0 || exporting || effectivePageCount === 0)
			return;
		exporting = true;
		try {
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local builder, not reactive state
			const sourcesMap = new Map<string, Uint8Array>();
			sourcesMap.set("primary", pdfBytes);
			for (const s of sources) sourcesMap.set(s.id, s.bytes);

			const sequence: SequenceEntry[] = combinedSequence.map((ref) =>
				ref.kind === "original"
					? { sourceId: "primary", pageIndex: ref.index }
					: {
							sourceId: ref.sourceId,
							pageIndex: ref.sourcePageIndex,
						},
			);

			const segments = await splitPdf({
				sources: sourcesMap,
				sequence,
				splitPoints: [...splitPoints],
				excludedPositions: [...deletedPages],
			});
			downloadSplitPdfs(segments);
		} finally {
			exporting = false;
		}
	}

	function handleExport() {
		if (splitPoints.size === 0 || exporting || effectivePageCount === 0)
			return;
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
		if (e.code === "Escape" && awaitingAnchor) {
			e.preventDefault();
			cancelPendingInsert();
			return;
		}

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
			<button
				class="btn btn-sm preset-tonal-primary"
				onclick={() => (insertModalOpen = true)}
				disabled={awaitingAnchor}
			>
				Insert pages
			</button>
			{#if awaitingAnchor && pendingInsert}
				<span class="text-sm text-warning-900-100" role="status">
					Click a gutter to insert {pendingInsert.selectedPageIndices
						.length} page{pendingInsert.selectedPageIndices
						.length === 1
						? ""
						: "s"}. (Esc to cancel.)
				</span>
			{/if}
			{#if splitPoints.size > 0}
				<span class="text-sm text-warning-800-200">
					{splitPoints.size} split point{splitPoints.size > 1
						? "s"
						: ""} &rarr; {fileCount} file{fileCount === 1
						? ""
						: "s"}{#if deletedPages.size > 0}
						&middot; {deletedPages.size} excluded{/if}
				</span>
				{#if effectivePageCount === 0}
					<span
						class="text-sm font-medium text-warning-900-100"
						role="alert"
					>
						All pages excluded — unmark a page to export.
					</span>
				{/if}
				<button
					class="btn btn-sm preset-filled-success-500"
					onclick={handleExport}
					disabled={exporting || effectivePageCount === 0}
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
		{#if splitMode && awaitingAnchor}
			<button
				class="flex flex-col items-center justify-center w-9 border-none bg-transparent cursor-pointer px-4 mx-4 relative"
				onclick={() => commitInsertAt(0)}
				title="Insert here (before page 1)"
				aria-label="Insert pages before page 1"
			>
				<span
					class="w-0 h-full min-h-[40px] border-l-2 border-dashed border-primary-500 opacity-80"
				></span>
				<span
					class="absolute text-base rounded-full w-[26px] h-[26px] flex items-center justify-center shadow bg-primary-500 text-white"
					>+</span
				>
			</button>
		{/if}
		{#each combinedSequence as ref, position (position)}
			{@const page = resolvePageData(ref)}
			{@const pageMatches =
				ref.kind === "original"
					? matches.filter((m) => m.pageIndex === ref.index)
					: []}
			{@const activeCharIndex =
				ref.kind === "original" &&
				currentMatchIndex >= 0 &&
				matches[currentMatchIndex]?.pageIndex === ref.index
					? matches[currentMatchIndex].charIndex
					: -1}
			{@const gIdx = pageGroupMap.get(position) ?? 0}
			<div
				class="group relative flex flex-col items-center rounded-lg p-2 -m-1 transition-opacity"
				class:opacity-40={splitMode && deletedPages.has(position)}
				style="{splitMode
					? `width: ${thumbnailWidth}px`
					: ''}{splitMode && groupCount > 1
					? `; background: ${groupColors[gIdx % groupColors.length]}15`
					: ''}"
				use:trackPageRef={ref.kind === "original" ? ref.index : -1}
			>
				{#if splitMode}
					<button
						type="button"
						class="absolute top-1 right-1 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-surface-50 text-base leading-none text-surface-700 shadow transition-opacity duration-150 hover:bg-surface-200 {deletedPages.has(
							position,
						)
							? 'opacity-100'
							: 'opacity-0 group-hover:opacity-100'}"
						onclick={() => toggleDeletedPage(position)}
						title={deletedPages.has(position)
							? `Include page ${position + 1}`
							: `Exclude page ${position + 1}`}
						aria-label={deletedPages.has(position)
							? `Include page ${position + 1}`
							: `Exclude page ${position + 1}`}
					>
						&times;
					</button>
				{/if}
				{#if splitMode && ref.kind === "inserted"}
					{@const sourceName =
						sourceById.get(ref.sourceId)?.name ?? ""}
					{@const badgeLabel = sourceName.replace(/\.pdf$/i, "")}
					<span
						class="absolute top-1 left-1 z-10 max-w-[10rem] truncate rounded-full bg-primary-500 px-2 py-0.5 text-xs font-medium text-white shadow"
						title={sourceName}
					>
						{badgeLabel}
					</span>
				{/if}
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
						doc={resolveDoc(ref)}
					/>
				</div>
				{#if splitMode}
					<div
						class="text-xs text-surface-500 mt-3"
						class:line-through={deletedPages.has(position)}
					>
						{position + 1}
					</div>
				{/if}
			</div>
			{#if splitMode && awaitingAnchor}
				<button
					class="group flex flex-col items-center justify-center w-9 border-none bg-transparent cursor-pointer px-4 mx-4 relative"
					onclick={() => commitInsertAt(position + 1)}
					title="Insert here (after page {position + 1})"
					aria-label="Insert pages after page {position + 1}"
				>
					<span
						class="w-0 h-full min-h-[40px] border-l-2 border-dashed border-primary-500 opacity-80"
					></span>
					<span
						class="absolute text-base rounded-full w-[26px] h-[26px] flex items-center justify-center shadow bg-primary-500 text-white"
						>+</span
					>
				</button>
			{:else if splitMode && position < combinedSequence.length - 1}
				<button
					class="group flex flex-col items-center justify-center w-9 border-none bg-transparent cursor-pointer px-4 mx-4 relative"
					class:split-active={splitPoints.has(position)}
					onclick={() => toggleSplitPoint(position)}
					title="Split after page {position + 1}"
				>
					<span
						class="w-0 h-full min-h-[40px] border-l-2 border-dashed opacity-50 transition-opacity duration-150 {splitPoints.has(
							position,
						)
							? 'border-solid! border-primary-600 opacity-100!'
							: 'border-surface-300 group-hover:border-primary-500 group-hover:opacity-100'}"
					></span>
					<span
						class="absolute text-base rounded-full w-[26px] h-[26px] flex items-center justify-center shadow transition-[color,background-color,box-shadow] duration-150 bg-surface-50 {splitPoints.has(
							position,
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

<InsertPagesModal
	bind:open={insertModalOpen}
	onconfirm={handleInsertConfirm}
	oncancel={handleInsertCancel}
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
