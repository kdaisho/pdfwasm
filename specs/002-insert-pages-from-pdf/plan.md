# Implementation Plan: Insert Pages from Another PDF in Split Mode

**Branch**: `KDA-28/allow-inserting-pages-from-another-pdf-in-split-mode` | **Date**: 2026-04-20 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/002-insert-pages-from-pdf/spec.md`

## Summary

Extend split mode so users can insert one or more pages from a secondary PDF at a chosen anchor in the primary grid, preview and select them in a modal, and export the assembled result. This requires a refactor of split-mode state from the "original page index" world used by KDA-27 to a **combined sequence** of `PageRef = { kind: 'original', index } | { kind: 'inserted', sourceId, sourcePageIndex }`. Split points and page deletions then operate on **sequence positions**, not page indices. The exporter (`splitPdf`) accepts a sequence plus a map of `sourceId → bytes` and uses `copyPages` across multiple `PDFDocument`s to assemble each segment. A new modal (`InsertPagesModal.svelte`) drives the file-pick → thumbnail grid → multi-select → confirm flow; inserted pages render via a per-page `sourceId → PDFiumDocument` resolver. All secondary sources are destroyed on split-mode exit.

## Technical Context

**Language/Version**: TypeScript 5.x, Svelte 5 (runes)
**Primary Dependencies**: SvelteKit, Svelte 5, Tailwind CSS, Skeleton UI toolkit, `@hyzyla/pdfium` (rendering, already present), `pdf-lib` (export, already present)
**Storage**: In-memory only. Secondary PDF bytes and their PDFium document handles are held for the duration of the split-mode session and freed when the user exits split mode. No persistence, no server round-trips.
**Testing**: Manual browser verification against the acceptance scenarios in `spec.md` and the steps in `quickstart.md`. The repo has no automated UI test suite for `PdfViewer.svelte`; no new test infrastructure is introduced by this feature.
**Target Platform**: Modern evergreen browsers (same as `apps/web`).
**Project Type**: Web application in a pnpm monorepo (`apps/web`, `apps/api`, `packages/*`). Only `apps/web` is touched.
**Performance Goals**: (a) Toggling a thumbnail selection inside the modal must feel instant (<16 ms) up to ~200 pages in the secondary PDF. (b) Inserting pages and re-rendering the primary grid must finish within ~500 ms for a 50-page primary + 20 inserted pages on a typical dev machine. (c) Size-warning decision for secondary PDFs triggers at ~100 MB (FR-017, SC).
**Constraints**: Must NOT re-render the primary grid's original-page canvases on insert/delete/split-point toggles — canvas renders are expensive and orthogonal. Inserted pages DO render their own canvas (unavoidable) but only once, on insert. No new dependencies. No changes to PDFium init, Wasm loading, or the coordinate-conversion formula. Constitution I is untouched (PDFium-only, no DOM text layer, no browser-derived geometry).
**Scale/Scope**: Touches three files in `apps/web/src/lib` (viewer, services, thumbnail component) plus one new modal. Estimated touched/added lines: ~250–350. The split-state refactor from "page indices" to "sequence positions" is the riskiest slice.

## Constitution Check

Gates are mapped to the five Core Principles in `.specify/memory/constitution.md` (v1.0.0).

| Principle                                                           | Gate                                                                                                                                                                                                                                                                                                                                                                                               | Status  | Notes                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **I. PDFium-Only Rendering & Anti-Drift Highlighting**              | No PDF.js or DOM text layer added; no browser-derived geometry; no change to character-box extraction or coordinate conversion. Secondary PDFs are loaded via the same `getPdfiumLibrary()` singleton and rendered to `<canvas>` through the same PDFium bitmap path as the primary document.                                                                                                      | ✅ Pass | Feature adds inserted-page rendering but reuses the existing PDFium render path in `PdfPage.svelte`. No highlight or search-layer interaction; `charBoxes` extraction is not run on inserted pages (search is an open follow-up, out of scope here).                     |
| **II. Frontend Stack (SvelteKit + Svelte 5 + Tailwind + Skeleton)** | Styling is Tailwind-first. `<style>` additions (if any) fall into the three allowed categories. Svelte 5 runes only in `.svelte` / `.svelte.ts`. New state and derivations follow the existing `$state` / `$derived` / `$effect` patterns. Rule blocks in any new `<style>` are separated by a blank line.                                                                                         | ✅ Pass | All new UI (modal, source badge, "insert here" gutter target, size-warning dialog) maps to Tailwind utilities and Skeleton components (`Modal`, `Button`, `Alert`). No new `<style>` rules expected in the modal; the viewer's existing `<style>` block is not modified. |
| **III. Session-Based Auth (NON-NEGOTIABLE)**                        | No auth surface touched. The existing export auth gate (`handleExport` → `AuthModal`) is preserved unchanged; insert-pages does not add any network calls that would need `credentials: 'include'`.                                                                                                                                                                                                | ✅ Pass | Secondary PDFs are read from the user's device (`File.arrayBuffer()`) — nothing leaves the browser. No cookie, session, or OTP touched.                                                                                                                                  |
| **IV. Tooling & Workflow Discipline**                               | No package-manager change. No Vite config change. Branch name follows Linear convention. No change to `optimizeDeps.exclude` or Wasm plugins.                                                                                                                                                                                                                                                      | ✅ Pass | Branch is `KDA-28/allow-inserting-pages-from-another-pdf-in-split-mode`. No dependency additions. `vite.config.ts` untouched.                                                                                                                                            |
| **V. Code Quality Gates**                                           | `tsc` must remain at 0 errors (server + frontend). ESLint v9 flat config must pass. Prefer editing existing files; one new file (`InsertPagesModal.svelte`) is justified because split-mode UI is already at the edge of `PdfViewer.svelte`'s comfortable size. No speculative abstractions. No `what`-comments. `(as any)` confined to PDFium internal-field access (per constitution carve-out). | ✅ Pass | The new modal is one component; the service and component files are edited in place. `splitPdf`'s signature changes in a breaking way but has exactly one caller (`PdfViewer.svelte#doExport`), updated in the same PR. No transitional shim.                            |

**Result**: All gates pass with no justified violations. **Complexity Tracking section omitted.**

## Project Structure

### Documentation (this feature)

```text
specs/002-insert-pages-from-pdf/
├── plan.md                  # This file (/speckit.plan command output)
├── spec.md                  # /speckit.specify output (clarified 2026-04-20)
├── research.md              # Phase 0 output (/speckit.plan)
├── data-model.md            # Phase 1 output (/speckit.plan)
├── quickstart.md            # Phase 1 output (/speckit.plan)
├── contracts/
│   ├── splitPdf.md          # Phase 1 output — updated signature + behavior for multi-source export
│   └── insertPages.md       # Phase 1 output — modal interaction contract
├── checklists/
│   └── requirements.md      # /speckit.specify output
└── tasks.md                 # /speckit.tasks output (NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
apps/web/src/lib/
├── components/
│   ├── PdfViewer.svelte                 # EDIT — refactor splitPoints / deletedPages to
│   │                                    # sequence positions; add sources + insertedPages
│   │                                    # state; combinedSequence $derived; "Insert pages"
│   │                                    # toolbar button; gutter "Insert here" targets;
│   │                                    # source-badge rendering on inserted pages; cleanup
│   │                                    # of PDFium docs on split-mode exit.
│   ├── PdfPage.svelte                   # EDIT — accept an optional `doc` override so inserted
│   │                                    # pages render from their secondary PDFiumDocument
│   │                                    # instead of the primary doc.
│   └── InsertPagesModal.svelte          # NEW — file picker → thumbnail grid → multi-select
│                                        # → confirm flow; size-warning confirm; invalid-PDF
│                                        # error surface; returns the set of selected
│                                        # source-page indices on confirm.
└── services/
    └── splitPdf.ts                      # EDIT — new signature: accepts a combined sequence
                                         # (SourceId, PageIndex pairs) + a sources map
                                         # (sourceId → Uint8Array), replaces the old
                                         # per-index semantics. `computeSegmentPageIndices`
                                         # becomes `computeSegmentPositions` operating on
                                         # sequence positions.
```

**Structure Decision**: Monorepo already established. This feature is a localized edit inside `apps/web`, one new component, no new dependencies, no routing or server changes. The only cross-cutting change is the **split-state refactor from page indices to sequence positions**, which is confined to `PdfViewer.svelte` + `splitPdf.ts` because there is exactly one caller of each. `PdfPage.svelte` is touched minimally (per-page `doc` override) so that it stays oblivious to whether a page is original or inserted.

## Phase 0 — Research

See [research.md](./research.md). All clarifications from the spec (multi-select order, source identity on repeat upload, large-file handling, reuse of loaded sources, single vs. multi-file picker) are resolved. The research phase records the implementation-level decisions that remain:

1. Combined-sequence data representation (`PageRef[]`, tagged union).
2. Split-state semantics shift: `splitPoints` / `deletedPages` as **sequence positions**, not page indices.
3. Multi-document exporter: how `pdf-lib`'s `copyPages` composes across source `PDFDocument`s.
4. How `PdfPage.svelte` chooses its PDFium document (primary vs. secondary) without learning about "insertion".
5. Secondary-PDF lifecycle: loading, size-warning threshold, destruction on split-mode exit and on modal cancel.
6. Source identity: opaque ULID/UUID per upload invocation (consistent with the "distinct per upload" clarification).
7. Modal UX and Skeleton component choices (`Modal`, `Button`, selection-state styling via Tailwind).

## Phase 1 — Design & Contracts

See:

- [data-model.md](./data-model.md) — `Source PDF`, `Inserted Page Reference`, and `Combined Page Sequence` as in-memory entities; split-state now keyed by sequence position; invariants and cleanup rules.
- [contracts/splitPdf.md](./contracts/splitPdf.md) — new signature `splitPdf({ sources, sequence, splitPoints, excludedPositions })`, segment computation rules, empty-segment drop semantics, cross-document `copyPages` contract.
- [contracts/insertPages.md](./contracts/insertPages.md) — `InsertPagesModal` interaction contract: props, events, error surfaces (invalid/password-protected PDF, size warning), confirm payload shape.
- [quickstart.md](./quickstart.md) — developer walkthrough that manually verifies every acceptance scenario in the spec, including the cross-feature interactions with split points and page deletion.

### Post-Design Constitution Re-check

Re-evaluated after drafting the data model, contracts, and quickstart:

- **I.** Unchanged. Inserted pages render through the same PDFium bitmap path as the primary doc. No text layer, no browser-derived geometry. `charBoxes` / search on inserted pages is explicitly out of scope here (it is also not claimed by any acceptance scenario).
- **II.** Confirmed: modal uses Skeleton's `Modal` + `Button`; selection state, hover affordances, source badge, and "insert here" gutter buttons are expressible as Tailwind utilities (`ring-2`, `ring-primary-500`, `opacity-*`, `absolute`, `bg-surface-50/90`, `text-xs`). No new `<style>` rules planned.
- **III.** Unchanged. No auth surface or network boundary.
- **IV.** Unchanged. No dependency or tooling change.
- **V.** Confirmed: `splitPdf` has one caller, updated atomically. `PdfPage.svelte`'s new `doc` prop is optional with a default that preserves current behavior, so the component's other existing consumer paths (there is only `PdfViewer.svelte`) don't need a two-step migration. All `(as any)` use remains confined to existing PDFium internal-field access — the insert path does not introduce new `as any` uses.

All gates still pass. No violations introduced by design.

### Agent Context Update

Running `.specify/scripts/bash/update-agent-context.sh claude` is **not required** for this feature. No new technology is introduced — PDFium, `pdf-lib`, Svelte 5, and Tailwind are all already documented in `CLAUDE.md`. The feature-specific knowledge (combined-sequence model, split-state position semantics, multi-source export contract, secondary-doc lifecycle) is captured here in the plan and contracts, which is the right place — not global agent context that would bloat `CLAUDE.md`. Skipping this step keeps `CLAUDE.md` lean, consistent with how KDA-27 was handled.

## Complexity Tracking

_Not applicable — Constitution Check passes with no justified violations._
