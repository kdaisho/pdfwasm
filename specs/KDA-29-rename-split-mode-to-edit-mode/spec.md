# Rename Split Mode to Edit Mode and Allow Exporting Edits Without Split Points

**Linear:** [KDA-29](https://linear.app/kdaisho/issue/KDA-29/rename-split-mode-to-edit-mode-and-allow-exporting-edits-without-split) — Rename Split mode to Edit mode and allow exporting edits without split points
**Branch:** `KDA-29/rename-split-mode-to-edit-mode-and-allow-exporting-edits-without-split-points`
**Created:** 2026-04-25
**Status:** Ready

## Problem Statement

A user editing a PDF (deleting pages or inserting pages from another PDF) must currently enter "Split mode" and place at least one split marker before the export button activates. With zero markers, any deletions or insertions they have made are trapped — there is no way to export the edited result. The mode is no longer really about splitting; splitting is one option within a broader editing flow, and gating export on a split marker forces users to invent an artificial split or abandon their edits.

## Context

- Files likely touched:
    - `apps/web/src/routes/+page.svelte` — owns `splitMode` state and the `onToggleSplit` wiring
    - `apps/web/src/lib/components/PdfSidebarItems.svelte` — sidebar toggle button copy ("Split Mode" / "Exit Split Mode")
    - `apps/web/src/lib/components/PdfViewer.svelte` — `splitMode` prop, export gating (`splitPoints.size === 0` checks at lines 344, 375), export button label "Export Split PDFs", split-point indicator UI
    - `apps/web/src/lib/services/splitPdf.ts` — already produces N segments from split points; single-PDF export path may need a thin wrapper or a 0-splits branch
- Related specs: `specs/001-delete-pages-split/`, `specs/002-insert-pages-from-pdf/` (the two features whose output is currently un-exportable without a marker)
- Constraints: page grid already reflects deletions/insertions live (no preview UI work needed); `splitPoints`, `deletedPages`, and inserted-source state are cleared on mode exit — that behavior should carry over to Edit mode

## Acceptance Criteria

- [ ] Given a loaded PDF, when the user opens the sidebar, then the toggle button reads "Edit Mode" / "Exit Edit Mode" (no remaining "Split" copy in button labels, headings, tooltips, or the export button).
- [ ] Given Edit mode with zero split points and zero edits, when the user views the export control, then it is disabled.
- [ ] Given Edit mode with zero split points and at least one edit (deleted page, inserted page, or page count differing from the original), when the user clicks export, then a single PDF downloads reflecting those edits.
- [ ] Given Edit mode with one or more split points (with or without other edits), when the user clicks export, then multiple PDFs download, each segment reflecting the edits.
- [ ] Given Edit mode with edits applied, when the user toggles Edit mode off, then split points, deletions, and inserted-source state are cleared (existing behavior preserved).
- [ ] Given Edit mode, when the user deletes or inserts pages, then the page grid updates immediately (no regression vs. current behavior).

## Out of Scope

- Undo / redo / reset of edits (separate issue).
- Any new dedicated preview pane or full-page edit viewer — the page grid is sufficient.
- Renaming the underlying `splitPdf.ts` service or `splitPoints` data model (internal naming is not user-visible; defer to a refactor pass).

## Open Questions

- None.
