# Phase 1 Data Model: Allow Deleting Pages in Split Mode

**Feature**: `specs/001-delete-pages-split/spec.md`
**Date**: 2026-04-19

This feature introduces a single in-memory entity scoped to one component. There is no persistent storage, no serialization, and no data model change outside `PdfViewer.svelte`.

---

## Entity: Excluded Page Set

**Owner**: `apps/web/src/lib/components/PdfViewer.svelte`
**Declaration**: `let deletedPages: Set<number> = $state(new Set())`

### Semantics

Each element is a 0-based page index present in the current document (`pages[].index`). Membership means "this page must be omitted from every exported segment".

### Invariants

1. **Bounded by the document**: every element MUST satisfy `0 ≤ index < pages.length`. The UI only exposes toggles for real thumbnails, so this holds by construction; no runtime clamp is added.
2. **Scoped to split mode**: `deletedPages.size > 0` implies `splitMode === true`. When `splitMode` transitions from `true → false`, the existing clear-on-exit `$effect` MUST reset `deletedPages` to `new Set()` (mirroring the existing reset of `splitPoints`).
3. **No persistence**: `deletedPages` is never written to `localStorage`, cookies, URL state, or a server. Reloading the page or re-entering split mode yields an empty Set.
4. **Independent of `splitPoints`**: the two Sets are unrelated — a page can be a split point and be excluded (unusual but valid; see Edge Case "Exclusion controls interact with a page that has a split point on it" in `spec.md`).

### State Transitions

```
           (split mode entered, document loaded)
                        │
                        ▼
            ┌───────────────────────────┐
            │  deletedPages = new Set() │
            └───────────────────────────┘
              │          ▲         │
 toggle(p) ──►│          │         │──► exit split mode
  add/remove  │          │         │     (effect resets)
              │          │         │
              ▼          │         ▼
            ┌───────────────────────────┐
            │  deletedPages containing  │
            │  zero or more indices     │
            └───────────────────────────┘
```

No other transitions. There is no "confirm delete" step; exclusions are immediate and reversible.

### Derived State (computed in `PdfViewer.svelte`)

| Derived value        | Computation                                                                                                           | Purpose                                                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `effectivePageCount` | `pages.length - deletedPages.size`                                                                                    | Drives the FR-009 export guard. When `0`, export is disabled and the warning renders.                                               |
| `fileCount`          | Count of non-empty segments after applying exclusions to the split ranges (see `contracts/splitPdf.md` for the rule). | Replaces the current `splitPoints.size + 1` expression in the status summary. Users see the real number of files they will receive. |

### Relationship to Existing State

| Existing state                            | Relationship                                                                                                                                                                                    |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `splitPoints: Set<number>`                | Independent. Both live on `PdfViewer.svelte`. Both are reset together when split mode exits.                                                                                                    |
| `pageGroupMap: SvelteMap<number, number>` | Unchanged. Exclusion does NOT remove pages from a group — a dimmed page still belongs to its group visually; it is only dropped at export time. This keeps the thumbnail grid structure stable. |
| `pages: PageData[]` (prop)                | Unchanged. `pages` is the source of truth for which pages exist; `deletedPages` is a filter layered on top at export.                                                                           |

### Validation Rules

None at the entity level. The only runtime check is FR-009's guard in `doExport` (see `contracts/splitPdf.md`), which inspects `effectivePageCount` before calling the exporter.

---

## What this model deliberately does NOT do

- **No per-page metadata** (reason, timestamp, user). A `Set<number>` is sufficient; anything richer would be a speculative abstraction (constitution V).
- **No undo/redo stack**. Toggles are already trivially reversible by toggling again.
- **No integration with `charBoxes`, `matches`, or search state**. Deleted pages still render in the grid and still participate in search (users might be searching precisely for text to decide whether to exclude a page). Search highlight drift is explicitly out of scope (constitution I is untouched).
