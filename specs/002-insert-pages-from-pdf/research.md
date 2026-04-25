# Phase 0 Research: Insert Pages from Another PDF in Split Mode

**Feature**: `specs/002-insert-pages-from-pdf/spec.md`
**Date**: 2026-04-20

All clarifications from the spec (5 across two sessions) are resolved: multi-select order = source order; each upload = distinct Source PDF; >100 MB triggers a warn-and-proceed; already-loaded sources are not reused via UI; file picker is single-file. This document records the implementation-level decisions that remain, with alternatives considered.

---

## Decision 1: Combined sequence as a tagged-union `PageRef[]`

**Decision**: Represent the merged page sequence as

```ts
type PageRef =
	| { kind: "original"; index: number }
	| { kind: "inserted"; sourceId: string; sourcePageIndex: number };

let combinedSequence: PageRef[] = $derived(buildSequence(pages, insertedPages));
```

`pages` (original) and `insertedPages` (array of `{ sourceId, sourcePageIndex, insertionAnchor }`) are the sources of truth; `combinedSequence` is derived. The `insertionAnchor` of an inserted record is the **sequence position** at which the user chose to insert, recorded at insert time (not re-resolved later).

**Rationale**:

- The Linear issue and spec both describe a derived sequence of tagged entries. A plain tagged union is the simplest type that captures "original vs inserted" without extra indirection.
- Deriving the sequence keeps mutation localized — any insert, delete, or clear just appends/removes in `insertedPages`, and Svelte 5's `$derived` handles the rebuild.
- Sequence position, not stable id, is the natural key because the user does not reorder — the sequence is built once per render pass from a deterministic fold of originals + insertions.

**Alternatives considered**:

- **Flatten originals and inserted pages into a single `PageData[]` with a `sourceId?: string` field**: rejected. It conflates two entities (a rendered primary page with a reference to a secondary page) and forces every downstream read to branch on `sourceId != null`. The tagged union makes the branch explicit and easier to audit.
- **Linked-list or doubly-linked-list of PageRefs**: rejected as over-engineered. There is no incremental insert/remove hotspot that would justify it; the arrays are small (tens to low hundreds).
- **Store inserted pages interleaved inside `pages` directly**: rejected. `pages` is owned by the parent route (`+page.svelte`) and represents the immutable set of primary-document pages; mutating it from the viewer blurs ownership and interferes with search / char-box extraction upstream.

---

## Decision 2: Split-state is keyed by **sequence position**, not page index

**Decision**: `splitPoints: Set<number>` and `deletedPages: Set<number>` store **sequence positions** (0-based indices into `combinedSequence`), not original-page indices. Every caller that previously passed `page.index` now passes `position` (the index at which the ref appears in `combinedSequence`).

**Rationale**:

- This is the refactor called out in the Linear issue. Any other choice (e.g. "split points mean original-page indices, but inserted pages slot in between") produces ambiguous semantics when the user places a split point between two inserted pages or between an original and an inserted page.
- Sequence positions are dense (0..N-1), match the natural render loop (`combinedSequence.forEach((ref, position) => …)`), and make `computeSegmentPageIndices` → `computeSegmentPositions` a straightforward rename.
- Existing KDA-27 code already uses `page.index` as a position-like key (the current primary doc has `page.index === position_in_combinedSequence` trivially when no insertions exist) — so the refactor is "stop coincidentally equating index and position, start naming them correctly".

**Alternatives considered**:

- **Stable `ref.id` per entry**: rejected for this release. It would be nice for a future reorder feature, but adds an id-generation step per build and has no user-visible benefit today.
- **Store `splitPoints` as positions but keep `deletedPages` as page-indices**: rejected — asymmetric and would require a compatibility layer at export time.
- **Recompute by matching `PageRef` structurally on each change**: rejected as fragile and O(N²).

---

## Decision 3: Exporter composes across multiple `PDFDocument`s

**Decision**: `splitPdf` accepts `{ sources: Map<string, Uint8Array>, sequence: SequenceEntry[], splitPoints, excludedPositions }` and loads **each distinct source** exactly once via `PDFDocument.load`, then calls `copyPages(srcDoc, [pageIndexes])` per source per segment and appends the pages to the output `PDFDocument` in sequence order.

```ts
// For each segment's remaining positions:
for (const pos of segmentPositions) {
	const entry = sequence[pos]; // { sourceId, pageIndex }
	const srcDoc = await ensureLoaded(entry.sourceId);
	const [copied] = await out.copyPages(srcDoc, [entry.pageIndex]);
	out.addPage(copied);
}
```

**Rationale**:

- `pdf-lib`'s `copyPages(src, indices)` is the documented API for cross-document page copy. It handles font, image, and content-stream deduplication correctly.
- Loading each source once per export (not once per page) avoids quadratic work when many pages come from the same source.
- Preserving sequence order at segment assembly time is the only correct behavior when originals and inserted pages interleave; per-source batching would scramble order.

**Alternatives considered**:

- **Pre-merge all sources into one temporary `PDFDocument` before splitting**: rejected. It does strictly more work (copies pages twice) and complicates the empty-segment drop rule.
- **Keep `splitPdf`'s current `pdfBytes` parameter and pass a second "inserted bytes" array**: rejected. Any shape that hard-codes "primary vs inserted" in the exporter prevents clean multi-source semantics. The cleanest abstraction is "sources map" + "sequence of references".

---

## Decision 4: `PdfPage.svelte` uses a per-page `doc` override

**Decision**: Add an optional `doc: PDFiumDocument` prop to `PdfPage.svelte` that, when provided, overrides the component's existing `doc` prop. `PdfViewer.svelte` resolves the correct doc per page before passing it in:

```svelte
{#each combinedSequence as ref, position (position)}
    <PdfPage
        page={getPageData(ref)}
        doc={ref.kind === "original" ? doc : sources.get(ref.sourceId)!.doc}
        ...
    />
{/each}
```

`PdfPage` does not learn anything new about insertion; it just renders whichever `PDFiumDocument` it was handed.

**Rationale**:

- Keeps `PdfPage.svelte` agnostic (single responsibility: render a page from a given PDFium doc).
- Avoids an alternative where inserted pages pre-render to `ImageData` and `PdfPage` branches on `page.imageData`. Pre-rendering would duplicate the render pipeline and create a second code path for anti-drift concerns (constitution I).
- Reuses the existing `getPage(i).render({ scale, render: 'bitmap' })` path already in `PdfPage.svelte`.

**Alternatives considered**:

- **Global Map<sourceId, PDFiumDocument> looked up inside `PdfPage`**: rejected. Introduces an implicit dependency (singleton registry) into a leaf component and makes testing harder.
- **Extend `PageData` to carry a `doc` reference**: rejected. `PageData` is a pure data record with `chars`, `imageData`, and geometry — mixing in a runtime object handle breaks that contract.

---

## Decision 5: Secondary-PDF lifecycle — load, hold, destroy

**Decision**:

1. On modal confirm (not on cancel), the chosen file is loaded via the existing `getPdfiumLibrary()` singleton and `library.loadDocument(bytes)` into a new `PDFiumDocument`.
2. The resulting `{ sourceId, name, bytes, doc, pageCount }` is appended to `sources` on the viewer.
3. On split-mode exit and on full state reset, every secondary `doc.destroy()` is called; `bytes` references are dropped; `sources = []` and `insertedPages = []` are reset atomically in the existing split-mode-exit `$effect`.
4. On modal cancel (user dismisses), a temporary `PDFiumDocument` that was loaded only to render the modal's thumbnail strip is destroyed before the modal unmounts. It never reaches the viewer's `sources` array.

**Rationale**:

- PDFium Wasm documents own native memory; failing to `destroy()` them leaks across the session (visible as a Wasm heap-grow in DevTools).
- Putting cleanup in the existing split-mode-exit `$effect` keeps lifecycle consistent with how `splitPoints` and `deletedPages` are reset (data-model invariant).
- Splitting "modal-local" vs "viewer-adopted" docs avoids adopting a doc whose pages the user never confirmed.

**Alternatives considered**:

- **Load the secondary doc into viewer state as soon as the file is picked**: rejected. Mutates the viewer before the user has confirmed anything and complicates cancel semantics.
- **Never destroy — rely on GC**: rejected. Wasm memory is not JS-GC-managed; explicit destruction is required per `@hyzyla/pdfium`'s contract.

---

## Decision 6: Source identity is an opaque id per upload invocation

**Decision**: Each successful modal confirm generates `sourceId = crypto.randomUUID()` and stores `{ id: sourceId, name: file.name, bytes, doc, pageCount }`. Filename is a display field only; identity is the UUID.

**Rationale**:

- Directly implements clarification: "each upload is a distinct source, even if filenames match".
- UUID is cheap and available in all modern browsers (`crypto.randomUUID()` is widely supported and already the kind of API used elsewhere in the project implicitly).
- Display name = filename without the extension is adequate for the source badge per spec Story 3.

**Alternatives considered**:

- **Use filename as id**: rejected directly by clarification.
- **Hash file bytes**: rejected. Adds I/O and doesn't match the "each upload is distinct" answer (two identical uploads would collide).
- **Auto-incrementing integer**: works functionally but offers no advantage over UUID and introduces an order-dependence on upload sequence.

---

## Decision 7: Size-warning threshold is a module constant, warning is a Skeleton confirm dialog

**Decision**: Define `INSERT_PDF_SIZE_WARN_BYTES = 100 * 1024 * 1024` in `InsertPagesModal.svelte`. On file pick, compare `file.size` to this constant before reading the bytes. If over the threshold, render a Skeleton `Alert`/confirm dialog inside the modal (blocking the thumbnail-render step) with "Continue" and "Cancel" buttons. On Continue, proceed to load and render. On Cancel, reset the picker and stay in the modal. No threshold override or tuning control is exposed in this release.

**Rationale**:

- Matches the spec's "approx. 100 MB" threshold with a single named constant that is easy to tune later without a feature change.
- Checking `file.size` before `arrayBuffer()` avoids ever reading the full file into memory on cancel — the browser streams file metadata separately.
- Using Skeleton's built-in patterns keeps styling and a11y consistent (constitution II).

**Alternatives considered**:

- **Hard block above threshold**: rejected directly by the clarification answer.
- **Check after loading via `bytes.byteLength`**: rejected. The whole point is to warn before committing to a large read.

---

## Decision 8: Modal selection UI — click-to-toggle, visual "selected" ring, no drag-reorder

**Decision**: `InsertPagesModal` renders thumbnails in a grid (Skeleton grid utilities + Tailwind). Clicking a thumbnail toggles it in `selectedIndices: Set<number>`. Selected thumbnails render with a Tailwind ring (`ring-2 ring-primary-500 ring-offset-2`) and a small count badge. "Confirm" is disabled while `selectedIndices.size === 0` (FR-015). No drag-reorder controls — ordering is source-page-ascending (clarification Q1).

**Rationale**:

- Click-to-toggle is the lowest-friction multi-select pattern for a grid of thumbnails and doesn't require checkbox chrome.
- Tailwind ring + count badge carries enough signal without custom CSS (constitution II).
- Since final order is deterministic (ascending source index), no drag handle is needed and the "reordering via drag" out-of-scope item stays out of scope.

**Alternatives considered**:

- **Checkbox overlay on each thumbnail**: works but more visual noise than a ring.
- **Range-select with shift-click**: nice-to-have, but the spec doesn't require it and the user can click each; defer to a follow-up if feedback demands it.

---

## Decision 9: Insertion-anchor UX — reuse split-gutter position with a secondary action

**Decision**: The primary grid already has gutters between pages (and before/after the first/last). While the insert modal has a confirmed selection, each gutter shows an "Insert N pages here" target on hover; clicking a gutter sets the insertion anchor and confirms the insert. Before any selection exists, the gutters behave exactly as today (split toggle on click, split-active state shown).

In practice the simplest two-step flow is: (1) user opens modal, picks file, selects pages, clicks Continue (modal stays open or minimizes); (2) primary grid enters an "awaiting anchor" mode where gutters show the insert target; user clicks a gutter to commit. Cancel from this mode returns without changing state.

**Rationale**:

- Reuses a UI surface the user already understands (the split gutter).
- Keeps the modal responsible for "what to insert" and the grid responsible for "where to insert" — a clean separation.
- Avoids adding a second list/selector for anchor position inside the modal, which would duplicate primary-grid context (every page thumbnail would need to appear inside the modal too).

**Alternatives considered**:

- **Radio list of anchor positions inside the modal**: rejected as duplicative and inaccessible for long documents.
- **Drag-to-anchor from the modal**: rejected as complex; the spec explicitly marks drag reordering out of scope.
- **Commit immediately after "Confirm" with a default anchor (e.g. end of document)**: rejected — defeats FR-005 (user MUST be able to designate anchor, including interior positions).

---

## Decision 10: Invalid / password-protected PDFs surface inside the modal

**Decision**: `library.loadDocument(bytes)` is wrapped in a try/catch inside `InsertPagesModal`. On throw, the modal renders an inline Skeleton `Alert` explaining "This file could not be opened — it may be invalid or password-protected. Pick another file." The primary grid is not touched (FR-013 invariant). The user can pick a new file without closing the modal.

**Rationale**:

- Matches FR-013's "communicate the failure clearly and leave the primary document untouched" without redirecting the user.
- Keeps the error surface co-located with the action that caused it.

**Alternatives considered**:

- **Toast / snackbar**: rejected. Error origin is less obvious; the user might not see it if attention is on the file picker.
- **Whole-app error banner**: rejected as disproportionate (it's a user-picked file, not a system fault).

---

## Open Items

None. All decisions above are locked for Phase 1 and `/speckit.tasks`.
