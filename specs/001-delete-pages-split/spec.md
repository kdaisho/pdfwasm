# Feature Specification: Allow Deleting Pages in Split Mode

**Feature Branch**: `KDA-27/allow-deleting-pages-in-split-mode`
**Created**: 2026-04-19
**Status**: Draft
**Linear**: https://linear.app/kdaisho/issue/KDA-27/allow-deleting-pages-in-split-mode
**Input**: User description: "Allow deleting pages in split mode — currently split mode only lets users choose where to split a PDF into segments; there's no way to exclude unwanted pages. In split mode, allow marking individual pages as deleted; deleted pages are excluded from all resulting segments on export."

## User Scenarios & Testing

### User Story 1 - Exclude unwanted pages from split export (Priority: P1)

A user loads a PDF, enters split mode, and decides some pages (e.g., a cover page, blank separators, appendix) should not appear in any of the resulting segment files. They mark those pages for exclusion, then export. The downloaded segments contain every page that was not excluded, with segment boundaries still defined by the split points.

**Why this priority**: This is the core feature. Without it, users must split first and then remove pages in an external tool, which is the exact inefficiency the issue exists to eliminate. Delivering only this story — even without the visual polish of stories 2 and 3 — already removes the external round-trip.

**Independent Test**: Load a multi-page PDF, enter split mode, set one split point, mark at least one page in each resulting segment for exclusion, export, and verify the downloaded files omit exactly the marked pages and preserve all others in original order.

**Acceptance Scenarios**:

1. **Given** a user is in split mode with split points defined, **When** they mark a page for exclusion and export, **Then** that page does not appear in any downloaded segment file.
2. **Given** a page is marked for exclusion, **When** the user unmarks it and exports, **Then** that page is restored to its segment in the exported file.
3. **Given** split points divide the document into N segments, **When** every page of one segment is marked for exclusion, **Then** that segment is not emitted (N-1 files are exported, not N).

---

### User Story 2 - Visual distinction and live count for excluded pages (Priority: P2)

While in split mode, the user wants immediate visual confirmation that a page is marked for exclusion and a running summary of how the exclusions affect the output.

**Why this priority**: Without this, users can still exclude pages (Story 1 works) but must export and inspect the output to verify their intent. Visual feedback makes the feature trustworthy and reduces export-to-verify cycles.

**Independent Test**: Mark and unmark pages in split mode; confirm each marked page is visually distinguishable from unmarked pages at a glance, and that a summary area reflects the current exclusion count and resulting file count in real time.

**Acceptance Scenarios**:

1. **Given** a page is marked for exclusion, **When** the user looks at the page grid, **Then** that page is visually distinct from included pages (e.g., dimmed or struck through).
2. **Given** the user has marked K pages for exclusion across N split-defined segments producing M output files, **When** they view the status summary, **Then** the summary reflects both the excluded-page count and the resulting file count, updating live as they toggle exclusions.

---

### User Story 3 - Exclusion state resets when leaving split mode (Priority: P3)

When the user exits split mode (returns to the default viewing experience or switches documents), any page exclusions they configured are discarded.

**Why this priority**: Prevents stale state from silently affecting the user's next interaction. Lower priority because it is only observable when the user re-enters split mode — not during the primary flow — but still required for correctness.

**Independent Test**: Mark pages in split mode, exit split mode, re-enter split mode, and verify no pages are marked for exclusion.

**Acceptance Scenarios**:

1. **Given** the user has marked pages for exclusion in split mode, **When** they exit split mode and re-enter it, **Then** no pages are marked for exclusion.

---

### Edge Cases

- **All pages in a single segment are excluded**: The segment is dropped from the output; fewer files are emitted than split points would otherwise dictate.
- **All pages in the entire document are excluded**: The export action is blocked and the user sees a warning explaining that every page is currently marked for exclusion; no files are produced until the user unmarks at least one page.
- **Page is marked for exclusion, then the user removes the adjacent split point**: Exclusion state for that page is preserved; it continues to be excluded from whichever segment it now falls in.
- **Exclusion controls interact with a page that has a split point on it**: Marking the page as excluded still drops it from output; the split point itself remains in place and continues to define the segment boundary for unexcluded neighbors.

## Requirements

### Functional Requirements

- **FR-001**: Users MUST be able to mark any individual page as excluded while in split mode.
- **FR-002**: Users MUST be able to unmark a previously excluded page to restore it.
- **FR-003**: Exported segments MUST omit every page marked as excluded, in all resulting files.
- **FR-004**: The system MUST visually distinguish excluded pages from included pages in the page grid during split mode.
- **FR-005**: The system MUST display a live status summary reflecting the current count of excluded pages and the count of segment files that will be produced.
- **FR-006**: The system MUST drop any segment whose pages are all excluded so that no empty file is ever exported.
- **FR-007**: The system MUST clear all exclusion state when the user exits split mode.
- **FR-008**: Exclusion controls MUST be visible and actionable only while the user is in split mode.
- **FR-009**: The system MUST block export and surface a warning when every page in the document is marked for exclusion; export becomes available again as soon as at least one page is unmarked.

### Key Entities

- **Excluded Page Set**: The collection of page indices currently marked for exclusion within an active split-mode session. Transient; coexists with the split-points set; cleared on mode exit.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Users can produce a split export with specific pages omitted entirely within the app, without opening a second tool to delete pages afterward.
- **SC-002**: Users can identify every excluded page at a glance from the page grid without inspecting the exported files.
- **SC-003**: Before exporting, users can read an accurate preview of how many output files they will receive given their current exclusions, so they are not surprised by dropped segments.
- **SC-004**: After exiting split mode, no exclusion state survives into the next split-mode session — users start from a clean slate every time.

## Assumptions

- Page exclusion is an in-session, transient state. It is not persisted across page reloads, document reloads, or mode changes, and it is not written back to the source PDF.
- Excluded pages remain visible in the page grid (in a distinct visual state); they are not hidden from view, so users can still see and unmark them.
- The feature applies only within split mode; no cross-mode "delete page" affordance is introduced in read/default viewing modes.
- No reordering of pages is in scope; exclusion preserves the original page order of unexcluded pages.
- Renaming split mode to a more general label (e.g., "edit mode") is explicitly out of scope and tracked separately.
