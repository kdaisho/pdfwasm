# Implementation Plan: Allow Deleting Pages in Split Mode

**Branch**: `KDA-27/allow-deleting-pages-in-split-mode` | **Date**: 2026-04-19 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/001-delete-pages-split/spec.md`

## Summary

Extend split mode so users can mark individual pages as excluded from export. Exclusions live alongside the existing `splitPoints` state as a parallel `deletedPages: Set<number>`. The export path (`splitPdf`) accepts an `excludedPages` parameter and filters those indices out of each segment's page range, dropping any segment that becomes empty. The thumbnail grid visually dims excluded pages; the status bar reflects exclusion count and resulting file count; export is blocked with a warning when every page is excluded.

## Technical Context

**Language/Version**: TypeScript 5.x, Svelte 5 (runes)
**Primary Dependencies**: SvelteKit, Svelte 5, Tailwind CSS, Skeleton UI toolkit, `pdf-lib` (already used by `splitPdf`), `@hyzyla/pdfium` (rendering — not touched by this feature)
**Storage**: In-memory only (transient per-session state). No persistence.
**Testing**: Manual browser verification against the acceptance scenarios in `spec.md`. The repo has no automated UI test suite for `PdfViewer.svelte` today; no new test infrastructure is introduced by this feature.
**Target Platform**: Modern evergreen browsers (same as the rest of `apps/web`).
**Project Type**: Web application (pnpm monorepo: `apps/web`, `apps/api`, `packages/*`). Only `apps/web` is touched.
**Performance Goals**: Toggling an exclusion must feel instant (< 16 ms) on documents up to 500 pages — i.e. no re-render of any page canvas, only state and CSS class updates on the thumbnail wrapper.
**Constraints**: Must not re-render page canvases on exclusion toggle (rendering is expensive and orthogonal to this feature). No new dependencies. No changes to PDFium or the rendering pipeline.
**Scale/Scope**: Single component (`PdfViewer.svelte`) plus one service function (`splitPdf`). Estimated touched lines: ~60–80.

## Constitution Check

Gates are mapped to the five Core Principles in `.specify/memory/constitution.md` (v1.0.0).

| Principle                                                           | Gate                                                                                                                                                                                                                                                                                                                         | Status                             | Notes                                                                                                                                                                                                      |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **I. PDFium-Only Rendering & Anti-Drift Highlighting**              | No PDF.js or DOM text layer added; no browser-derived geometry; no change to character-box or coordinate-conversion code.                                                                                                                                                                                                    | ✅ Pass                            | Feature is orthogonal to rendering/highlighting. `deletedPages` is a Set of page indices; no coordinates involved.                                                                                         |
| **II. Frontend Stack (SvelteKit + Svelte 5 + Tailwind + Skeleton)** | Styling is Tailwind-first. `<style>` additions (if any) fall into the three allowed categories. Svelte 5 runes only in `.svelte` / `.svelte.ts`. Existing `PdfViewer.svelte` already uses `$state`, `$derived`, `$effect` — new state follows the same pattern. Any new `<style>` rule blocks are separated by a blank line. | ✅ Pass                            | All new visuals (dimmed thumbnail, strikethrough, disabled button state) expressible as Tailwind utilities (`opacity-40`, `line-through`, `disabled:*`). No new `<style>` rules expected.                  |
| **III. Session-Based Auth (NON-NEGOTIABLE)**                        | No auth surface touched.                                                                                                                                                                                                                                                                                                     | ✅ Pass                            | The existing `handleExport` auth gate is preserved unchanged.                                                                                                                                              |
| **IV. Tooling & Workflow Discipline**                               | No package-manager change. No Vite config change. Branch name follows Linear convention.                                                                                                                                                                                                                                     | ✅ Pass                            | Branch is `KDA-27/allow-deleting-pages-in-split-mode`. No dependency additions.                                                                                                                            |
| **V. Code Quality Gates**                                           | `tsc` must remain at 0 errors (server + frontend). ESLint (flat v9) must pass. Prefer editing existing files. No speculative abstractions. No `what`-comments.                                                                                                                                                               | ✅ Pass (to be verified post-impl) | `splitPdf` signature changes from `(bytes, splitPoints)` → `(bytes, splitPoints, excludedPages?)` with optional third arg so no caller outside this feature is affected. All edits land in existing files. |

**Result**: All gates pass with no violations. **Complexity Tracking section omitted.**

## Project Structure

### Documentation (this feature)

```text
specs/001-delete-pages-split/
├── plan.md                  # This file (/speckit.plan command output)
├── spec.md                  # /speckit.specify output
├── research.md              # Phase 0 output (/speckit.plan command)
├── data-model.md            # Phase 1 output (/speckit.plan command)
├── quickstart.md            # Phase 1 output (/speckit.plan command)
├── contracts/
│   └── splitPdf.md          # Phase 1 output — signature + behavior contract for the exported function
├── checklists/
│   └── requirements.md      # /speckit.specify output
└── tasks.md                 # Phase 2 output (/speckit.tasks command — NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
apps/web/src/lib/
├── components/
│   └── PdfViewer.svelte     # EDIT — add deletedPages state, toggle fn, reset effect,
│                            # per-thumbnail × button + dimmed state, status-bar
│                            # summary update, all-excluded export guard (FR-009)
└── services/
    └── splitPdf.ts          # EDIT — add excludedPages?: number[] param; filter indices
                             # from each segment's range; drop empty segments
```

**Structure Decision**: Monorepo already established. This feature is a localized, two-file edit inside `apps/web`. No new files, no new dependencies, no structural changes. `PdfPage.svelte` is intentionally **not** modified — dimming is applied at the thumbnail wrapper in `PdfViewer.svelte` so the page renderer stays oblivious to the exclusion concept.

## Phase 0 — Research

See [research.md](./research.md). All `[NEEDS CLARIFICATION]` markers from the spec are resolved (the all-pages-excluded edge case was closed as "block export with warning" — now codified as FR-009). The research phase documents three implementation-level decisions with no spec-level impact:

1. State shape for exclusions (`Set<number>` of page indices, mirroring existing `splitPoints`).
2. Svelte 5 reactivity pattern for `Set` mutations (clone-and-reassign, matching existing `toggleSplitPoint`).
3. Visual state strategy (conditional Tailwind classes on existing thumbnail wrapper; no new `<style>` rules).

## Phase 1 — Design & Contracts

See:

- [data-model.md](./data-model.md) — describes the `Excluded Page Set` entity, its invariants, and its relationship to `splitPoints` and `pageGroupMap`.
- [contracts/splitPdf.md](./contracts/splitPdf.md) — the function signature change and documented behavior for `splitPdf(pdfBytes, splitPoints, excludedPages?)`, including empty-segment drop semantics.
- [quickstart.md](./quickstart.md) — how a developer runs the app locally and manually verifies each acceptance scenario.

### Post-Design Constitution Re-check

Re-evaluated after drafting the data model, contract, and quickstart:

- **I.** Unchanged. No rendering-pipeline contact.
- **II.** Confirmed: all proposed UI states map to Tailwind utilities (`opacity-40`, `line-through`, `cursor-not-allowed`, `disabled:*`, `hover:*`). The × button reuses the same hover-reveal pattern already in place for the split gutter — no new CSS rules, no new `<style>` blocks.
- **III.** Unchanged.
- **IV.** Unchanged.
- **V.** Confirmed: `splitPdf`'s `excludedPages` param is **optional** (`number[]` with a default of `[]`). The sole current caller (`PdfViewer.svelte#doExport`) is updated in the same PR as the signature change, so no transitional shim is required.

All gates still pass. No violations introduced by design.

### Agent Context Update

Running `.specify/scripts/bash/update-agent-context.sh claude` is not required for this feature: no new technology is introduced, CLAUDE.md already documents the relevant stack, and the feature-specific guidance (Excluded Page Set invariants, export guard) lives here in the plan and contracts — not something future Claude sessions should carry globally. Skipping this step keeps CLAUDE.md lean.

## Complexity Tracking

_Not applicable — Constitution Check passes with no justified violations._
