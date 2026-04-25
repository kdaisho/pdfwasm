# Contract: `InsertPagesModal.svelte`

**File**: `apps/web/src/lib/components/InsertPagesModal.svelte` (NEW)
**Feature**: `specs/002-insert-pages-from-pdf/spec.md`
**Date**: 2026-04-20

This contract specifies the new modal's public surface: its props, events, internal state transitions, and error surfaces. The modal drives the "pick file → select pages → confirm" flow. It does **not** know about insertion anchors — that concern lives in `PdfViewer.svelte`, which consumes the modal's confirm payload and then enters an "awaiting anchor" mode on the primary grid (see Research Decision 9).

---

## Props

```ts
interface Props {
	open: boolean; // controlled by parent; parent toggles to show/hide
}

let { open = $bindable() }: Props = $props();
```

The modal is controlled via `bind:open` from the parent. The parent is responsible for opening it (when the toolbar button is clicked) and closing it after consuming the confirm event.

---

## Events

The modal communicates outcomes via Svelte 5 callback props (idiomatic for Svelte 5 — no `createEventDispatcher`):

```ts
interface Props {
	open: boolean;
	onconfirm: (payload: ConfirmPayload) => void;
	oncancel: () => void;
}

interface ConfirmPayload {
	sourceName: string; // File.name — the parent uses this for the badge
	sourceBytes: Uint8Array; // raw bytes — parent will keep for the export and to feed PDFium
	sourcePageCount: number;
	selectedPageIndices: number[]; // ascending, deduplicated, non-empty
}
```

- `onconfirm(payload)` fires exactly once per successful confirm. After firing, the modal must be closed by the parent (`open = false`) before it can be reopened.
- `oncancel()` fires when the user dismisses the modal without confirming (Escape key, backdrop click, Cancel button). No state flows back to the parent.
- `onconfirm` does **not** include the `PDFiumDocument` the modal loaded internally — the parent re-loads the bytes via its own `getPdfiumLibrary()` to obtain a fresh `PDFiumDocument` whose ownership is unambiguous (see Research Decision 5). The modal destroys its internal doc before closing.

---

## Internal state machine

```
         ┌────────────────┐
open=true│                │
─────────►      idle      │
         │ (file picker)  │
         └──────┬─────────┘
                │ user picks a file
                ▼
         ┌────────────────┐   size > 100MB?   ┌──────────────────┐
         │  size-check    ├───────────────────►   warn-confirm    │
         └──────┬─────────┘                   │ (Continue/Cancel)│
                │ size OK or user Continues   └────────┬─────────┘
                ▼                                      │
         ┌────────────────┐  load failure   ┌──────────▼─────────┐
         │  loading       ├────────────────►│   error (invalid/  │
         │ (library.load) │                 │   password-prot.)  │
         └──────┬─────────┘                 └──────────┬─────────┘
                │ success                              │ user picks new file
                ▼                                      ▼
         ┌────────────────┐                     (back to idle)
         │  select        │◄─────────────────────────────────
         │ (thumbnail     │
         │  grid + ring)  │
         └──────┬─────────┘
                │ click Confirm (disabled while selection is empty)
                ▼
         ┌────────────────┐
         │  confirmed     │ — onconfirm({...})
         └────────────────┘
                │
                ▼
      (parent sets open=false;
       modal destroys internal doc on unmount)
```

---

## Behavior rules

### Rule 1 — Single-file picker

The file input is rendered without the `multiple` attribute. If the user manages to select multiple files via OS tricks, the modal uses `files[0]` only; any others are silently ignored. This upholds the FR-002 clarification ("single-file picker").

### Rule 2 — Accept-type filter

The file input sets `accept="application/pdf"`. This is a hint, not a guarantee — the MIME check is done defensively by attempting `library.loadDocument(bytes)` and surfacing the error per Rule 5.

### Rule 3 — Size warning threshold

```ts
const INSERT_PDF_SIZE_WARN_BYTES = 100 * 1024 * 1024;
```

If `file.size > INSERT_PDF_SIZE_WARN_BYTES`, the modal transitions to `warn-confirm` state and renders a Skeleton Alert with:

- Title: "Large file"
- Body: `"${file.name} is ${Math.round(file.size / 1024 / 1024)} MB. Continue loading? This may briefly slow the app."`
- Buttons: `Continue` (→ `loading` state) and `Cancel` (→ `idle` state, file cleared).

File bytes are NOT read until the user presses Continue.

### Rule 4 — Thumbnail rendering

In `select` state, the modal renders each page as a small canvas (150–200 px wide) using the same PDFium bitmap path as `PdfPage.svelte`, but at a reduced `RENDER_SCALE`. This pipeline is internal to the modal and uses the modal's internal `PDFiumDocument`. Thumbnails render lazily (on mount of the thumbnail cell) to avoid blocking the first paint when the source has many pages.

### Rule 5 — Invalid / password-protected PDF

If `library.loadDocument(bytes)` throws, the modal moves to `error` state and renders a Skeleton `Alert` (severity: error) with:

- Body: `"This file could not be opened. It may be invalid, corrupted, or password-protected."`
- A single action: "Pick another file" (→ `idle`, resets the file input).

Primary-grid state is never touched. `onconfirm` is NOT fired. `oncancel` is NOT fired unless the user closes the modal without picking another file.

### Rule 6 — Selection semantics

- `let selectedPageIndices: Set<number> = $state(new Set())`.
- Clicking a thumbnail toggles its page index in the Set.
- The Confirm button is disabled while `selectedPageIndices.size === 0` (FR-015).
- On Confirm, the modal emits `onconfirm({ …, selectedPageIndices: [...selected].sort((a,b) => a-b) })` — ascending, deduplicated, non-empty (Q1 clarification).

### Rule 7 — Escape key and backdrop click

Both dismiss the modal and fire `oncancel()` regardless of the current internal state (`idle`, `warn-confirm`, `loading`, `select`, `error`). In-flight loads are abandoned; any modal-local `PDFiumDocument` is destroyed in the modal's `$effect` cleanup.

### Rule 8 — No mutation of parent state

The modal never directly reads or writes any property of `PdfViewer.svelte`. All communication goes through the `open` prop (in) and the two callbacks (out). This keeps the component testable in isolation.

---

## Parent integration (informative, not part of the modal's contract)

After `onconfirm`, the parent:

1. Closes the modal (`open = false`).
2. Loads a fresh `PDFiumDocument` from `sourceBytes` via `getPdfiumLibrary()`.
3. Pushes a new `SourcePdf` onto `sources`.
4. Enters an "awaiting insertion anchor" mode on the primary grid: gutters become insert targets; clicking a gutter commits the inserts at that position.
5. If the user cancels the anchor step (e.g. presses Escape), the new `SourcePdf` is destroyed (`doc.destroy()`) and removed from `sources` — since no inserted pages reference it yet, nothing else needs to change. (This is a viewer-side policy; the modal is already unmounted and is not involved.)

---

## Accessibility notes

- The modal uses Skeleton's `Modal` component which provides focus trapping and ARIA role="dialog" automatically.
- Thumbnails are `button` elements (not `div`s with click handlers) so keyboard users can Tab/Space to toggle selection.
- The size-warning and error alerts use Skeleton's `Alert` component which has role="alert" and appropriate severity styling.

---

## Out of scope for this contract

- Drag-reorder of selected pages inside the modal (spec out-of-scope).
- Range-select via shift-click (follow-up if user demand).
- Previewing a specific inserted page at full resolution (follow-up).
- Saving or caching the loaded `PDFiumDocument` between modal opens — each open is a fresh flow.
