# Contract: `splitPdf`

**File**: `apps/web/src/lib/services/splitPdf.ts`
**Feature**: `specs/001-delete-pages-split/spec.md`
**Date**: 2026-04-19

This contract specifies the new signature and behavior of `splitPdf` after the KDA-27 change. It is the only external interface affected by this feature.

---

## Before (current)

```ts
export async function splitPdf(
	pdfBytes: Uint8Array,
	splitPoints: number[],
): Promise<Uint8Array[]>;
```

Produces one `Uint8Array` per segment. Segments are defined by the split points.

---

## After (KDA-27)

```ts
export async function splitPdf(
	pdfBytes: Uint8Array,
	splitPoints: number[],
	excludedPages?: number[],
): Promise<Uint8Array[]>;
```

- `pdfBytes` — unchanged.
- `splitPoints` — unchanged: sorted array of page indices _after_ which to split (0-based). Passing `[2, 5]` means split after page 2 and after page 5.
- `excludedPages` — NEW, optional. Array of 0-based page indices to omit from every resulting segment. Duplicates and out-of-range indices are ignored. Default: `[]`.

Return type is unchanged (`Promise<Uint8Array[]>`), but the **length** of the returned array can now be smaller than `splitPoints.length + 1` if some segments become empty after exclusion (see Rule 2 below).

---

## Behavior

### Rule 1 — Exclusion filters page indices from each segment's range

For each segment `[rangeStart, rangeEnd)` derived from `splitPoints`, the set of page indices copied into the new PDF is:

```
{ i ∈ [rangeStart, rangeEnd) : i ∉ excludedPages }
```

Order is preserved (ascending page index). Excluded pages never appear in any output file.

### Rule 2 — Empty segments are dropped

If applying Rule 1 produces an empty set for a segment, that segment is **not** emitted. The returned array contains only non-empty segments, in their original relative order.

Example: document has 6 pages, `splitPoints = [1, 3]`, `excludedPages = [2, 3]`.

- Segment ranges before exclusion: `[0,2)`, `[2,4)`, `[4,6)` → pages `{0,1}`, `{2,3}`, `{4,5}`.
- After exclusion: `{0,1}`, `{}`, `{4,5}`.
- Output: 2 files, containing pages `{0,1}` and `{4,5}` respectively.

### Rule 3 — Numbering of downloaded files follows output order

`downloadSplitPdfs` is unchanged. Files are named `split-1.pdf`, `split-2.pdf`, … based on their **position in the returned array**, not on pre-exclusion segment index. So in the example above the two downloads are `split-1.pdf` (pages 0–1) and `split-2.pdf` (pages 4–5) — not `split-1.pdf` and `split-3.pdf`.

### Rule 4 — Undefined vs empty `excludedPages`

Calling `splitPdf(bytes, points)` and `splitPdf(bytes, points, [])` MUST produce identical output. The optional parameter's default is `[]`.

### Rule 5 — Caller responsibilities

The caller is responsible for guarding against the "every page excluded" case (FR-009). If the caller passes `excludedPages` that covers every page in the document, `splitPdf` returns an empty array (`[]`). The caller (`PdfViewer.svelte#handleExport`) MUST prevent this from happening via the pre-export UI guard; the exporter does not throw.

---

## Non-behavior (explicitly out of scope)

- **No reordering**: page order within each segment follows the original document order.
- **No deduplication of source document**: if the source PDF has literal duplicate pages, `splitPdf` treats them as distinct indices — exclusion by index, not by content.
- **No metadata propagation**: document-level metadata (title, author, etc.) handling is unchanged from the current implementation.

---

## Acceptance test (manual)

A developer can verify this contract with a 6-page sample document:

| Input                                          | Expected output                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------- |
| `splitPoints=[], excludedPages=[]`             | 1 file with pages 0–5.                                                          |
| `splitPoints=[2], excludedPages=[]`            | 2 files: pages 0–2, pages 3–5.                                                  |
| `splitPoints=[2], excludedPages=[0]`           | 2 files: pages 1–2, pages 3–5.                                                  |
| `splitPoints=[2], excludedPages=[0,1,2]`       | 1 file: pages 3–5. (First segment dropped.)                                     |
| `splitPoints=[2], excludedPages=[0,1,2,3,4,5]` | `[]` (empty array). Caller UI must have blocked this via FR-009 before calling. |
