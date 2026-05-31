# Revamp UI Design Based on Claude Design Mockup

**Linear:** [KDA-30](https://linear.app/kdaisho/issue/KDA-30/revamp-ui-design-based-on-claude-design-mockup) — Revamp UI design based on Claude Design mockup
**Branch:** `KDA-30/revamp-ui-design-based-on-claude-design-mockup`
**Created:** 2026-05-02
**Status:** Draft

## Problem Statement

Anyone opening the PDF Viewer today — first-time visitor or returning user — lands on a UI that still wears raw Skeleton defaults: flat buttons, a heavy warning-colored edit-mode bar, and inconsistent spacing/typography. The functionality (PDFium-accurate rendering, edit mode, split/export, auth) works, but the visual layer makes the product feel like a prototype, undermining trust in the underlying engineering and discouraging continued use.

## Context

- Files likely touched:
    - `apps/web/src/app.css` — design tokens + DM Sans/DM Mono font import
    - `apps/web/src/routes/+layout.svelte` — sidebar shell, footer, divider structure
    - `apps/web/src/lib/components/PdfSidebarItems.svelte` — button styles, zoom slider relocation, saved indicator
    - `apps/web/src/lib/components/PdfViewer.svelte` — replace top warning bar with floating sticky pill toolbar; restyle delete button, page card states, and split markers
- Related specs: `specs/KDA-29-rename-split-mode-to-edit-mode/` (most recent UI/terminology change in the same surface area)
- Design source of truth: `~/Downloads/design_handoff/` — `README.md` (handoff spec) + `PDF Viewer Redesign.html` (Variant **C** — "Indigo Accent + Warm Neutrals" — is the approved direction)
- Constraints / prior art:
    - Project conventions (`CLAUDE.md`): prefer Tailwind utilities over `<style>` blocks; reserve `<style>` for `:global()`, `@keyframes`, or selectors Tailwind cannot express
    - All Wasm/PDF rendering, splitPdf, charBoxes, search, auth, and routing logic stay untouched — this is a visual-layer change

## Acceptance Criteria

- [ ] Given the app loads, when the user views the sidebar, then it shows the redesigned 200px-wide warm-neutral (`#fafaf9`) sidebar with indigo logo mark, DM Sans typography, and the zoom slider always visible (not edit-mode-only)
- [ ] Given a PDF is open and the user enters Edit Mode, when the page grid scrolls, then the edit toolbar appears as a floating white pill sticky at the top of the viewport (replacing the previous full-width warning-colored bar)
- [ ] Given Edit Mode is active, when the user hovers a page thumbnail, then a red circular `×` delete button fades in at the top-right corner; clicking it dims the page to ~35% opacity, applies a red border, and strikes through the page number
- [ ] Given a page is marked deleted, when the user hovers it again, then the button shows a green restore (`↩`) icon and clicking it reverses the deleted state
- [ ] Given Edit Mode is active, when the user views split markers between pages, then they render as dashed indigo lines with the existing scissor toggle (re-themed to the indigo accent)
- [ ] Given the user toggles Edit Mode off, when the toolbar is checked, then the floating pill disappears and existing `$effect` cleanup behavior continues to work
- [ ] Given the redesign is complete, when the build runs, then `pnpm typecheck`, `pnpm lint`, and `pnpm build` all pass with no new errors
- [ ] Given existing functionality (PDF rendering, edit mode, insert pages, split/export, auth flows, Cmd+F search, keyboard shortcuts), when exercised after the redesign, then behavior is unchanged

## Out of Scope

- Backend / API changes
- New features beyond the existing app surface
- Auth flow visual redesign (the recently-shipped auth revamp keeps its current UI)
- Wasm/PDF rendering, splitPdf, charBoxes, search internals
- Mobile-specific layout work beyond preserving current responsive behavior

## Decisions

- **Sidebar shell:** Keep the Skeleton `Navigation` primitive and apply the redesign via CSS overrides (`[data-scope="navigation"]…` selectors). Chosen as the less destructive path — preserves existing slot wiring, footer plumbing, and layout structure.
- **Fonts:** Out of scope — keep the current font stack; do not add DM Sans / DM Mono.

## Open Questions

- None.
