# Session Context

## User Prompts

### Prompt 1

Implement the following plan:

# Virtualized PDF Rendering (Load on Demand)

## Context
Loading a large PDF takes ~11 seconds because every page is rendered and char-extracted sequentially before anything is shown. We want near-instant initial display regardless of PDF size by only rendering pages visible in the viewport.

## Design

### Data Model Split
Currently `PageData` bundles metadata + bitmap together. Split into two concerns:

```
PageMeta (all pages, instant):    { index, originalWidth...

### Prompt 2

something wrong, i see each page conainer (greyed out), but i see no contents even after 20 sec wait.

### Prompt 3

i still see warnings:
`renderCanvas` is updated, but is not declared with `$state(...)`. Changing its value will not correctly trigger updates
https://svelte.dev/e/non_reactive_updatesveltenon_reactive_update

