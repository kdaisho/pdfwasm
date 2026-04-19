---
description: "Task list for KDA-27: Allow Deleting Pages in Split Mode"
---

# Tasks: Allow Deleting Pages in Split Mode

**Input**: Design documents from `specs/001-delete-pages-split/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/splitPdf.md

**Tests**: Not requested. No test tasks generated. Manual verification via `quickstart.md`.

**Organization**: Tasks grouped by user story. Within each story, tasks are listed in execution order. `[P]` marks tasks that touch different files and can run in parallel.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks).
- **[Story]**: `[US1]`, `[US2]`, `[US3]` for story-scoped tasks; omitted for Setup / Foundational / Polish.
- Each description includes the exact file path to edit.

## Path Conventions

Web app monorepo. All edited files live under `apps/web/src/lib/`. Only two files are touched by this feature. See `plan.md` → _Source Code_.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm environment. No new files or dependencies are required.

- [x] T001 Verify checked out on branch `KDA-27/allow-deleting-pages-in-split-mode` (run `git branch --show-current`).
- [x] T002 Verify baseline quality gates pass before edits: run `pnpm --filter @pdfwasm/web check` and `pnpm --filter @pdfwasm/web lint` from repo root; both MUST report 0 errors.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Introduce the single piece of shared state that every user story depends on. Without this, neither the export filter (US1), the visual cues (US2), nor the reset effect (US3) have anything to read from.

**CRITICAL**: Finish Phase 2 before starting any user-story phase.

- [x] T003 Declare `deletedPages: Set<number> = $state(new Set())` in `apps/web/src/lib/components/PdfViewer.svelte` immediately after the existing `splitPoints` declaration (around line 32). Keep the same shape as `splitPoints` for symmetry.
- [x] T004 Add `toggleDeletedPage(pageIndex: number)` function in `apps/web/src/lib/components/PdfViewer.svelte`, placed adjacent to the existing `toggleSplitPoint` (around line 125). Use the clone-and-reassign pattern from `research.md` decision 2, including the `svelte/prefer-svelte-reactivity` eslint-disable comment used beside `splitPoints`.

**Checkpoint**: Foundation ready — all three user-story phases can proceed.

---

## Phase 3: User Story 1 — Exclude unwanted pages from split export (Priority: P1) 🎯 MVP

**Goal**: Users can mark pages as excluded and export segments with those pages omitted. The exporter drops any segment whose pages are all excluded. Export is blocked when every page is excluded (FR-009).

**Independent Test**: Load a multi-page PDF, enter split mode, set one split point, mark ≥1 page for exclusion, click Export, and verify the downloaded files omit exactly the marked pages. See `quickstart.md` § 4 → User Story 1.

### Implementation for User Story 1

- [x] T005 [P] [US1] In `apps/web/src/lib/services/splitPdf.ts`, extend the `splitPdf` signature to `splitPdf(pdfBytes: Uint8Array, splitPoints: number[], excludedPages?: number[]): Promise<Uint8Array[]>`. Default `excludedPages` to `[]` inside the function body.
- [x] T006 [P] [US1] In `apps/web/src/lib/services/splitPdf.ts`, implement the two contract rules from `contracts/splitPdf.md`: (a) filter excluded indices out of each segment's `indices` array before `copyPages`; (b) skip any segment whose filtered indices are empty (drop from the `ranges` loop so no empty PDF is pushed onto `results`). Update the JSDoc comment on `splitPdf` to document `excludedPages` only (no `what`-comments; constitution V).
- [x] T007 [US1] In `apps/web/src/lib/components/PdfViewer.svelte`, update `doExport` (around line 136) to pass `[...deletedPages]` as the third argument to `splitPdf`.
- [x] T008 [US1] In `apps/web/src/lib/components/PdfViewer.svelte`, add a `$derived` `effectivePageCount = pages.length - deletedPages.size`. Place it next to the existing `groupCount` derivation (around line 78).
- [x] T009 [US1] In `apps/web/src/lib/components/PdfViewer.svelte`, add the FR-009 guard to both `handleExport` and `doExport`: short-circuit with no action when `effectivePageCount === 0`. Add a `disabled` binding on the Export button (around line 277) that is truthy when `exporting`, `splitPoints.size === 0`, OR `effectivePageCount === 0`.
- [x] T010 [US1] In `apps/web/src/lib/components/PdfViewer.svelte`, render an × toggle button inside each thumbnail wrapper (in the `{#each pages}` block around line 290). Wire its `onclick` to `toggleDeletedPage(page.index)`. For this story, a minimally-styled button using a Tailwind utility positioning class (`absolute top-1 right-1`) is sufficient — visual polish (hover-reveal, dimming) is US2.

**Checkpoint**: US1 functionally complete. Before moving on: manually walk `quickstart.md` § 4 → User Story 1 rows 1.1–1.5 and confirm each passes. This is the MVP.

---

## Phase 4: User Story 2 — Visual distinction and live count for excluded pages (Priority: P2)

**Goal**: Excluded pages are visually obvious (dimmed + strikethrough), the × button follows the hover-reveal pattern of the split gutter, the status bar shows a live summary including exclusion count and real file count, and the FR-009 warning renders inline when every page is excluded.

**Independent Test**: Toggle exclusions and verify: dimming + strikethrough appear per-page, × stays visible on already-excluded pages, status bar numbers change live, and the warning renders when all pages are excluded. See `quickstart.md` § 4 → User Story 2 and Edge Case rows.

### Implementation for User Story 2

- [x] T011 [US2] In `apps/web/src/lib/components/PdfViewer.svelte`, conditionally apply `opacity-40` on the thumbnail wrapper (the `div` around line 300) when `deletedPages.has(page.index)`. Use Svelte's `class:` directive.
- [x] T012 [US2] In `apps/web/src/lib/components/PdfViewer.svelte`, conditionally apply `line-through` on the page-number label (around line 333) when `deletedPages.has(page.index)`. Use Svelte's `class:` directive.
- [x] T013 [US2] In `apps/web/src/lib/components/PdfViewer.svelte`, apply the hover-reveal pattern from the existing split gutter (`group` + `group-hover:opacity-100` / `opacity-0`) to the × button added in T010. Override to always-visible when the page is already excluded so the user can always toggle back. Ensure the thumbnail wrapper gets the `group` class so `group-hover` works on the nested button.
- [x] T014 [US2] In `apps/web/src/lib/components/PdfViewer.svelte`, replace the existing status summary (the `<span>` showing `{splitPoints.size} split point(s) → {splitPoints.size + 1} files` around line 269) with a live summary that reflects exclusions: split-point count, real file count (derive from the same non-empty-segment rule as `splitPdf`, OR call a small pure helper derived from `splitPoints` + `deletedPages` + `pages.length`), and excluded-page count when non-zero. Keep it a single compact line to match existing split-bar styling.
- [x] T015 [US2] In `apps/web/src/lib/components/PdfViewer.svelte`, render a compact inline warning near the Export button (inside the split-mode header around line 252) when `effectivePageCount === 0`. Use Skeleton/Tailwind warning classes consistent with the existing `bg-warning-100-900` header. The warning text states that every page is currently excluded and export is blocked until one is unmarked.

**Checkpoint**: US2 complete. Walk `quickstart.md` § 4 → User Story 2 rows 2.1–2.3 and the Edge Case rows E.1–E.2; all should pass.

---

## Phase 5: User Story 3 — Exclusion state resets when leaving split mode (Priority: P3)

**Goal**: No exclusion state survives an exit from split mode. Re-entering split mode always starts from zero exclusions.

**Independent Test**: Mark pages, exit split mode, re-enter split mode, verify zero pages marked. See `quickstart.md` § 4 → User Story 3.

### Implementation for User Story 3

- [x] T016 [US3] In `apps/web/src/lib/components/PdfViewer.svelte`, extend the existing split-mode-exit `$effect` (around lines 119–123 — currently resets `splitPoints`) to also reset `deletedPages = new Set()`. Do NOT introduce a second `$effect`; keep exit-reset in one place.

**Checkpoint**: US3 complete. All three user stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Prove the quality gates and run the full manual verification.

- [x] T017 Run `pnpm --filter @pdfwasm/web check` from repo root. MUST report 0 errors (constitution V).
- [x] T018 Run `pnpm --filter @pdfwasm/web lint` from repo root. MUST report 0 errors (constitution V).
- [ ] T019 Walk through every row of `specs/001-delete-pages-split/quickstart.md` § 4 (User Story 1, 2, 3 tables + Edge Case) in a real browser. Every row must match its expected outcome.
- [x] T020 [P] Re-read the `<style>` block in `apps/web/src/lib/components/PdfViewer.svelte` — confirm no new rules were added, or that any additions fall into one of the three exceptions in constitution II (`:global()`, `@keyframes`, or something Tailwind genuinely cannot express) AND have blank-line separation.
- [x] T021 [P] Confirm no new dependencies were added (`git diff main -- apps/web/package.json` should be empty). No Vite config changes (`git diff main -- apps/web/vite.config.ts` should be empty).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies.
- **Phase 2 (Foundational)**: Depends on Phase 1. BLOCKS all user-story phases.
- **Phase 3 (US1)**: Depends on Phase 2. Independent of US2 and US3 at the code level (they don't share lines).
- **Phase 4 (US2)**: Depends on Phase 2. The status-bar rewrite (T014) reads `effectivePageCount` added in T008, so US2 is cleaner if US1's T008 is in place first — but the two phases can in principle be interleaved.
- **Phase 5 (US3)**: Depends on Phase 2 only. Trivial one-task phase.
- **Phase 6 (Polish)**: Depends on all user-story phases that ship in this PR.

### Within User Story 1

T005 and T006 both touch `splitPdf.ts` and are marked `[P]` because they can be drafted in parallel mentally but must be applied in the same file edit. Practically: combine them into one `splitPdf.ts` commit. T007–T010 all touch `PdfViewer.svelte` and serialize.

### Within User Story 2

T011–T015 all touch `PdfViewer.svelte`. They serialize. None are `[P]`.

### Parallel Opportunities

This feature is small; parallelism is limited. Realistic opportunities:

- T005/T006 (`splitPdf.ts`) can be done in parallel with T003/T004 (`PdfViewer.svelte` state/toggle), since they touch different files. If a second developer exists, they can take `splitPdf.ts` while the first adds state to `PdfViewer.svelte`.
- T020 and T021 (polish checks) are independent of each other.

---

## Parallel Example: Foundational + splitPdf.ts work (two developers)

```bash
# Developer A — PdfViewer.svelte state:
Task: T003 Declare deletedPages state in apps/web/src/lib/components/PdfViewer.svelte
Task: T004 Add toggleDeletedPage in apps/web/src/lib/components/PdfViewer.svelte

# Developer B — splitPdf.ts contract change:
Task: T005 Extend splitPdf signature in apps/web/src/lib/services/splitPdf.ts
Task: T006 Implement exclusion filter + drop-empty in apps/web/src/lib/services/splitPdf.ts
```

---

## Implementation Strategy

### MVP-First (recommended)

1. **Phase 1 → Phase 2**: Confirm environment, add state + toggle.
2. **Phase 3 (US1)**: Ship the export-filter MVP. At this point the feature works end-to-end but looks rough.
3. **Stop and validate** against `quickstart.md` § 4 → User Story 1. This is the minimum merge-worthy state if time is tight.
4. **Phase 4 (US2)**: Add visual polish.
5. **Phase 5 (US3)**: Add reset effect.
6. **Phase 6**: Run quality gates and full manual QA.
7. Open PR with `Closes KDA-27` (Linear auto-closes on merge).

### Single-PR Alternative

Since the feature is small (~60–80 lines touched total across 2 files) and the constitution discourages speculative splits, merging all phases in one PR is appropriate. Do not artificially split this into multiple PRs.

---

## Notes

- `[P]` tasks = different files, no dependencies — see per-phase notes above; most tasks here serialize because they all touch `PdfViewer.svelte`.
- `[Story]` label on every user-story task maps to `spec.md` user stories for traceability.
- Commit after each user-story phase completes, using the `KDA-27: <summary>` message pattern already established on this branch.
- No tests were requested; manual verification lives in `quickstart.md`.
- Avoid: adding `<style>` rules (constitution II), bundling unrelated refactors (constitution V), touching `PdfPage.svelte` (plan explicitly keeps it oblivious).
