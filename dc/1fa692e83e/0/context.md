# Session Context

## User Prompts

### Prompt 1

Implement the following plan:

# Fix: Search navigation broken during background char extraction

## Context
After implementing virtualized rendering, search navigation (next/prev match) is broken. The user sees 54 hits but can't navigate past the first one. Two issues cause this:

### Root Cause 1: Match index resets on every background extraction tick
In `PdfViewer.svelte` (line 39-47), this `$effect` resets `currentMatchIndex` to 0 whenever `matches.length` changes:
```js
$effect(() => {
    ...

### Prompt 2

ha! solution is surprisingly simple. beautiful.

