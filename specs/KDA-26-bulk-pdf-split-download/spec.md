# Bulk PDF Split Download — ZIP Bundle + Source-Aware Filenames

**Linear:** [KDA-26](https://linear.app/kdaisho/issue/KDA-26/bulk-pdf-split-download-fails-silently-after-10-files-poor-file-naming) — Bulk PDF split download fails silently after ~10 files + poor file naming
**Branch:** `KDA-26/bulk-pdf-split-download-fails-silently-after-10-files-poor-file-naming`
**Created:** 2026-05-02
**Status:** Draft

## Problem Statement

A user who splits an opened PDF into many segments (observed at 16) and clicks Export receives only ~10 of the resulting files; the rest are silently dropped by the browser's multi-download throttling, with no indication that anything failed. Files that do arrive are named `split-1.pdf`, `split-2.pdf`, etc. — no link to the source PDF or the segment they represent — so identifying them after download is tedious. The result is an export flow that looks like it worked but actively loses user work and produces output that is hard to organize.

## Context

- Files likely touched:
    - `apps/web/src/lib/services/splitPdf.ts` — `downloadSplitPdfs` (replace per-file loop with zip), and `splitPdf` return shape (carry segment ordinal/range)
    - `apps/web/src/lib/components/PdfViewer.svelte` — accept new `sourceFilename` prop, pass into export, render export error inline
    - `apps/web/src/routes/+page.svelte` — capture `file.name` in `loadFile`, persist filename through `loadFromServer` (currently `_filename` is unused), pass to `<PdfViewer />`
    - `apps/web/package.json` — add `jszip`
- Related specs:
    - `specs/001-delete-pages-split/` — segment computation already excludes deleted pages; filename logic uses post-edit ordinals
    - `specs/002-insert-pages-from-pdf/` — segments may contain pages from secondary sources; export name still follows the _primary_ PDF only
    - `specs/KDA-29-rename-split-mode-to-edit-mode/` — feature lives under Edit mode export
- Constraints / prior art:
    - No toast system in the app; existing pattern is local error state rendered inline (`uploadError`, `docError` in `PdfSidebarItems.svelte`). Export errors will follow the same pattern.
    - `URL.revokeObjectURL` called immediately after `.click()` is a known cause of canceled downloads; replaced entirely by single-zip approach.
    - `pnpm` for dependency adds.

## Acceptance Criteria

- [ ] Given an opened PDF split into 16+ segments, when the user clicks Export, then a single ZIP file is downloaded containing all segments (no silent drops).
- [ ] Given a primary PDF named `report.pdf`, when export succeeds, then the downloaded archive is named `report-split.zip`.
- [ ] Given an exported archive, when the user opens it, then each entry is named `{sourceBasename}-part-{n}.pdf` (1-indexed, ordered by segment), with the `.pdf` extension stripped from the basename case-insensitively (`Report.PDF` → `Report-part-1.pdf`).
- [ ] Given a primary PDF whose filename contains path separators or whitespace, when export runs, then the basename used for naming has `/` and `\` replaced with `-`, runs of whitespace collapsed to a single `-`, and length capped at 80 characters; non-ASCII characters are preserved.
- [ ] Given a primary PDF with no known filename (e.g. recovered session with missing metadata), when export runs, then the basename `document` is used.
- [ ] Given a segment built partly from inserted pages from a secondary PDF, when export runs, then the output filename still uses only the primary PDF's basename (secondary source names are not reflected in filenames).
- [ ] Given an export that fails (zip generation error, browser blocks the single download), when the failure occurs, then an error message is displayed inline near the Export control and the user is not left believing the export succeeded.
- [ ] Works in current Chrome, Firefox, and Safari.

## Out of Scope

- Progress indicator during zip generation.
- Streaming/chunked zip output (jszip generates fully in-memory; acceptable for typical PDF sizes).
- User-configurable filename templates or per-segment custom names.
- Re-uploading the generated zip back to the server.
- Including secondary source PDF names in output filenames when inserted pages are present.
- Hybrid behavior (e.g. plain `.pdf` when only one segment exists) — always emit a zip for consistency.

## Open Questions

- None.
