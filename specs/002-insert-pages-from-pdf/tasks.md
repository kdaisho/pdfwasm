---
description: "Task list for KDA-28: Insert Pages from Another PDF in Split Mode"
---

# Tasks: Insert Pages from Another PDF in Split Mode

**Input**: Design documents from `specs/002-insert-pages-from-pdf/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/splitPdf.md, contracts/insertPages.md

**Tests**: Not requested. No test tasks generated. Manual verification per the acceptance scenarios in `spec.md` and the contract acceptance table in `contracts/splitPdf.md`.

**Organization**: Tasks grouped by user story. Within each story, tasks are listed in execution order. `[P]` marks tasks that touch different files and can run in parallel. `[Story]` labels tie tasks to `spec.md` user stories.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks).
- **[Story]**: `[US1]`–`[US5]` for story-scoped tasks; omitted for Setup / Foundational / Polish.
- Each description includes the exact file path to edit.

## Path Conventions

Web app monorepo. All edited / added files live under `apps/web/src/lib/`. This feature touches four files (three edits, one new). See `plan.md` → _Source Code_.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm environment. No new dependencies.

- [x] T001 Verify checked out on branch `KDA-28/allow-inserting-pages-from-another-pdf-in-split-mode` (run `git branch --show-current`).
- [x] T002 Verify baseline quality gates pass before edits: run `pnpm --filter @pdfwasm/web check` and `pnpm --filter @pdfwasm/web lint` from repo root; both MUST report 0 errors.
- [x] T003 Verify KDA-27 has landed on this branch: `specs/001-delete-pages-split/` exists and `apps/web/src/lib/components/PdfViewer.svelte` already declares `deletedPages: Set<number>` (foundation for the sequence-position refactor). If not, stop and rebase on main.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Introduce the combined-sequence model and migrate split/delete state from "original page indices" to "sequence positions". Switch the exporter to the multi-source signature. Every user story depends on this refactor — US1 cannot insert without a sequence, and US4 is precisely the claim that split/delete still work after the refactor.

**CRITICAL**: Finish Phase 2 before starting any user-story phase. At the end of Phase 2, behavior is **observably unchanged** (no insertion UI yet), but the viewer internally operates on positions and the exporter accepts the new shape.

### Exporter refactor (`splitPdf.ts`)

- [x] T004 [P] In `apps/web/src/lib/services/splitPdf.ts`, export a new interface `SequenceEntry { sourceId: string; pageIndex: number }` at the top of the file. Per `contracts/splitPdf.md` §After.
- [x] T005 [P] In `apps/web/src/lib/services/splitPdf.ts`, rename `computeSegmentPageIndices` → `computeSegmentPositions(sequenceLength, splitPoints, excludedPositions = [])`. Semantics are identical — the parameter is still "length / cut positions / excluded indices" — only the name and the first parameter's meaning change from "total original pages" to "combined sequence length". Per `contracts/splitPdf.md` §After.
- [x] T006 [P] In `apps/web/src/lib/services/splitPdf.ts`, replace the existing `splitPdf(pdfBytes, splitPoints, excludedPages?)` with `splitPdf({ sources, sequence, splitPoints, excludedPositions? }): Promise<Uint8Array[]>`. Load each distinct `sourceId` exactly once via a local `ensureLoaded(id)` memo (`Map<string, PDFDocument>`) and copy pages with `out.copyPages(srcDoc, [entry.pageIndex])` in sequence-position order. Preserve the "drop empty segments" rule from KDA-27. Per `contracts/splitPdf.md` Rules 1–5.
- [x] T007 [P] In `apps/web/src/lib/services/splitPdf.ts`, keep `downloadSplitPdfs(segments)` untouched in signature and behavior (contract Rule 4).

### Viewer migration — sequence model (`PdfViewer.svelte`)

- [x] T008 [US4] In `apps/web/src/lib/components/PdfViewer.svelte`, declare the sequence primitives at the top of the `<script>` block (alongside the existing `splitPoints`, `deletedPages`):

    ```ts
    interface SourcePdf {
    	id: string;
    	name: string;
    	bytes: Uint8Array;
    	doc: PDFiumDocument;
    	pageCount: number;
    }
    interface InsertedPage {
    	sourceId: string;
    	sourcePageIndex: number;
    	insertionAnchor: number;
    }
    type PageRef =
    	| { kind: "original"; index: number }
    	| { kind: "inserted"; sourceId: string; sourcePageIndex: number };

    let sources: SourcePdf[] = $state([]);
    let insertedPages: InsertedPage[] = $state([]);
    ```

    Per `data-model.md` §Entity: Source PDF + §Inserted Page Reference.

- [x] T009 [US4] In `apps/web/src/lib/components/PdfViewer.svelte`, add a local pure function `buildSequence(pages, insertedPages): PageRef[]` implementing the algorithm in `data-model.md` §Derived Entity: Combined Page Sequence (group by `insertionAnchor`, iterate positions `0..pages.length`, interleave). Place it near the top of the `<script>` block above the `$derived` declarations.
- [x] T010 [US4] In `apps/web/src/lib/components/PdfViewer.svelte`, add `let combinedSequence = $derived(buildSequence(pages, insertedPages));` next to the existing `groupCount` derivation.
- [x] T011 [US4] In `apps/web/src/lib/components/PdfViewer.svelte`, migrate **all reads of `page.index` as a split/delete key** in the gutter / toggle / render blocks (around lines 260–360) to use the **sequence position** from the render loop instead. Change the render loop to `{#each combinedSequence as ref, position (position)}` (use `position` as the key for stable reconciliation); compute `page = ref.kind === 'original' ? pages[ref.index] : getInsertedPageData(ref)` — the helper is added in T028 when inserted rendering lands. For Phase 2 only, guard the `ref.kind === 'inserted'` branch with a TODO that throws; `insertedPages` is empty at this point so it is unreachable.
- [x] T012 [US4] In `apps/web/src/lib/components/PdfViewer.svelte`, update `toggleSplitPoint` to accept a **sequence position** parameter (renaming the param to `position` for clarity) and continue to operate on `splitPoints`. Call sites in the render loop pass `position` instead of `page.index`.
- [x] T013 [US4] In `apps/web/src/lib/components/PdfViewer.svelte`, update `toggleDeletedPage` (from KDA-27) to accept a **sequence position** parameter. Call sites pass `position`. Semantics shift from "original page index" to "sequence position" per `data-model.md` §Updated entity: deletedPages.
- [x] T014 [US4] In `apps/web/src/lib/components/PdfViewer.svelte`, update `groupColorMap` / group-index derivation (around line 70) to iterate over `combinedSequence` positions instead of `pages`. A split point at position `k` still increments `groupIdx` after position `k`.
- [x] T015 [US4] In `apps/web/src/lib/components/PdfViewer.svelte`, update `effectivePageCount` (from KDA-27) to `combinedSequence.length - deletedPages.size`. Per `data-model.md` §Derived state (viewer).
- [x] T016 [US4] In `apps/web/src/lib/components/PdfViewer.svelte`, update `fileCount` / status-bar derivation to call the renamed `computeSegmentPositions(combinedSequence.length, [...splitPoints], [...deletedPages]).length`.
- [x] T017 [US4] In `apps/web/src/lib/components/PdfViewer.svelte`, rewrite `doExport` (around line 136) to build a `sources: Map<string, Uint8Array>` from `[['primary', pdfBytes], ...sources.map(s => [s.id, s.bytes])]`, build a `sequence: SequenceEntry[]` by mapping `combinedSequence.map(ref => ref.kind === 'original' ? { sourceId: 'primary', pageIndex: ref.index } : { sourceId: ref.sourceId, pageIndex: ref.sourcePageIndex })`, and invoke `splitPdf({ sources, sequence, splitPoints: [...splitPoints], excludedPositions: [...deletedPages] })`. Per `contracts/splitPdf.md` §Migration notes.
- [x] T018 [P] In `apps/web/src/lib/components/PdfPage.svelte`, add an optional `doc?: PDFiumDocument` prop that, when provided, is used instead of the existing `doc` prop for page rendering. Per `research.md` Decision 4. _(No-op: PdfPage.svelte already requires `doc: PDFiumDocument`; viewer simply passes the per-ref doc at the call site when inserts land in T028.)_

**Checkpoint**: Run `pnpm --filter @pdfwasm/web check` and `lint`. Both MUST be 0 errors. Manually verify that split mode still works end-to-end as it did in KDA-27: open a PDF, toggle split points, mark pages deleted, export — behavior is identical to pre-refactor.

---

## Phase 3: User Story 1 — Insert pages from a second PDF (Priority: P1) 🎯 MVP

**Goal**: User can open an insert-pages modal, pick a secondary PDF, select pages, choose an anchor in the primary grid, confirm, and see the pages appear inline. Export produces output with the inserted pages at the correct positions.

**Independent Test**: Open a PDF in split mode, click "Insert pages", select a secondary PDF, pick two pages, click a gutter in the primary grid as the anchor, confirm, and export. The exported segment(s) must contain the inserted pages in ascending source-page order at the chosen position.

Maps to spec.md User Story 1. Acceptance scenarios 1–3 covered below.

### InsertPagesModal (new component)

- [x] T019 [US1] Create `apps/web/src/lib/components/InsertPagesModal.svelte`. Implement the props (`open` bindable, `onconfirm`, `oncancel`) and the full internal state machine (`idle → size-check → warn-confirm | loading → select → confirmed`, `error` branch) per `contracts/insertPages.md` §Internal state machine. Use Skeleton's `Modal` component for focus trap + ARIA; use Skeleton's `Alert` for size warning and invalid-PDF error. Single-file `<input type="file" accept="application/pdf">` — no `multiple` attribute. Tailwind-first styling; no new `<style>` rules unless they fall under the three allowed categories (constitution II).
- [x] T020 [US1] In `apps/web/src/lib/components/InsertPagesModal.svelte`, inside the `select` state render a thumbnail grid of the secondary PDF's pages using the same PDFium `render({ scale, render: 'bitmap' })` path as `PdfPage.svelte` at a reduced scale (~0.25). Thumbnails are `<button>` elements (keyboard accessible). Clicking toggles page index in `selectedPageIndices: Set<number> = $state(new Set())`. Selected state uses Tailwind `ring-2 ring-primary-500 ring-offset-2`. Confirm button is disabled while `selectedPageIndices.size === 0` (FR-015). On confirm, fire `onconfirm({ sourceName: file.name, sourceBytes, sourcePageCount, selectedPageIndices: [...selectedPageIndices].sort((a, b) => a - b) })`. Per `contracts/insertPages.md` Rules 4, 6.
- [x] T021 [US1] In `apps/web/src/lib/components/InsertPagesModal.svelte`, enforce the size-warn threshold: define `const INSERT_PDF_SIZE_WARN_BYTES = 100 * 1024 * 1024;` and on file pick, if `file.size > INSERT_PDF_SIZE_WARN_BYTES`, transition to `warn-confirm` and render a Skeleton Alert with `file.name`, the size in MB, and Continue / Cancel buttons. Do NOT call `arrayBuffer()` until the user picks Continue. Per `contracts/insertPages.md` Rule 3 + `research.md` Decision 7.
- [x] T022 [US1] In `apps/web/src/lib/components/InsertPagesModal.svelte`, wrap `library.loadDocument(bytes)` in a try/catch. On throw, transition to `error` state and render a Skeleton Alert: "This file could not be opened. It may be invalid, corrupted, or password-protected." with a single "Pick another file" action that resets to `idle`. On Escape / backdrop click in any state, fire `oncancel()` and destroy the modal-local `PDFiumDocument` before unmount. Per `contracts/insertPages.md` Rules 5, 7.

### Viewer integration — trigger, anchor selection, insert commit

- [x] T023 [US1] In `apps/web/src/lib/components/PdfViewer.svelte`, import `InsertPagesModal` and add state `let insertModalOpen = $state(false)` and `let pendingInsert: ConfirmPayload | null = $state(null)` (shape from `contracts/insertPages.md` §Events). Also add `let sourceById = $derived(new Map(sources.map(s => [s.id, s])))` per `data-model.md` §Derived state (viewer).
- [x] T024 [US1] In `apps/web/src/lib/components/PdfViewer.svelte`, add an "Insert pages" button to the split-mode toolbar (around line 253, inside the `{#if splitMode}` block). Clicking sets `insertModalOpen = true`. Disabled when already in "awaiting anchor" mode (see T026).
- [x] T025 [US1] In `apps/web/src/lib/components/PdfViewer.svelte`, render `<InsertPagesModal bind:open={insertModalOpen} onconfirm={handleInsertConfirm} oncancel={handleInsertCancel} />`. Implement `handleInsertConfirm(payload)`: load a fresh `PDFiumDocument` via `getPdfiumLibrary().loadDocument(payload.sourceBytes)`, push a new `SourcePdf` onto `sources`, stash the confirmed payload + new `sourceId` into `pendingInsert`, and close the modal (`insertModalOpen = false`). Implement `handleInsertCancel`: close the modal with no state change. Per `research.md` Decision 5 + `contracts/insertPages.md` §Parent integration.
- [x] T026 [US1] In `apps/web/src/lib/components/PdfViewer.svelte`, introduce an "awaiting insertion anchor" mode derived from `pendingInsert !== null`. While in this mode: (a) gutters render as "Insert N pages here" targets instead of split toggles — on hover show the count; on click, commit the insert at that sequence position; (b) add end-anchor targets before position 0 and after position `combinedSequence.length` (FR-005 / edge case "very start or very end"); (c) pressing Escape clears `pendingInsert`, destroys the just-added `SourcePdf`'s `doc`, and pops it from `sources`. Per `research.md` Decision 9.
- [x] T027 [US1] In `apps/web/src/lib/components/PdfViewer.svelte`, implement `commitInsertAt(position: number)` invoked when a gutter is clicked in "awaiting anchor" mode: build the `InsertedPage[]` batch from `pendingInsert.selectedPageIndices` (already ascending per modal contract) with `insertionAnchor = position`, rebase existing `splitPoints` / `deletedPages` per the shift rule (any `k >= position` shifts by `+batch.length`) per `data-model.md` §Updated entity: splitPoints §Rebase on insert, append the batch to `insertedPages`, and clear `pendingInsert`.
- [x] T028 [US1] In `apps/web/src/lib/components/PdfViewer.svelte`, extend the `{#each combinedSequence}` render loop from T011 to actually render inserted pages: when `ref.kind === 'inserted'`, pass `doc={sourceById.get(ref.sourceId)!.doc}` to `<PdfPage>` (prop override from T018) and construct a minimal `PageData` for that inserted page (width / height read from the secondary PDFiumDocument's `getPage(ref.sourcePageIndex)`). Remove the TODO throw placed in T011.

**Checkpoint**: Walk spec.md User Story 1 Acceptance Scenarios 1–3 in a real browser. All three must pass. The feature is now functionally minimal end-to-end.

---

## Phase 4: User Story 4 — Split and delete behavior works on the combined document (Priority: P1)

**Goal**: Every split-mode operation that existed before insertions (placing split points, deleting pages) continues to work correctly on the combined sequence, and the export reflects the composed state.

**Independent Test**: Insert pages from a second PDF, place a split point across the boundary between original and inserted pages, mark one inserted page and one original page as deleted, export. The output must respect the split point, both deletions, and the insertion order.

Maps to spec.md User Story 4.

Most of US4 is delivered by Phase 2 (the sequence-position refactor) and T027's rebase-on-insert. The remaining tasks harden the cross-cutting paths and verify them.

- [x] T029 [US4] In `apps/web/src/lib/components/PdfViewer.svelte`, verify the group-color stripe rendering (T014) correctly groups both original and inserted positions on the same side of a split point. Adjust if a boundary split produces inconsistent coloring. No new code expected if T014 was implemented against `combinedSequence`; this task is a targeted verification with a fix-if-broken clause. _(T014 already iterates over `combinedSequence` positions; both kinds map to the same `pageGroupMap`. No additional change needed.)_
- [x] T030 [US4] In `apps/web/src/lib/components/PdfViewer.svelte`, verify that the × delete button rendered per-page (from KDA-27) operates on `position` (not `page.index`) and applies to both original and inserted pages. `deletedPages.has(position)` drives the dimmed / line-through state for either kind. Per `data-model.md` §Updated entity: deletedPages Invariant 3. _(× button uses `position` and `deletedPages.has(position)` for both kinds — confirmed via render loop in PdfViewer.svelte.)_
- [ ] T031 [US4] Manual verification: open a 3-page PDF, insert 2 pages from a secondary PDF between original page 1 and 2, place a split point between the two inserted pages, delete one inserted page and one original page, export. Confirm the resulting files match the expected composition from `contracts/splitPdf.md` §Acceptance test table (rule: excluded positions drop, splits apply on positions, inserted pages appear at anchors).

**Checkpoint**: Spec.md User Story 4 Acceptance Scenarios 1–2 pass in a browser.

---

## Phase 5: User Story 5 — Exiting split mode discards inserted content cleanly (Priority: P2)

**Goal**: Leaving split mode destroys all secondary PDFium docs, clears `sources`, `insertedPages`, and any in-flight `pendingInsert`. Re-entering split mode shows only the original document with no residual state.

**Independent Test**: Insert pages from a secondary PDF, exit split mode, re-enter split mode. No inserted pages, no source badges, no lingering split points or deletions from the inserted sequence remain.

Maps to spec.md User Story 5.

- [x] T032 [US5] In `apps/web/src/lib/components/PdfViewer.svelte`, extend the existing split-mode-exit `$effect` (the one that already clears `splitPoints` and `deletedPages` from KDA-27) to **also** (a) call `doc.destroy()` on every `SourcePdf` in `sources`, (b) reset `sources = []`, (c) reset `insertedPages = []`, (d) if `pendingInsert` is non-null, destroy its associated source and reset `pendingInsert = null`. Order: destroy handles first, then clear the reactive state. Per `data-model.md` §Source PDF Invariant 2 + §Validation rules rule 2. Do NOT introduce a second `$effect`; keep all exit-reset logic in one place.

**Checkpoint**: Spec.md User Story 5 Acceptance Scenarios 1–2 pass in a browser. In DevTools, after exiting and re-entering split mode a few times, the Wasm heap should not grow unboundedly (no leaked PDFium documents).

---

## Phase 6: User Story 2 — Combine pages from multiple secondary PDFs (Priority: P2)

**Goal**: The user can insert from a second, third, Nth secondary PDF in a single split-mode session, each insertion preserved independently.

**Independent Test**: Starting from a primary PDF in split mode, perform the insert flow twice with two different secondary PDFs at two different anchors. Verify both insertions appear at their respective positions; export correctly composes all three sources.

Maps to spec.md User Story 2.

US2 falls out of the architecture — `sources` is an array, `insertedPages` is an array, and the exporter accepts a `Map`. There is no per-source state that would have to be "reset to accept another source". The tasks here are verification plus one small UI guarantee.

- [x] T033 [US2] In `apps/web/src/lib/components/PdfViewer.svelte`, confirm that "Insert pages" button remains available after the first insert has been committed (not disabled). The only time it is disabled is while `pendingInsert !== null` (awaiting anchor for the current insert). After commit, `pendingInsert` is `null`, so the button is interactive again. _(Button uses `disabled={awaitingAnchor}` only.)_
- [ ] T034 [US2] Manual verification: perform the flow in the Independent Test above with two distinct secondary PDFs. Confirm both insertions are visible in the grid at the expected positions. Confirm the exported output composes pages from all three sources in the correct positions. Confirm FR-016 (two uploads of the same filename produce distinct entries): upload the same file twice, insert one page from each — the two inserted entries MUST render with distinct `sourceId`s (visible as two distinct source PDFs in internal state; badge labels will match — that's fine per the clarification).

**Checkpoint**: Spec.md User Story 2 Acceptance Scenarios 1–2 pass in a browser.

---

## Phase 7: User Story 3 — Recognize which pages came from which source (Priority: P3)

**Goal**: Each inserted page in the primary grid shows a visible indicator identifying its source filename, distinguishable from original pages.

**Independent Test**: After inserting pages from a secondary PDF named `appendix.pdf`, each inserted page shows a visible "from appendix.pdf" badge. With two sources, each inserted page's badge ties it to its specific source.

Maps to spec.md User Story 3.

- [x] T035 [US3] In `apps/web/src/lib/components/PdfViewer.svelte`, inside the `{#each combinedSequence}` render loop, when `ref.kind === 'inserted'` render a small badge on the thumbnail wrapper showing the source filename (stripped of `.pdf` extension). Position: Tailwind `absolute top-1 left-1`, styling consistent with the existing × delete button (Skeleton surface tokens, `text-xs`, `rounded-full`, `px-2 py-0.5`). The filename lookup uses `sourceById.get(ref.sourceId)?.name`. Per `research.md` Decision 6 + `contracts/insertPages.md` §Events note on `sourceName`.
- [x] T036 [US3] In `apps/web/src/lib/components/PdfViewer.svelte`, truncate long filenames in the badge to a sensible width using Tailwind `max-w-[10rem] truncate`. Full filename should appear on hover via `title={source.name}` attribute. No new `<style>` rules needed.

**Checkpoint**: Spec.md User Story 3 Acceptance Scenarios 1–2 pass in a browser.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Prove the quality gates and the edge cases.

- [ ] T037 Run `pnpm --filter @pdfwasm/web check` from repo root. MUST report 0 errors (constitution V).
- [ ] T038 Run `pnpm --filter @pdfwasm/web lint` from repo root. MUST report 0 errors (constitution V).
- [ ] T039 [P] Re-read any `<style>` blocks added or touched in `apps/web/src/lib/components/PdfViewer.svelte`, `apps/web/src/lib/components/PdfPage.svelte`, and `apps/web/src/lib/components/InsertPagesModal.svelte`. Confirm that new rules (if any) fall into one of the three exceptions in constitution II (`:global()`, `@keyframes`, or something Tailwind genuinely cannot express), and have blank-line separation between rule blocks.
- [ ] T040 [P] Confirm no new dependencies were added (`git diff main -- apps/web/package.json` should be empty). No Vite config changes (`git diff main -- apps/web/vite.config.ts` should be empty). No changes to `optimizeDeps.exclude`.
- [ ] T041 Walk every Edge Case row in `spec.md` §Edge Cases in a real browser:
    - Invalid / corrupted PDF → inline modal error, primary grid untouched.
    - Password-protected PDF → inline modal error (same path).
    - Confirm with zero selected pages → Confirm is disabled (button greyed out).
    - Insert at very start (position 0) and very end (position `combinedSequence.length`) → both commit correctly.
    - Same secondary PDF uploaded twice → two distinct `SourcePdf` entries, two independent insertions.
    - Same page of a secondary PDF inserted twice → two entries in `combinedSequence`.
    - Delete every inserted page after insertion → grid and export behave as if no insertion happened, no errors.
    - Split point at the boundary between original and inserted pages → both segments render correctly and export correctly.
    - Very large (>100 MB) secondary PDF → warning dialog with Continue / Cancel.
    - Cancel insert flow before confirm (modal dismiss) → no state changes; `pendingInsert` is null; `sources` is unchanged.
- [ ] T042 Walk the `contracts/splitPdf.md` §Acceptance test table rows in a browser (or via a scratch dev-only script if tedious by hand). Every row's expected output must match. This verifies the exporter contract at the integration seam.
- [ ] T043 Verify Success Criteria SC-001 through SC-005 in `spec.md`:
    - **SC-001**: Time the flow from "click Insert pages" to "confirm insertion anchor" — MUST be < 30 s on a typical machine with a ~20-page secondary PDF.
    - **SC-002**: Exercise several combinations of insert / delete / split and confirm every segment is correct.
    - **SC-003**: After exiting split mode, re-entering shows only original pages — 100% across at least 5 sessions.
    - **SC-004**: In one session, insert from 3 distinct secondary PDFs. Confirm correctness.
    - **SC-005**: Pick a non-PDF or corrupted PDF as a secondary source. Confirm error renders within 3 s and primary state is untouched.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies.
- **Phase 2 (Foundational)**: Depends on Phase 1. BLOCKS all user-story phases. The sequence-position refactor is the single biggest risk in this feature; finish it cleanly before moving on.
- **Phase 3 (US1)**: Depends on Phase 2. Core insert path.
- **Phase 4 (US4)**: Depends on Phase 2 + Phase 3. Most of US4 is already delivered by the refactor; T029–T031 verify composability with real inserted pages.
- **Phase 5 (US5)**: Depends on Phase 2 + Phase 3. Exit cleanup can only be written once `sources` / `insertedPages` state exists.
- **Phase 6 (US2)**: Depends on Phase 3. Primarily verification.
- **Phase 7 (US3)**: Depends on Phase 3. Independent UI addition.
- **Phase 8 (Polish)**: Depends on all user-story phases shipping in this PR.

### Within Phase 2 (Foundational)

- T004, T005, T006, T007 all touch `splitPdf.ts`. Marked `[P]` for mental parallelism but must be applied in one file edit. Practically: combine into one `splitPdf.ts` commit.
- T008–T017 all touch `PdfViewer.svelte`. They serialize. None are `[P]`.
- T018 touches `PdfPage.svelte` independently and can be done in parallel with the viewer migration.

### Within Phase 3 (US1)

- T019–T022 all touch the new `InsertPagesModal.svelte`. They serialize inside the file but proceed in parallel with viewer-side tasks.
- T023–T028 all touch `PdfViewer.svelte`. They serialize.
- T019–T022 can run in parallel with T023–T028 because they touch different files.

### Within other phases

- Phase 4, 5, 6, 7 tasks mostly touch `PdfViewer.svelte` and serialize within their phase.

### Parallel Opportunities

- Phase 2: `splitPdf.ts` edits (T004–T007) ∥ `PdfPage.svelte` edit (T018) ∥ `PdfViewer.svelte` refactor (T008–T017).
- Phase 3: `InsertPagesModal.svelte` creation (T019–T022) ∥ `PdfViewer.svelte` integration (T023–T028).
- Phase 8: T039 ∥ T040 (independent static checks).

### Within Each User Story

- No tests were requested; no "tests-first" ordering applies.
- Follow the task order listed within each phase.
- Commit after each user-story phase (or at every logical stopping point) with `KDA-28: <summary>` messages consistent with the branch name.

---

## Parallel Example: Phase 2 (two developers)

```bash
# Developer A — splitPdf.ts multi-source signature:
Task: T004 Add SequenceEntry interface in apps/web/src/lib/services/splitPdf.ts
Task: T005 Rename and re-spec computeSegmentPositions in apps/web/src/lib/services/splitPdf.ts
Task: T006 Rewrite splitPdf to accept sources map + sequence in apps/web/src/lib/services/splitPdf.ts

# Developer B — PdfViewer.svelte + PdfPage.svelte migration:
Task: T008 Declare sources / insertedPages state in apps/web/src/lib/components/PdfViewer.svelte
Task: T009 Add buildSequence helper in apps/web/src/lib/components/PdfViewer.svelte
Task: T010 Add combinedSequence derived in apps/web/src/lib/components/PdfViewer.svelte
Task: T018 Add optional doc override prop in apps/web/src/lib/components/PdfPage.svelte
```

---

## Parallel Example: Phase 3 (two developers)

```bash
# Developer A — modal:
Task: T019 Create InsertPagesModal.svelte with state machine
Task: T020 Implement thumbnail grid + selection
Task: T021 Size-warn threshold
Task: T022 Invalid PDF error surface

# Developer B — viewer integration:
Task: T023 Add insertModalOpen / pendingInsert state
Task: T024 "Insert pages" toolbar button
Task: T025 Mount modal + wire callbacks
Task: T026 Awaiting-anchor mode on gutters
Task: T027 commitInsertAt + rebase splitPoints / deletedPages
Task: T028 Render inserted pages via doc override
```

---

## Implementation Strategy

### MVP-First (recommended)

1. **Phase 1 → Phase 2**: Foundation. The refactor is the hardest part — once it lands and the feature still behaves like KDA-27, the rest is additive.
2. **Phase 3 (US1)**: Ship the core insert flow. At this point the feature is functionally present and exportable.
3. **Stop and validate** against spec.md User Story 1 + User Story 4 acceptance. This is the merge-worthy MVP.
4. **Phase 4 (US4)**: Verify cross-feature composition (most work already done by the refactor).
5. **Phase 5 (US5)**: Exit cleanup — correctness-critical but small.
6. **Phase 6 (US2)**: Multi-source verification — largely free from the architecture.
7. **Phase 7 (US3)**: Source badge polish.
8. **Phase 8**: Gates + edge-case QA.
9. Open PR with `Closes KDA-28` (Linear auto-closes on merge).

### Single-PR Alternative

The feature is larger than KDA-27 (one new component, a breaking service signature change, a cross-cutting state refactor) but still fits a single coherent PR (~300–400 lines). The constitution discourages speculative splits; ship as one PR. If the diff grows past ~600 lines, reconsider splitting the Foundational refactor (Phase 2) into its own PR first, landed under a no-op feature flag or as an unused internal rename — but only if review friction justifies it.

---

## Notes

- `[P]` tasks = different files, no dependencies — see per-phase notes. Inside each `.svelte` file, tasks serialize.
- `[Story]` label on every user-story task maps to `spec.md` user stories for traceability.
- No tests were requested; manual verification is per `spec.md` acceptance scenarios and the `contracts/splitPdf.md` §Acceptance test table.
- No `quickstart.md` exists for this feature; acceptance walkthroughs live in `spec.md` and the contract tables. If richer walkthroughs are wanted, author a `quickstart.md` as a follow-up — not a gate for this PR.
- Commit after each user-story phase, using the `KDA-28: <summary>` message pattern.
- Avoid: re-introducing PDF.js or a DOM text layer (constitution I); adding `<style>` rules outside the three allowed categories (constitution II); speculative abstractions like a per-`PageRef` stable id (constitution V); rewriting `PdfPage.svelte` beyond the single optional `doc` prop.
