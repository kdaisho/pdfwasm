# Phase 0 Research: Allow Deleting Pages in Split Mode

**Feature**: `specs/001-delete-pages-split/spec.md`
**Date**: 2026-04-19

All `[NEEDS CLARIFICATION]` markers from the specification have been resolved (the all-pages-excluded edge case became FR-009: block export with a warning). This document records the small number of implementation-level decisions that remain, with alternatives considered.

---

## Decision 1: State representation for exclusions

**Decision**: Track exclusions as `let deletedPages: Set<number> = $state(new Set())` on `PdfViewer.svelte`, where values are 0-based page indices — exactly mirroring the existing `splitPoints` state.

**Rationale**:

- The component already uses `Set<number>` for `splitPoints`. Using the same shape keeps the two concepts symmetric and the toggle/reset logic trivially analogous.
- O(1) membership checks for the per-page render loop (`deletedPages.has(page.index)`), which runs once per page in the thumbnail grid.
- A `Set` is the natural fit for "unordered collection of distinct indices" — no ordering constraints, no duplicates, no payload per entry.

**Alternatives considered**:

- **`boolean[]` indexed by page number**: rejected. Requires knowing total page count up front and allocates eagerly; no real benefit over `Set`.
- **`Map<number, { reason: string }>` with metadata**: rejected as speculative abstraction (constitution V). We don't currently need a reason or timestamp per exclusion; a Set is sufficient until a concrete need appears.
- **Storing on each `PageData`**: rejected. `PageData` is owned upstream and represents the intrinsic page; exclusion is a transient UI concern that belongs to `PdfViewer`.

---

## Decision 2: Svelte 5 reactivity pattern for mutating a `Set`

**Decision**: Clone and reassign — do not call `.add()` / `.delete()` on the existing Set instance.

```ts
function toggleDeletedPage(pageIndex: number) {
	const next = new Set(deletedPages);
	if (next.has(pageIndex)) {
		next.delete(pageIndex);
	} else {
		next.add(pageIndex);
	}
	deletedPages = next;
}
```

**Rationale**:

- This is the exact pattern used by the existing `toggleSplitPoint`. Consistency within the component is worth more than minor micro-optimization.
- Plain `Set` mutation does not trigger Svelte 5's `$state` reactivity; reassigning the binding does. (`SvelteMap` is imported in the file for a different derived state, but `splitPoints` deliberately uses clone-and-reassign rather than `SvelteSet`; follow suit for `deletedPages`.)
- The ESLint suppression comment pattern used beside `splitPoints` (`// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local throwaway copy, not reactive state`) applies identically and can be reused verbatim.

**Alternatives considered**:

- **`SvelteSet` from `svelte/reactivity`**: would work, but introduces a second pattern into a file that already has a settled pattern for the analogous concept. Rejected for consistency.
- **Mutate in place and manually trigger rerun**: Svelte 5 doesn't offer a clean "touch this state" primitive without reassignment. Rejected as fragile.

---

## Decision 3: Visual distinction via Tailwind utilities only

**Decision**: Dim excluded pages with `opacity-40` on the thumbnail wrapper and add a `line-through` decoration on the page-number label. No new `<style>` rules.

**Rationale**:

- Constitution II requires Tailwind-first styling. Both `opacity-*` and `line-through` are core Tailwind utilities.
- The effect is conditional (`class:opacity-40={deletedPages.has(page.index)}`) — Svelte expresses this cleanly without needing a CSS class toggle.
- The existing `<style>` block in `PdfViewer.svelte` contains only two `:global()` rules for thumbnail canvas positioning; adding dimming there would be both an unnecessary new rule and arguably a violation of II (a property with a direct Tailwind equivalent).
- Extra-light strikethrough on the page-number label is a strong secondary cue that survives for users who perceive contrast differences rather than opacity.

**Alternatives considered**:

- **Grayscale filter (`grayscale`)**: less clear as an affordance than opacity; the page still looks "included" just desaturated. Rejected.
- **Hide the thumbnail entirely**: rejected by spec assumption ("Excluded pages remain visible in the page grid… not hidden from view, so users can still see and unmark them").
- **Custom CSS class with multiple declarations**: rejected by constitution II unless a Tailwind utility genuinely cannot express what's needed, which it can.

---

## Decision 4: × button placement and hover-reveal behavior

**Decision**: Render the × button absolutely-positioned at the top-right corner of each thumbnail wrapper, visible on hover (and always visible when the page is already excluded so users can toggle it back). Use the same hover-reveal pattern and Skeleton button styling conventions as the existing split gutter.

**Rationale**:

- The spec's UX sketch explicitly calls out "visible on hover, like the split gutter". The split gutter in `PdfViewer.svelte` uses `group` + `group-hover:opacity-100` / `opacity-50` — reusing this pattern means zero new UX vocabulary.
- When a page is already excluded, the × must stay visible (otherwise users can't un-exclude without scrubbing the mouse around). This is a one-line conditional class override.

**Alternatives considered**:

- **Always-visible × button**: rejected as noisy for the 95% case where the user isn't excluding that page.
- **Right-click / context menu**: rejected as poor discoverability for a primary feature.

---

## Decision 5: Export guard placement (FR-009)

**Decision**: Compute `derived` effective-page count (`pages.length - deletedPages.size`). Disable the Export button and render a small warning message above it when the effective count is 0. Also short-circuit `doExport` if called while the count is 0 (defense in depth).

**Rationale**:

- A purely-UI disable is insufficient if a caller bypasses the button (defensive programming) — but in practice this is a button handler, so the UI disable does the heavy lifting. The `doExport` guard is one extra line and catches any future programmatic call.
- The warning is a short inline message, not a toast/modal — consistent with the existing compact status-bar UI in split mode.

**Alternatives considered**:

- **Let export succeed and produce zero files**: rejected by the clarification answer on 2026-04-19.
- **Surface as a full-width error banner**: rejected as disproportionate. The status bar already hosts the live summary; keep the warning there.

---

## Open Items

None. All decisions above are locked for Phase 1 and `/speckit.tasks`.
