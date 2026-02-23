# Session Context

## User Prompts

### Prompt 1

Implement the following plan:

# Plan: Improve search highlight rendering

## Context
Text search highlights are drawn per-character using exact PDFium bounding boxes. This makes highlights hard to see because each character has a slightly different height (e.g., "a" vs "T") and there are tiny gaps between character boxes. The goal is to render highlights as continuous, full-height rectangles — like browser-style text selection.

## Change

**File:** `src/lib/components/PdfPage.svelte` — mod...

