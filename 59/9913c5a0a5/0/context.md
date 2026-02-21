# Session Context

## User Prompts

### Prompt 1

Implement the following plan:

# Plan: Split PDF Feature

## Context
Users want to split a single PDF into multiple PDFs. This requires:
1. A new multi-column grid layout (max 6 columns) so pages are compact enough to see split points
2. Clickable divider lines between pages to mark split points
3. Export functionality to produce the split PDFs as downloads

## Approach

### New dependency: `pdf-lib`
Use `pdf-lib` (pure JS, no Wasm) for the export step. PDFium's `_FPDF_SaveAsCopy` uses a C-style...

### Prompt 2

in split mode, lower rows are overlapping the parent rows

