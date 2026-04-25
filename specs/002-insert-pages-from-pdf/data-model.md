# Phase 1 Data Model: Insert Pages from Another PDF in Split Mode

**Feature**: `specs/002-insert-pages-from-pdf/spec.md`
**Date**: 2026-04-20

This feature introduces three in-memory entities scoped to one component (`PdfViewer.svelte`) plus an updated semantics for two pre-existing entities (`splitPoints`, `deletedPages`). Nothing is persisted. Nothing is shared across browser tabs or sessions.

---

## Entity: Source PDF

**Owner**: `apps/web/src/lib/components/PdfViewer.svelte`
**Declaration**:

```ts
interface SourcePdf {
	id: string; // crypto.randomUUID() assigned on successful modal confirm
	name: string; // original File.name at upload time (displayed on inserted-page badge)
	bytes: Uint8Array; // raw bytes, held for export-time copyPages
	doc: PDFiumDocument; // loaded PDFium handle, held for render-time getPage(i)
	pageCount: number; // number of pages in this source
}

let sources: SourcePdf[] = $state([]);
```

### Semantics

Each element is one successful invocation of the insert flow. Identity is the UUID, never the filename.

### Invariants

1. **Distinct per upload (FR-016)**: two `SourcePdf` entries with the same `name` are allowed and MUST NOT be collapsed. The UUID distinguishes them.
2. **Scoped to split mode**: `sources.length > 0` implies `splitMode === true`. On `splitMode` transition to `false`, every entry's `doc.destroy()` is called and `sources = []`.
3. **Held for the whole session**: a `SourcePdf` is never removed mid-session, even if all its inserted references are deleted via the deletion toggle. Removing a source would complicate identity for the remaining badges and the undo-the-deletion user flow.
4. **Not persisted**: no `localStorage`, no cookies, no server round-trip. `bytes` come directly from `File.arrayBuffer()` on the user's device.

### Lifecycle

```
(modal confirm with non-empty selection)
            │
            ▼
sources.push({ id, name, bytes, doc, pageCount })
            │
 (user may insert more pages later; source stays in array)
            │
(split mode exits)
            │
            ▼
sources.forEach(s => s.doc.destroy()); sources = [];
```

---

## Entity: Inserted Page Reference

**Owner**: `apps/web/src/lib/components/PdfViewer.svelte`
**Declaration**:

```ts
interface InsertedPage {
	sourceId: string; // matches SourcePdf.id
	sourcePageIndex: number; // 0-based page index inside that source
	insertionAnchor: number; // sequence position in combinedSequence at insert time
}

let insertedPages: InsertedPage[] = $state([]);
```

### Semantics

One record per inserted page. Multiple records can share a `sourceId` (inserting N pages from one source produces N records). Multiple records can share `{ sourceId, sourcePageIndex }` (the same source page inserted twice).

### Invariants

1. **Source must exist**: every `insertedPages[i].sourceId` MUST reference a current `SourcePdf`. Since sources are append-only until split-mode exit, this holds trivially.
2. **Page index in range**: `0 ≤ sourcePageIndex < source.pageCount`.
3. **Anchor in range at insert time**: `0 ≤ insertionAnchor ≤ combinedSequence.length` at the moment of insert. After insert, `combinedSequence` grows and the anchor becomes a historical record of insertion position — it is not re-interpreted when further inserts happen elsewhere.
4. **Order within one insert is source-ascending**: when the user selects pages from the secondary PDF and confirms, the generated `InsertedPage[]` batch is sorted by `sourcePageIndex` ascending (clarification Q1).
5. **Reset on split-mode exit**: `splitMode` transition to `false` clears `insertedPages = []` in the same `$effect` that clears `sources`.

---

## Derived Entity: Combined Page Sequence

**Owner**: `apps/web/src/lib/components/PdfViewer.svelte`
**Declaration**:

```ts
type PageRef =
	| { kind: "original"; index: number }
	| { kind: "inserted"; sourceId: string; sourcePageIndex: number };

let combinedSequence: PageRef[] = $derived(buildSequence(pages, insertedPages));
```

### Semantics

Deterministic fold of originals + insertions. Building rule: iterate `pages` in order (position 0..pages.length-1), and between positions (and at the ends), splice in any `InsertedPage[]` whose `insertionAnchor` falls there. Inserted pages whose anchors fall at the same position are ordered by their insert-time sequence (batch order), then by `sourcePageIndex` ascending (already guaranteed by insert).

Pseudocode:

```ts
function buildSequence(pages: PageData[], inserted: InsertedPage[]): PageRef[] {
	const byAnchor = groupBy(inserted, (x) => x.insertionAnchor);
	const out: PageRef[] = [];
	for (let i = 0; i <= pages.length; i++) {
		for (const ins of byAnchor.get(i) ?? []) {
			out.push({
				kind: "inserted",
				sourceId: ins.sourceId,
				sourcePageIndex: ins.sourcePageIndex,
			});
		}
		if (i < pages.length) out.push({ kind: "original", index: i });
	}
	return out;
}
```

### Invariants

1. **Ordering is total and stable**: given the same `(pages, insertedPages)`, `combinedSequence` is deterministic.
2. **No duplicates from originals**: each original page appears exactly once.
3. **Inserted pages may repeat**: two `InsertedPage` records with identical `{sourceId, sourcePageIndex}` produce two entries in `combinedSequence`, in their respective positions.
4. **Length**: `combinedSequence.length === pages.length + insertedPages.length`.

---

## Updated entity: splitPoints (refactored)

**Owner**: `apps/web/src/lib/components/PdfViewer.svelte`
**Declaration**: unchanged — `let splitPoints: Set<number> = $state(new Set())`

### What changes

Elements are now **sequence positions** (indices into `combinedSequence`), not original page indices. `splitPoints.has(k)` means "split after the page at combinedSequence position k".

### Invariants

1. **In range**: every element MUST satisfy `0 ≤ k < combinedSequence.length`. When an insert grows `combinedSequence`, existing `splitPoints` entries continue to refer to the same trailing-edge position (their numeric value doesn't shift unless the caller rebases them — see Decision 11 below).
2. **Rebase on insert** (algorithm): when an insert at anchor `a` of `n` pages is applied, every existing `splitPoint k` with `k >= a` shifts to `k + n`. This keeps the _semantic_ split point pinned to the same adjacent original page.
3. **Rebase on delete** is not needed in this feature — delete is a visibility/export flag, not a mutation of `combinedSequence`. (`deletedPages` below.)
4. **Reset on split-mode exit**: unchanged from KDA-27.

---

## Updated entity: deletedPages (refactored)

**Owner**: `apps/web/src/lib/components/PdfViewer.svelte`
**Declaration**: unchanged — `let deletedPages: Set<number> = $state(new Set())`

### What changes

Elements are now **sequence positions**, not original page indices. `deletedPages.has(k)` means "omit combinedSequence[k] from every exported segment". A deleted page is still rendered in the grid (dimmed, per KDA-27) — deletion is a filter applied at export time.

### Invariants

1. **In range**: `0 ≤ k < combinedSequence.length`.
2. **Rebase on insert**: same shift rule as `splitPoints` — any `k >= insertionAnchor` shifts by `+n`.
3. **Deletion applies uniformly** to original and inserted refs (FR-009): the render check is on position, not on `ref.kind`.
4. **Reset on split-mode exit**: unchanged from KDA-27.

---

## Derived state (viewer)

| Derived value        | Computation                                                                                    | Purpose                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `combinedSequence`   | `buildSequence(pages, insertedPages)` (Decision 3 above).                                      | Single source of truth for render iteration, split positions, deletion positions, export payload. |
| `effectivePageCount` | `combinedSequence.length - deletedPages.size`                                                  | FR-015 / KDA-27 equivalent: drives the export guard. When `0`, export is disabled.                |
| `fileCount`          | `computeSegmentPositions(combinedSequence.length, [...splitPoints], [...deletedPages]).length` | Live file-count summary in the status bar (unchanged semantics vs. KDA-27, new name internally).  |
| `sourceById`         | `new Map(sources.map(s => [s.id, s]))`                                                         | O(1) lookup for `PdfPage.svelte`'s `doc` resolver and for rendering source badges.                |

---

## Relationship table

| Entity             | Owned by                     | Reset on split-mode exit | Persisted |
| ------------------ | ---------------------------- | ------------------------ | --------- |
| `pages` (original) | `+page.svelte` (prop)        | No (immutable in viewer) | No        |
| `sources`          | `PdfViewer.svelte`           | Yes (docs destroyed)     | No        |
| `insertedPages`    | `PdfViewer.svelte`           | Yes                      | No        |
| `combinedSequence` | `PdfViewer.svelte` (derived) | Auto (from its inputs)   | No        |
| `splitPoints`      | `PdfViewer.svelte`           | Yes (KDA-27 behavior)    | No        |
| `deletedPages`     | `PdfViewer.svelte`           | Yes (KDA-27 behavior)    | No        |

---

## Validation rules

Enforced inside `PdfViewer.svelte`:

1. On insert commit: batch is sorted by `sourcePageIndex` ascending; existing `splitPoints` / `deletedPages` are rebased by the shift rule above; `insertedPages` is appended with the confirmed anchor.
2. On split-mode exit: every `SourcePdf.doc.destroy()` is called before `sources = []`. Order: destroy → clear. Clearing first would drop references before destruction can be issued.
3. On modal cancel: no mutation of viewer state. Any modal-local `PDFiumDocument` used for thumbnail rendering is destroyed inside the modal before it unmounts.

---

## What this model deliberately does NOT do

- **No persistence of any kind**. Sources, insertions, splits, and deletions are all transient.
- **No undo stack**. Consistent with KDA-27; toggling a delete or removing a just-made insertion (via delete-page toggle on every inserted page) is enough.
- **No stable id per `PageRef`**. Positions are the key. A stable-id refactor is a follow-up if reorder-by-drag ever lands.
- **No cross-source deduplication**. Two identical uploads produce two `SourcePdf` entries (clarification Q2).
- **No search/char-box extraction for inserted pages**. Not claimed by any acceptance scenario and not needed for the primary value; out of scope.
