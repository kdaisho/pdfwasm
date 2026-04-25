# Contract: `splitPdf` (multi-source)

**File**: `apps/web/src/lib/services/splitPdf.ts`
**Feature**: `specs/002-insert-pages-from-pdf/spec.md`
**Date**: 2026-04-20

This contract specifies the new signature and behavior of `splitPdf` after KDA-28. It is the only external interface affected by this feature. `splitPdf` has exactly one caller in the codebase (`PdfViewer.svelte#doExport`), updated atomically in the same change — no transitional shim is provided.

---

## Before (KDA-27)

```ts
export function computeSegmentPageIndices(
	totalPages: number,
	splitPoints: number[],
	excludedPages: number[] = [],
): number[][];

export async function splitPdf(
	pdfBytes: Uint8Array,
	splitPoints: number[],
	excludedPages: number[] = [],
): Promise<Uint8Array[]>;
```

`splitPoints` and `excludedPages` were 0-based indices into the single source document. One source.

---

## After (KDA-28)

```ts
/** One entry in the combined sequence: a single page, identified by its source and that source's page index. */
export interface SequenceEntry {
	sourceId: string;
	pageIndex: number;
}

/** Positions within a combinedSequence, 0..sequence.length-1. */
export function computeSegmentPositions(
	sequenceLength: number,
	splitPoints: number[],
	excludedPositions: number[] = [],
): number[][];

/** Assemble one or more output PDFs by copying pages from multiple source PDFs into segments. */
export async function splitPdf(args: {
	sources: Map<string, Uint8Array>;
	sequence: SequenceEntry[];
	splitPoints: number[];
	excludedPositions?: number[];
}): Promise<Uint8Array[]>;
```

- `sources` — map from `sourceId` to raw PDF bytes. Must contain every `sourceId` referenced by `sequence`. Typically has one entry (`'primary'`) when no insertions exist, and one additional entry per `SourcePdf` when insertions exist.
- `sequence` — the combined, ordered list of page references. `sequence[k]` is "the page that lives at position `k`".
- `splitPoints` — sorted array of **sequence positions** after which to split. Passing `[2, 5]` means split after position 2 and after position 5.
- `excludedPositions` — NEW, optional. Array of **sequence positions** to omit from every resulting segment. Duplicates and out-of-range positions are ignored. Default: `[]`.

Return type is `Promise<Uint8Array[]>`. The length of the returned array can be smaller than `splitPoints.length + 1` if some segments become empty after exclusion (Rule 2 below).

---

## Behavior

### Rule 1 — Exclusion filters positions from each segment's range

For each segment `[posStart, posEnd)` derived from `splitPoints`, the set of sequence positions copied into the new PDF is:

```
{ k ∈ [posStart, posEnd) : k ∉ excludedPositions }
```

Order is preserved (ascending sequence position). Excluded positions never appear in any output file.

### Rule 2 — Empty segments are dropped

If applying Rule 1 produces an empty set for a segment, that segment is **not** emitted. The returned array contains only non-empty segments, in their original relative order.

Example: `sequence.length = 6`, `splitPoints = [1, 3]`, `excludedPositions = [2, 3]`.

- Segment ranges before exclusion: `[0,2)`, `[2,4)`, `[4,6)` → positions `{0,1}`, `{2,3}`, `{4,5}`.
- After exclusion: `{0,1}`, `{}`, `{4,5}`.
- Output: 2 files, containing the pages at positions `{0,1}` and `{4,5}` respectively — **resolved via `sequence[k]` to their true source page**.

### Rule 3 — Source loading and cross-document copy

Each distinct `sourceId` in `sequence` is loaded exactly once via `PDFDocument.load(sources.get(sourceId)!)`. Pages are copied per segment using `copyPages(srcDoc, [entry.pageIndex])` and appended in sequence-position order to a fresh output `PDFDocument`.

```ts
const loaded = new Map<string, PDFDocument>();
async function ensureLoaded(id: string) {
	let d = loaded.get(id);
	if (!d) {
		d = await PDFDocument.load(sources.get(id)!);
		loaded.set(id, d);
	}
	return d;
}
```

### Rule 4 — Numbering of downloaded files follows output order

`downloadSplitPdfs` is unchanged in signature (`(segments: Uint8Array[])`). Files are named `split-1.pdf`, `split-2.pdf`, … based on their **position in the returned array**, not on pre-exclusion segment index. Same rule as KDA-27.

### Rule 5 — Omitted `excludedPositions`

Calling `splitPdf({ sources, sequence, splitPoints })` and `splitPdf({ sources, sequence, splitPoints, excludedPositions: [] })` MUST produce identical output. The optional parameter's default is `[]`.

### Rule 6 — Caller responsibilities

- The caller guards against "every position excluded" (FR-015 / KDA-27's FR-009 equivalent): if `excludedPositions` covers every position, `splitPdf` returns `[]`. The viewer's pre-export UI guard MUST prevent this from happening; the exporter does not throw.
- The caller MUST provide a `sources` map that contains bytes for every `sourceId` referenced in `sequence`. If a `sourceId` is missing, `sources.get(sourceId)!` is a contract violation (the non-null assertion will fault) — this is the caller's bug, not the exporter's.

### Rule 7 — Pure function w.r.t. viewer state

`splitPdf` does NOT destroy any `PDFDocument` it loads (those are local to the call) beyond the natural GC of the function scope. It does NOT mutate `sources`, `sequence`, `splitPoints`, or `excludedPositions`. Callers can pass arrays backed by `$state` directly.

---

## Non-behavior (explicitly out of scope)

- **No reordering**: positions within each segment follow the input sequence order.
- **No deduplication across sources**: two entries with the same `{sourceId, pageIndex}` produce two copies of that page in the output.
- **No metadata propagation**: document-level metadata (title, author, etc.) is not carried over from any source to the output; behavior unchanged from KDA-27.
- **No source-set minimization**: if `sources` contains a `sourceId` that `sequence` never references, it is harmlessly ignored (not loaded, no error).

---

## Acceptance test (manual)

A developer can verify this contract with a 3-page primary PDF (`P`, pages 0–2) and a 2-page secondary PDF (`S`, pages 0–1):

| `sources`                            | `sequence` (as `source:page`) | `splitPoints` | `excludedPositions` | Expected output                                    |
| ------------------------------------ | ----------------------------- | ------------- | ------------------- | -------------------------------------------------- |
| `{P}`                                | `P:0, P:1, P:2`               | `[]`          | `[]`                | 1 file: P0, P1, P2.                                |
| `{P}`                                | `P:0, P:1, P:2`               | `[1]`         | `[]`                | 2 files: [P0, P1], [P2].                           |
| `{P, S}`                             | `P:0, S:0, S:1, P:1, P:2`     | `[]`          | `[]`                | 1 file: P0, S0, S1, P1, P2.                        |
| `{P, S}`                             | `P:0, S:0, S:1, P:1, P:2`     | `[2]`         | `[]`                | 2 files: [P0, S0, S1], [P1, P2].                   |
| `{P, S}`                             | `P:0, S:0, S:1, P:1, P:2`     | `[2]`         | `[1]`               | 2 files: [P0, S1], [P1, P2]. (S0 dropped.)         |
| `{P, S}`                             | `P:0, S:0, S:1, P:1, P:2`     | `[2]`         | `[0, 1, 2]`         | 1 file: [P1, P2]. (First segment empty → dropped.) |
| `{P, S₁, S₂}` (two distinct sources) | `P:0, S₁:0, P:1, S₂:0, P:2`   | `[1, 3]`      | `[]`                | 3 files: [P0, S₁:0], [P1, S₂:0], [P2].             |

---

## Migration notes (for the single caller)

`PdfViewer.svelte#doExport` is updated in the same PR as the signature change:

```ts
// Before
const segments = await splitPdf(pdfBytes, [...splitPoints], [...deletedPages]);

// After
const sourcesMap = new Map<string, Uint8Array>();
sourcesMap.set("primary", pdfBytes);
for (const s of sources) sourcesMap.set(s.id, s.bytes);

const sequence: SequenceEntry[] = combinedSequence.map((ref) =>
	ref.kind === "original"
		? { sourceId: "primary", pageIndex: ref.index }
		: { sourceId: ref.sourceId, pageIndex: ref.sourcePageIndex },
);

const segments = await splitPdf({
	sources: sourcesMap,
	sequence,
	splitPoints: [...splitPoints],
	excludedPositions: [...deletedPages],
});
```

The export-guard condition changes correspondingly: from `effectivePageCount === 0` computed against `pages.length` to the same expression computed against `combinedSequence.length`.
