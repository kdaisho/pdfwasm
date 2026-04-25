# Feature Specification: Insert Pages from Another PDF in Split Mode

**Feature Branch**: `KDA-28/allow-inserting-pages-from-another-pdf-in-split-mode`
**Created**: 2026-04-20
**Status**: Draft
**Input**: Linear KDA-28 — "Allow inserting pages from another PDF in split mode"

## Clarifications

### Session 2026-04-20

- Q: When the user multi-selects pages from the secondary PDF, in what order do they land in the primary grid? → A: Source page order — pages land ascending by their index in the secondary PDF, regardless of click sequence.
- Q: If the user picks a file with the same filename twice, do they count as one source or two? → A: Each upload is a distinct source — two uploads of the same filename produce two separate `Source PDF` entries, each with its own memory-resident bytes and independent identity.
- Q: How should the system behave when the user picks a very large secondary PDF? → A: Warn-and-proceed above a size threshold (approx. 100 MB) — the user is shown a warning and can confirm to continue.
- Q: Can the user re-use an already-loaded secondary PDF to insert more pages without re-picking the file? → A: No — every insert invocation starts from the file picker. Re-picking the same file produces another distinct Source PDF (consistent with the identity decision above).
- Q: Can the user select multiple PDFs at once from the file picker, or only one per invocation? → A: Single-file picker — each insert invocation accepts exactly one secondary PDF. To add pages from several PDFs, the user runs the flow multiple times.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Insert pages from a second PDF into the current document (Priority: P1)

A user in split mode wants to pull in one or more pages from a different PDF file and place them at a specific position in the current document, then export the result.

**Why this priority**: This is the core value of the feature. Today split mode can only remove or partition the current PDF. Without this story, users must leave the app to assemble a PDF that combines content from multiple sources.

**Independent Test**: Open a PDF in split mode, pick "Insert pages", choose a second PDF, select two pages from it, choose an insertion point in the primary grid, confirm, and export. The exported segment(s) must contain the inserted pages at the chosen position, in order.

**Acceptance Scenarios**:

1. **Given** a PDF is open in split mode, **When** the user activates the insert-pages action and selects a valid secondary PDF, **Then** the thumbnails of that secondary PDF are displayed for selection.
2. **Given** the user has selected one or more pages from the secondary PDF and chosen an insertion anchor in the primary grid, **When** the user confirms, **Then** the selected pages appear inline at the chosen position in the primary grid in ascending order of their page index in the secondary PDF.
3. **Given** pages from a secondary PDF have been inserted, **When** the user exports the document, **Then** the resulting output contains the inserted pages at the correct positions in the correct segments.

---

### User Story 2 - Combine pages from multiple secondary PDFs (Priority: P2)

A user wants to assemble a document that pulls pages from several different source PDFs, inserting from each one at different positions in the primary document.

**Why this priority**: It expands the feature from a single-source insert to an actual assembly workflow. Valuable, but the P1 single-source flow is the minimum that delivers real value.

**Independent Test**: Starting from a primary PDF in split mode, perform insert-pages twice using two different secondary PDFs at two different positions. Verify both sets of inserted pages appear in the expected positions and export correctly.

**Acceptance Scenarios**:

1. **Given** the user has already inserted pages from one secondary PDF, **When** the user repeats the insert flow with a different secondary PDF, **Then** both sets of inserted pages are present in the primary grid at their respective insertion points.
2. **Given** the user inserts pages from two distinct source PDFs, **When** the user exports, **Then** each exported segment preserves the origin-aware order of all original and inserted pages.

---

### User Story 3 - Recognize which pages came from which source (Priority: P3)

A user scanning the primary grid wants to see at a glance which pages are from the original document and which were pulled in from another PDF (and from which one).

**Why this priority**: Improves confidence and reduces mistakes, especially when multiple sources are in play. Not required for the core action to work, so it follows P1/P2.

**Independent Test**: After inserting pages from a secondary PDF named e.g. `appendix.pdf`, confirm each inserted page in the primary grid carries a visible marker identifying it as coming from `appendix.pdf`, distinguishable from original pages.

**Acceptance Scenarios**:

1. **Given** the user has inserted pages from a secondary PDF, **When** the user views the primary grid, **Then** each inserted page shows a visible indicator identifying its source filename.
2. **Given** the user has inserted pages from two different secondary PDFs, **When** the user views the primary grid, **Then** each inserted page's indicator clearly ties it to its specific source file.

---

### User Story 4 - Split and delete behavior works on the combined document (Priority: P1)

A user who has inserted pages expects every other split-mode operation — placing split points, deleting pages — to behave on the combined sequence exactly as it does today on the original document.

**Why this priority**: Without this, insert is non-composable with the existing split and delete features and users will see broken exports. P1 because it is part of the minimum viable slice alongside Story 1.

**Independent Test**: Insert pages from a second PDF, then place a split point across the boundary between original and inserted pages, then mark one inserted page and one original page as deleted. Export must respect all three: the split point, the two deletions, and the insertion order.

**Acceptance Scenarios**:

1. **Given** pages have been inserted into the primary grid, **When** the user adds or removes a split point in any gutter (including adjacent to inserted pages), **Then** the split point applies correctly to the combined sequence and the export produces segments that reflect it.
2. **Given** pages have been inserted into the primary grid, **When** the user toggles any page (original or inserted) as deleted, **Then** the deletion applies in the combined sequence and the export omits that page from its segment.

---

### User Story 5 - Exiting split mode discards inserted content cleanly (Priority: P2)

When the user leaves split mode, any pages that were staged from secondary PDFs are removed and the view returns to the pristine original document.

**Why this priority**: Prevents stale insertion state from leaking into other app modes. Important for correctness but not part of the core insertion happy path.

**Independent Test**: Insert pages from a secondary PDF, then exit split mode. Re-enter split mode and verify that no inserted pages, no source indicators, and no residual split/delete state from those insertions remain.

**Acceptance Scenarios**:

1. **Given** the user has inserted pages from one or more secondary PDFs, **When** the user exits split mode, **Then** all inserted pages and references to their source PDFs are cleared.
2. **Given** the user re-enters split mode after exiting, **When** the grid renders, **Then** only the original document's pages are shown.

---

### Edge Cases

- The user picks a file that is not a valid PDF or is corrupted — the system must surface a clear error and leave the primary document untouched.
- The user picks a secondary PDF that requires a password — the system must surface a clear error rather than failing silently.
- The user confirms insertion without having selected any pages from the secondary PDF — the confirm action must be disabled or a clear prompt shown.
- The user inserts pages at the very start or very end of the primary document — both anchors must be valid insertion targets.
- The user inserts the same secondary PDF more than once, or the same page of a secondary PDF more than once — each occurrence must be treated as an independent entry in the grid.
- The user deletes every inserted page after insertion — the grid and export must behave as though the insertion never happened, without errors.
- The user places a split point directly at the boundary between original and inserted pages — the split point must apply correctly to the combined sequence.
- The user loads a very large secondary PDF (larger than ~100 MB) — the system must display a warning with confirm/cancel before loading, rather than silently freezing.
- The user cancels the insert flow (closes the modal / drawer) before confirming — no pages are inserted and no state changes.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The split-mode toolbar MUST expose an action that lets the user begin the insert-pages flow.
- **FR-002**: The insert-pages flow MUST let the user pick a PDF file from their device as the source of inserted pages. The file picker MUST accept exactly one PDF per invocation (single-file selection); multi-file selection MUST NOT be offered. Every invocation of the insert flow begins at the file picker; the system MUST NOT present a list of previously loaded secondary PDFs for reuse.
- **FR-003**: The system MUST present the pages of the selected secondary PDF to the user as a thumbnail view suitable for selection.
- **FR-004**: The user MUST be able to select one or more pages from the secondary PDF before confirming insertion.
- **FR-005**: The user MUST be able to designate an insertion anchor in the primary grid, including the positions before the first page and after the last page.
- **FR-006**: On confirmation, the selected secondary-PDF pages MUST appear inline in the primary grid at the chosen insertion anchor, in ascending order of their page index in the secondary PDF (regardless of the order in which the user clicked them during selection).
- **FR-007**: Inserted pages MUST be visually distinguishable from original pages and MUST carry an indicator of the source file they came from.
- **FR-008**: Split points MUST be placeable in any gutter of the combined sequence (including gutters between original and inserted pages) and MUST produce correct segments on export.
- **FR-009**: Page deletion MUST apply to both original and inserted pages and MUST omit deleted pages from the export.
- **FR-010**: Export MUST produce output segments whose page order matches the current combined sequence as shown in the primary grid, with inserted pages sourced from their respective secondary PDFs.
- **FR-011**: The user MUST be able to perform the insert flow multiple times, including from multiple different secondary PDFs in a single session, with each insertion preserved independently.
- **FR-016**: Each invocation of the insert flow MUST produce a distinct `Source PDF` entry, even if the chosen file has the same filename as a previously loaded source in the current session. Two uploads of the same filename MUST NOT be collapsed or deduplicated.
- **FR-017**: When the user selects a secondary PDF whose size exceeds approximately 100 MB, the system MUST display a warning that identifies the file, communicates the potential performance impact, and offers an explicit confirm/cancel choice. On confirm, loading proceeds; on cancel, no loading or state change occurs.
- **FR-012**: When the user exits split mode, all insertion state MUST be cleared such that re-entering split mode shows only the original document.
- **FR-013**: If the selected secondary file is not a readable PDF (invalid, corrupted, or password-protected), the system MUST communicate the failure clearly and leave the primary document and its in-progress split/delete state unchanged.
- **FR-014**: Canceling or dismissing the insert flow before confirmation MUST leave the primary grid unchanged.
- **FR-015**: The insert flow MUST NOT allow the user to confirm an insertion with zero selected pages.

### Key Entities _(include if feature involves data)_

- **Source PDF**: A secondary PDF the user has loaded for insertion via a single invocation of the insert flow. Has a human-readable name (filename) and a set of pages that can be selected. Each upload produces a distinct Source PDF, even if the filename matches a previously loaded source.
- **Inserted Page Reference**: A record of a single page drawn from a Source PDF, including which Source PDF it came from, which page of that source it represents, and where in the primary grid it currently sits.
- **Combined Page Sequence**: The user-visible ordered sequence of pages in split mode, composed of original pages and inserted page references, over which split points and deletions operate.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A user can load a secondary PDF and insert one or more of its pages into the primary document in under 30 seconds from clicking the insert action to confirmation.
- **SC-002**: For any combination of insertions, deletions, and split points the user has configured, 100% of exported segments reflect those choices in the correct order without missing or duplicated pages.
- **SC-003**: After the user exits split mode, no inserted pages or source-PDF artifacts are visible on re-entry in 100% of cases.
- **SC-004**: In a single split-mode session, the user can successfully insert pages from at least three distinct secondary PDFs without the grid, split points, or export becoming incorrect.
- **SC-005**: When the user selects an invalid or unreadable PDF as a secondary source, they see an actionable error message within 3 seconds, and the primary document and its in-progress state are preserved.

## Assumptions

- The insert-pages capability is scoped to split mode only; normal viewing mode does not expose it in this release.
- Inserted pages participate in split points and page deletion exactly as original pages do — they are first-class citizens of the combined sequence.
- A visual indicator on inserted pages (such as a small badge referencing the source filename) is sufficient to satisfy the "visually marked" requirement; the exact styling is a design detail left to implementation.
- Source PDFs remain available for the duration of the split-mode session for display purposes (e.g., source-identifier badges on inserted pages). If the user wants to insert more pages from the same file, they re-pick it through the file picker — the system does not offer reuse of already-loaded secondary PDFs.
- Very large secondary PDFs (above ~100 MB) trigger a warn-and-proceed confirmation rather than a hard block; the user stays in control.
- Inserting blank pages, reordering pages via drag, and inserting non-PDF files are explicitly out of scope for this feature.
- The user is the sole actor; there are no multi-user or permission considerations for this feature.

## Dependencies

- Builds on the split-mode feature and the page-deletion feature (KDA-27). The combined-sequence refactor implied here assumes KDA-27 has landed, so split and delete logic already operate on sequence positions rather than raw original indices.
- Uses the existing PDF loading and thumbnail rendering pipelines for the secondary PDF; no new loading subsystem is introduced.
