# Quickstart: Verifying "Allow Deleting Pages in Split Mode"

**Feature**: `specs/001-delete-pages-split/spec.md`
**Date**: 2026-04-19

This is a developer-facing walkthrough for manually verifying the feature against its acceptance scenarios once it is implemented. No automated tests are introduced (see plan.md → Testing).

---

## 1. Prerequisites

- Node + pnpm installed (constitution IV: pnpm only).
- Checked out on branch `KDA-27/allow-deleting-pages-in-split-mode`.
- A sample multi-page PDF — ideally 6+ pages — on your machine. A PDF with visually distinct page numbers on each page makes verification obvious.

## 2. Run the app locally

```bash
pnpm install
pnpm --filter @pdfwasm/web dev
```

Open the URL printed by Vite. Log in (or sign up) so the export auth gate is satisfied.

## 3. Load a PDF and enter split mode

1. Upload the sample PDF through the normal flow.
2. Toggle into split mode via the existing control.
3. Confirm the thumbnail grid renders.

## 4. Verify each acceptance scenario

### User Story 1 — Exclude unwanted pages from split export

| Step | Action                                                                                   | Expected                                                                                                           |
| ---- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1.1  | Set one split point (e.g., after page 2).                                                | Status bar shows "1 split point → 2 files", no exclusions.                                                         |
| 1.2  | Mark page 3 as excluded via the × button.                                                | Status bar updates to reflect 1 excluded page and resulting file count. Page 3 is visibly dimmed.                  |
| 1.3  | Click Export.                                                                            | Two PDFs download. The first contains pages 1–2. The second contains pages 4–5+ (page 3 is absent).                |
| 1.4  | Unmark page 3, export again.                                                             | Two PDFs download; second file now includes page 3 in its original position.                                       |
| 1.5  | Mark every page of one segment as excluded (e.g., pages 4, 5, 6 with `splitPoints=[2]`). | Status bar shows file count reduced. Export produces only the first file; the now-empty second segment is dropped. |

### User Story 2 — Visual distinction and live count

| Step | Action                    | Expected                                                                                                                                              |
| ---- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1  | Hover over any thumbnail. | × button appears (like the split gutter pattern).                                                                                                     |
| 2.2  | Mark a page as excluded.  | Page thumbnail dims (`opacity-40`); page-number label gains strikethrough. The × button stays visible on the excluded thumbnail even after mouse-out. |
| 2.3  | Toggle several pages.     | Status bar updates live after each toggle — both the excluded-count and file-count values.                                                            |

### User Story 3 — Reset on exit

| Step | Action                           | Expected                                                              |
| ---- | -------------------------------- | --------------------------------------------------------------------- |
| 3.1  | Mark multiple pages as excluded. | Confirm they are visibly dimmed.                                      |
| 3.2  | Exit split mode.                 | No visible dimming applies (exclusion UI is gone).                    |
| 3.3  | Re-enter split mode.             | Zero pages are marked as excluded. Status summary reports 0 excluded. |

### Edge Case — All pages excluded (FR-009)

| Step | Action                                       | Expected                                                                                                                        |
| ---- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| E.1  | Mark every page in the document as excluded. | Export button becomes disabled. An inline warning appears near the button explaining every page is excluded.                    |
| E.2  | Unmark one page.                             | Export button re-enables. Warning disappears. Clicking Export succeeds and produces one file containing only the unmarked page. |

## 5. Quality gates before PR

Run before opening the PR (constitution V):

```bash
pnpm --filter @pdfwasm/web check   # svelte-check / tsc — must show 0 errors
pnpm --filter @pdfwasm/web lint    # ESLint v9 flat config — must pass
```

Also re-run `/speckit.tasks` and `/speckit.implement` sequentially to generate and walk through the task list, or proceed manually guided by the plan + contracts.

## 6. PR checklist

- [ ] Branch name is `KDA-27/allow-deleting-pages-in-split-mode` (Linear convention).
- [ ] Commit messages follow the `KDA-27: <summary>` pattern established in `git log`.
- [ ] PR description links to Linear issue KDA-27 so Linear auto-closes it on merge.
- [ ] Constitution principles I–V each addressed in the PR description (copy from plan.md).
