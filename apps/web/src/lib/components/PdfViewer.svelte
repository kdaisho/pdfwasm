<script lang="ts">
	import { untrack } from "svelte";
	import type { PDFiumDocument } from "@hyzyla/pdfium";
	import { ZOOM_BASE_WIDTH, stepZoomWidth } from "$lib/constants/zoom";
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
	import { SvelteMap, SvelteSet } from "svelte/reactivity";

	interface Props {
		pages: PageData[];
		doc: PDFiumDocument;
		splitMode: boolean;
		pdfBytes: Uint8Array;
		sourceFilename: string | null;
		thumbnailWidth: number;
		onThumbnailWidthChange: (value: number) => void;
	}

	let {
		pages,
		doc,
		splitMode,
		pdfBytes,
		sourceFilename,
		thumbnailWidth,
		onThumbnailWidthChange,
	}: Props = $props();

	const auth = getAuth();
	let showAuthModal = $state(false);
	let pendingExport = $state(false);

	let searchOpen = $state(false);
	let query = $state("");
	let debouncedQuery = $state("");
	let caseSensitive = $state(false);
	let wholeWord = $state(false);
	let currentMatchIndex = $state(-1);
	let splitPoints = new SvelteSet<number>();
	let deletedPages = new SvelteSet<number>();
	let exporting = $state(false);
	let exportError: string | null = $state(null);

	// Finder-style multi-select of page positions for bulk exclude.
	let selectedPositions = new SvelteSet<number>();
	let selectionAnchor: number | null = $state(null);

	// Selected pages that aren't already excluded — what "Exclude selected"
	// actually acts on. Derived so the toolbar button tracks marker toggles live.
	let selectedToExclude = $derived(
		[...selectedPositions].filter((p) => !deletedPages.has(p)),
	);

	// In normal (non-edit) mode the zoom slider scales the page relative to its
	// natural render size: ZOOM_BASE_WIDTH → 1×, so 100% is unchanged.
	let zoomScale = $derived(thumbnailWidth / ZOOM_BASE_WIDTH);

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
		const byAnchor = new SvelteMap<number, InsertedPage[]>();
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
	let pageElements = new SvelteMap<number, HTMLDivElement>();

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

	let sourceById = $derived(new Map(sources.map((s) => [s.id, s])));

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

	let hasEdits = $derived(
		splitPoints.size > 0 ||
			deletedPages.size > 0 ||
			insertedPages.length > 0,
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
		const charYInPage =
			(page.originalHeight - char.top) * page.scale * zoomScale;

		// The layout scrolls inside <main> (overflow-y-auto), not the window —
		// the whole app is h-screen, so window.scrollY never moves. Center the
		// match within the actual scroll container.
		const scroller = pageEl.closest("main");
		if (!scroller) {
			pageEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
			return;
		}
		const pageRect = pageEl.getBoundingClientRect();
		const scrollerRect = scroller.getBoundingClientRect();
		const targetY =
			scroller.scrollTop +
			(pageRect.top - scrollerRect.top) +
			charYInPage -
			scroller.clientHeight / 2;
		scroller.scrollTo({ top: targetY, behavior: "smooth" });
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
			splitPoints.clear();
			deletedPages.clear();
			sources = [];
			insertedPages = [];
			pendingInsert = null;
			clearSelection();
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
		const rebasedSplits = [...splitPoints].map((k) =>
			k >= position ? k + n : k,
		);
		splitPoints.clear();
		for (const k of rebasedSplits) splitPoints.add(k);

		const rebasedDeleted = [...deletedPages].map((k) =>
			k >= position ? k + n : k,
		);
		deletedPages.clear();
		for (const k of rebasedDeleted) deletedPages.add(k);

		insertedPages = [...insertedPages, ...batch];
		pendingInsert = null;
		// Positions just shifted — drop the stale selection.
		clearSelection();
	}

	function toggleSplitPoint(position: number) {
		if (splitPoints.has(position)) {
			splitPoints.delete(position);
		} else {
			splitPoints.add(position);
		}
	}

	function toggleDeletedPage(position: number) {
		// If this page is part of a multi-selection, the ✕ toggles the whole
		// selection at once; otherwise just this page (the original behavior).
		const targets =
			selectedPositions.has(position) && selectedPositions.size > 1
				? [...selectedPositions]
				: [position];
		const allExcluded = targets.every((p) => deletedPages.has(p));
		for (const p of targets) {
			if (allExcluded) deletedPages.delete(p);
			else deletedPages.add(p);
		}
	}

	function isEditableTarget(e: Event): boolean {
		const t = e.target as HTMLElement | null;
		if (!t) return false;
		return (
			t.tagName === "INPUT" ||
			t.tagName === "TEXTAREA" ||
			t.isContentEditable
		);
	}

	function clearSelection() {
		selectedPositions.clear();
		selectionAnchor = null;
	}

	function handlePageSelect(position: number, e: MouseEvent | KeyboardEvent) {
		if (e.shiftKey && selectionAnchor !== null) {
			const lo = Math.min(selectionAnchor, position);
			const hi = Math.max(selectionAnchor, position);
			selectedPositions.clear();
			for (let i = lo; i <= hi; i++) selectedPositions.add(i);
		} else if (e.metaKey || e.ctrlKey) {
			if (selectedPositions.has(position))
				selectedPositions.delete(position);
			else selectedPositions.add(position);
			selectionAnchor = position;
		} else {
			selectedPositions.clear();
			selectedPositions.add(position);
			selectionAnchor = position;
		}
	}

	function handlePageKeydown(position: number, e: KeyboardEvent) {
		if (e.code === "Enter" || e.code === "Space") {
			e.preventDefault();
			handlePageSelect(position, e);
		}
	}

	function selectAll() {
		selectedPositions.clear();
		for (let i = 0; i < combinedSequence.length; i++)
			selectedPositions.add(i);
		selectionAnchor = combinedSequence.length - 1;
	}

	function excludeSelected() {
		if (selectedToExclude.length === 0) return;
		for (const p of selectedToExclude) deletedPages.add(p);
		// Keep the selection so undoing a marker re-surfaces the button.
	}

	async function doExport() {
		if (!hasEdits || exporting || effectivePageCount === 0) return;
		exporting = true;
		exportError = null;
		try {
			const sourcesMap = new SvelteMap<string, Uint8Array>();
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
			await downloadSplitPdfs(segments, sourceFilename);
		} catch (err: unknown) {
			exportError = err instanceof Error ? err.message : "Export failed";
		} finally {
			exporting = false;
		}
	}

	function handleExport() {
		if (!hasEdits || exporting || effectivePageCount === 0) return;
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

		// Edit Mode page-selection shortcuts (ignored while typing in a field).
		if (splitMode && !isEditableTarget(e)) {
			if (e.code === "Escape" && selectedPositions.size > 0) {
				e.preventDefault();
				clearSelection();
				return;
			}
			if (
				(e.code === "Backspace" || e.code === "Delete") &&
				selectedToExclude.length > 0
			) {
				e.preventDefault();
				excludeSelected();
				return;
			}
			if ((e.metaKey || e.ctrlKey) && !e.altKey && e.code === "KeyA") {
				e.preventDefault();
				selectAll();
				return;
			}
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

	// Cmd/Ctrl + wheel to zoom. Listen on window rather than a DOM node: the
	// content can be shorter than the scroll viewport, so wheel events over the
	// empty area never bubble to the viewer element. Explicit { passive: false }
	// keeps preventDefault working (root-target wheel listeners are passive by
	// default).
	$effect(() => {
		function onWheel(e: WheelEvent) {
			if (!e.metaKey && !e.ctrlKey) return;
			if (isEditableTarget(e)) return;
			if (e.deltaY === 0) return;

			e.preventDefault();

			const direction = e.deltaY < 0 ? 1 : -1;
			const next = stepZoomWidth(thumbnailWidth, direction);
			if (next !== thumbnailWidth) onThumbnailWidthChange(next);
		}

		window.addEventListener("wheel", onWheel, { passive: false });
		return () => window.removeEventListener("wheel", onWheel);
	});
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
		<div class="sticky top-4 z-10 flex justify-center pointer-events-none">
			<div
				class="flex items-center gap-2.5 bg-white rounded-[14px] px-3.5 py-[7px] pointer-events-auto"
				style="box-shadow: 0 2px 16px rgba(99,102,241,0.12), 0 0 0 1px rgba(99,102,241,0.1)"
			>
				<div class="flex items-center gap-1.5">
					<span
						class="w-[7px] h-[7px] rounded-full bg-[#6366f1]"
						style="box-shadow: 0 0 0 3px rgba(99,102,241,0.2)"
					></span>
					<span class="text-[12px] text-[#6366f1] font-semibold"
						>Edit Mode</span
					>
				</div>

				<div class="w-px h-5 bg-[#f0eeec]"></div>

				<button
					class="px-3 py-[5px] rounded-lg border border-[#e7e5e4] bg-white text-[#44403c] text-[12px] font-medium hover:bg-[#fafaf9] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
					onclick={() => (insertModalOpen = true)}
					disabled={awaitingAnchor}
				>
					+ Insert Pages
				</button>

				{#if selectedToExclude.length > 0}
					<button
						class="px-3 py-[5px] rounded-lg border border-[#fecaca] bg-[#fef2f2] text-[#ef4444] text-[12px] font-medium hover:bg-[#fee2e2] transition-colors cursor-pointer"
						onclick={excludeSelected}
						title="Exclude selected pages (Delete)"
					>
						Exclude {selectedToExclude.length} selected
					</button>
				{/if}

				<button
					class="px-3.5 py-[5px] rounded-lg border-none text-white text-[12px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
					style="background: linear-gradient(135deg, #6366f1, #818cf8)"
					onclick={handleExport}
					disabled={!hasEdits ||
						exporting ||
						effectivePageCount === 0}
				>
					{exporting
						? "Exporting…"
						: fileCount > 1
							? "↓ Export PDFs"
							: "↓ Export PDF"}
				</button>

				{#if awaitingAnchor && pendingInsert}
					<div class="w-px h-5 bg-[#f0eeec]"></div>
					<span class="text-[12px] text-[#78716c]" role="status">
						Click a gutter to insert {pendingInsert
							.selectedPageIndices.length} page{pendingInsert
							.selectedPageIndices.length === 1
							? ""
							: "s"} — Esc to cancel
					</span>
				{/if}

				{#if splitPoints.size > 0 || deletedPages.size > 0}
					<div class="w-px h-5 bg-[#f0eeec]"></div>
					<span class="text-[11px] text-[#a8a29e]">
						{#if splitPoints.size > 0}
							{splitPoints.size} split → {fileCount} file{fileCount ===
							1
								? ""
								: "s"}
						{/if}
						{#if deletedPages.size > 0}
							{splitPoints.size > 0
								? " · "
								: ""}{deletedPages.size}
							excluded
						{/if}
					</span>
				{/if}

				{#if hasEdits && effectivePageCount === 0}
					<div class="w-px h-5 bg-[#f0eeec]"></div>
					<span
						class="text-[12px] text-[#ef4444] font-medium"
						role="alert"
					>
						All pages excluded
					</span>
				{/if}

				{#if exportError}
					<div class="w-px h-5 bg-[#f0eeec]"></div>
					<span
						class="text-[12px] text-[#ef4444] font-medium"
						role="alert"
					>
						Export failed: {exportError}
					</span>
				{/if}
			</div>
		</div>
	{/if}

	<div
		class="flex gap-4 p-7 {splitMode
			? 'flex-row flex-wrap items-start mx-auto gap-y-5 gap-x-0 justify-start'
			: 'flex-col items-center overflow-x-auto'}"
	>
		{#if splitMode && awaitingAnchor}
			<button
				class="flex flex-col items-center justify-center w-9 border-none bg-transparent cursor-pointer px-4 mx-2 relative self-stretch"
				onclick={() => commitInsertAt(0)}
				title="Insert here (before page 1)"
				aria-label="Insert pages before page 1"
			>
				<span
					class="w-0 h-full min-h-[40px] border-l-2 border-dashed border-[#6366f1] opacity-80"
				></span>
				<span
					class="absolute text-base rounded-full w-[26px] h-[26px] flex items-center justify-center shadow-md bg-[#6366f1] text-white"
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
			<!-- Keep each page and its trailing gutter in one flex unit so the
			     cut button wraps together with the page on its left, never alone. -->
			<div class="flex items-start">
				<div
					class="group relative flex flex-col items-center p-2 mx-1 transition-all"
					style="{splitMode
						? `width: ${thumbnailWidth}px`
						: ''}{splitMode && groupCount > 1
						? `; background: ${groupColors[gIdx % groupColors.length]}15; border-radius: 6px`
						: ''}"
					use:trackPageRef={ref.kind === "original" ? ref.index : -1}
				>
					{#if splitMode}
						<button
							type="button"
							class="absolute top-1.5 right-1.5 z-10 w-[28px] h-[28px] rounded-full border-none flex items-center justify-center text-white shadow-md transition-all duration-150 cursor-pointer {deletedPages.has(
								position,
							)
								? 'opacity-100 bg-[#22c55e]'
								: 'opacity-0 group-hover:opacity-100 bg-[#ef4444]'}"
							onclick={() => toggleDeletedPage(position)}
							title={deletedPages.has(position)
								? `Include page ${position + 1}`
								: `Exclude page ${position + 1}`}
							aria-label={deletedPages.has(position)
								? `Include page ${position + 1}`
								: `Exclude page ${position + 1}`}
						>
							{#if deletedPages.has(position)}
								<svg
									width="14"
									height="14"
									viewBox="0 0 14 14"
									fill="none"
									aria-hidden="true"
								>
									<path
										d="M3 5h6a2.5 2.5 0 0 1 0 5H6"
										stroke="currentColor"
										stroke-width="1.6"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
									<path
										d="M5 3 3 5l2 2"
										stroke="currentColor"
										stroke-width="1.6"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
							{:else}
								<svg
									width="12"
									height="12"
									viewBox="0 0 12 12"
									fill="none"
									aria-hidden="true"
								>
									<path
										d="M2.5 2.5 9.5 9.5M9.5 2.5 2.5 9.5"
										stroke="currentColor"
										stroke-width="1.8"
										stroke-linecap="round"
									/>
								</svg>
							{/if}
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
							]}20; color: {groupColors[
								gIdx % groupColors.length
							]}"
						>
							File {gIdx + 1}
						</div>
					{/if}
					<div
						class="thumbnail {splitMode
							? 'w-full flex justify-center page-card cursor-pointer'
							: ''} {splitMode && selectedPositions.has(position)
							? 'outline-2 outline-offset-2 outline-[#6366f1]'
							: ''}"
						class:page-card-deleted={splitMode &&
							deletedPages.has(position)}
						style="--page-aspect-padding: {(page.height /
							page.width) *
							100}%{splitMode
							? ''
							: `; width: ${page.width * zoomScale}px`}"
						role="button"
						tabindex={splitMode ? 0 : -1}
						aria-pressed={splitMode
							? selectedPositions.has(position)
							: undefined}
						aria-label={splitMode
							? `Select page ${position + 1}`
							: undefined}
						onclick={splitMode
							? (e) => handlePageSelect(position, e)
							: undefined}
						onkeydown={splitMode
							? (e) => handlePageKeydown(position, e)
							: undefined}
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
							class="text-[11px] mt-1.5 font-mono {deletedPages.has(
								position,
							)
								? 'line-through text-[#fca5a5]'
								: 'text-[#a8a29e]'}"
						>
							{position + 1}
						</div>
					{/if}
				</div>
				{#if splitMode && awaitingAnchor}
					<button
						class="group flex flex-col items-center justify-center w-9 border-none bg-transparent cursor-pointer px-4 mx-2 relative self-stretch"
						onclick={() => commitInsertAt(position + 1)}
						title="Insert here (after page {position + 1})"
						aria-label="Insert pages after page {position + 1}"
					>
						<span
							class="w-0 h-full min-h-[40px] border-l-2 border-dashed border-[#6366f1] opacity-80"
						></span>
						<span
							class="absolute text-base rounded-full w-[26px] h-[26px] flex items-center justify-center shadow-md bg-[#6366f1] text-white"
							>+</span
						>
					</button>
				{:else if splitMode && position < combinedSequence.length - 1}
					<button
						class="group flex flex-col items-center justify-center w-9 border-none bg-transparent cursor-pointer px-4 mx-2 relative self-stretch"
						onclick={() => toggleSplitPoint(position)}
						title="Split after page {position + 1}"
					>
						<span
							class="w-0 h-full min-h-[40px] border-l-2 transition-all duration-150 {splitPoints.has(
								position,
							)
								? 'border-solid border-[#6366f1] opacity-100'
								: 'border-dashed border-[#ddd6fe] opacity-80 group-hover:border-[#6366f1] group-hover:opacity-100'}"
						></span>
						<span
							class="absolute text-base rounded-full w-[26px] h-[26px] flex items-center justify-center transition-all duration-150 {splitPoints.has(
								position,
							)
								? 'bg-[#6366f1] text-white shadow-[0_1px_6px_rgba(99,102,241,0.5)]'
								: 'bg-white text-[#a8a29e] shadow-[0_1px_4px_rgba(0,0,0,0.1)] group-hover:text-[#6366f1] group-hover:shadow-[0_1px_4px_rgba(99,102,241,0.3)]'}"
							>&#9986;</span
						>
					</button>
				{/if}
			</div>
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

	.page-card {
		background: white;
		border: 1px solid #f0eeec;
		border-radius: 6px;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
		overflow: hidden;
		transition: all 0.15s;
	}

	.group:hover .page-card:not(.page-card-deleted) {
		border-color: #c4b5fd;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
	}

	.page-card-deleted {
		position: relative;
		border-color: #fecaca;
	}

	.page-card-deleted::before {
		content: "";
		position: absolute;
		inset: 0;
		background: rgba(254, 226, 226, 0.55);
		pointer-events: none;
		z-index: 4;
	}

	.page-card-deleted::after {
		content: "";
		position: absolute;
		top: 50%;
		left: 12%;
		width: 76%;
		height: 2px;
		background: #ef4444;
		border-radius: 1px;
		transform: translateY(-50%) rotate(-22deg);
		transform-origin: center;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
		pointer-events: none;
		z-index: 5;
	}
</style>
