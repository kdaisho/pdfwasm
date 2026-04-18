<!--
Sync Impact Report
==================
Version change: (unversioned template) → 1.0.0
Bump rationale: Initial ratification of the pdfwasm constitution. All placeholder
tokens replaced with concrete principles derived from user input.

Modified principles:
  - [PRINCIPLE_1_NAME] → I. PDFium-Only Rendering & Anti-Drift Highlighting
  - [PRINCIPLE_2_NAME] → II. Frontend Stack (SvelteKit + Svelte 5 + Tailwind + Skeleton)
  - [PRINCIPLE_3_NAME] → III. Session-Based Auth (NON-NEGOTIABLE)
  - [PRINCIPLE_4_NAME] → IV. Tooling & Workflow Discipline
  - [PRINCIPLE_5_NAME] → V. Code Quality Gates

Added sections:
  - Core Principles (I–V)
  - Additional Constraints (Vite / Wasm / CSS rules)
  - Development Workflow & Quality Gates
  - Governance

Removed sections: none (template placeholders replaced in place).

Templates requiring updates:
  - ✅ .specify/templates/plan-template.md — generic "Constitution Check" gate
    already present; no rewrite required. Reviewers MUST map gates to the five
    principles below when filling a plan.
  - ✅ .specify/templates/spec-template.md — no constitution-specific sections;
    remains compatible.
  - ✅ .specify/templates/tasks-template.md — task categorization remains
    compatible; no principle introduces a new mandatory task type.
  - ✅ .specify/templates/commands/*.md — no stale agent-specific references
    introduced by this amendment.
  - ✅ CLAUDE.md / README.md — existing project conventions already align with
    the principles codified here.

Deferred items / TODOs: none.
-->

# pdfwasm Constitution

## Core Principles

### I. PDFium-Only Rendering & Anti-Drift Highlighting

pdfwasm exists to eliminate the text-search highlight drift that plagues PDF.js. The
rendering and highlighting pipeline is therefore fixed and non-negotiable:

- **PDFium Wasm (`@hyzyla/pdfium`) is the sole PDF rendering engine.** PDF.js MUST NOT
  be introduced in any form. A DOM text layer MUST NOT be rendered over pages.
- **Pages render to `<canvas>` via PDFium bitmap output.** Highlights are drawn as
  canvas overlays on a **separate overlay canvas**, never on the render canvas and
  never as DOM elements.
- **Highlight coordinates MUST come from PDFium character boxes** obtained via
  `_FPDFText_GetCharBox` (with word-level `_FPDFText_CountRects` / `_FPDFText_GetRect`
  as a documented fallback only). Browser text measurement (`getBoundingClientRect`,
  `measureText`, DOM ranges) MUST NOT be used to derive highlight geometry. This is
  the anti-drift guarantee and the reason this project exists.
- **Coordinate conversion MUST use the documented formula**: PDF points, origin
  bottom-left, Y-up → canvas pixels, origin top-left, Y-down, scaled by render scale:
  `x = left * scale; y = (pageHeightPt - top) * scale; w = (right - left) * scale;
h = (top - bottom) * scale`.

**Rationale**: Every shortcut around this principle (re-measuring text in the DOM,
reusing PDF.js for "just the text layer", computing rects from browser selection
APIs) reintroduces the exact drift class this project was built to eliminate.

### II. Frontend Stack (SvelteKit + Svelte 5 + Tailwind + Skeleton)

- The frontend stack is **SvelteKit + Svelte 5 + TypeScript + Tailwind CSS +
  Skeleton UI toolkit**. No alternative framework or UI toolkit may be added.
- **Styling is Tailwind-first.** `<style>` blocks are permitted **only** for:
  (a) `:global(...)` selectors targeting child-component internals,
  (b) `@keyframes` animations, or
  (c) selectors Tailwind genuinely cannot express. If a CSS property has a direct
  Tailwind equivalent (`display: flex` → `flex`, `padding: 16px` → `p-4`), the
  Tailwind utility MUST be used.
- CSS rule blocks within `<style>` MUST be separated by a single blank line.
- **Svelte 5 runes (`$state`, `$derived`, `$effect`) live only in `.svelte` or
  `.svelte.ts` files.** Plain `.ts` files MUST NOT contain runes — they will not
  compile and will silently break at runtime.
- Before guessing a Svelte 5 or SvelteKit API, the official docs MUST be consulted
  (e.g. `resolve()` from `$app/paths`, not the removed `resolveRoute()`). APIs
  changed significantly from Svelte 4 and guessing has cost real incidents.

**Rationale**: A single, consistent frontend stack keeps the surface area small and
prevents subtle breakage from mixing Svelte 4 habits into a Svelte 5 codebase.

### III. Session-Based Auth (NON-NEGOTIABLE)

- **Session-based auth only.** Authentication state is a UUID session token stored in
  an **HttpOnly cookie** named `session_token` with a **7-day** lifetime. JWTs MUST
  NOT be introduced. Auth state MUST NOT be stored in `localStorage`,
  `sessionStorage`, or any other client-readable storage.
- **Passphrases are server-generated** from the EFF wordlist
  (`server/src/data/eff-wordlist.json`) as **4 words + 4 digits**. Client-chosen
  passwords MUST NOT be accepted.
- **OTP email verification** uses MailerSend via the `mailersend` package (NOT
  `@mailersend/mailersend`). OTPs expire after **10 minutes** and allow at most
  **3 attempts** before invalidation.
- **All frontend auth fetches MUST use `credentials: 'include'`.** A fetch to an
  auth-protected endpoint without `credentials: 'include'` is a bug.

**Rationale**: The auth revamp was completed deliberately to remove JWT/localStorage
footguns. Reintroducing them undoes that work and reopens resolved vulnerabilities.

### IV. Tooling & Workflow Discipline

- **pnpm is the only package manager.** `npm` and `yarn` MUST NOT be used. Scripts
  run via `pnpm run <script>`; dependencies are added via `pnpm add <pkg>`.
- **Vite config MUST keep** `optimizeDeps: { exclude: ['@hyzyla/pdfium'] }` and the
  `vite-plugin-wasm` + `vite-plugin-top-level-await` plugins. Without these, esbuild
  breaks on the Wasm package at dev-server start.
- **Branches follow Linear naming**: `{ISSUE-ID}/{kebab-case-title}` — no `feat/`,
  `fix/`, or other prefix. All Linear issues for this repo are scoped to the
  **pdfwasm** project (ID `f69626b3-8a87-4dcc-b437-9a95e91e3c16`).
- **Prefer `git pull --rebase`** over merge for divergent branches. Merge commits on
  feature branches should be the exception, not the default.

**Rationale**: These constraints have each been the root cause of a prior incident
(mixed lockfiles, Wasm bundler failures, merge-noise history, Linear scope drift).
Enforcing them as policy keeps the fix durable.

### V. Code Quality Gates

- **TypeScript MUST compile with 0 errors** on both the server and the frontend
  before any PR is merged. `any`-escape-hatches are permitted only where PDFium
  internal fields (`(page as any).module`, `(page as any).pageIdx`) require it.
- **ESLint (flat config, v9) MUST pass.** `eslint-plugin-tree-shaking` MUST remain
  disabled until it ships an ESLint v9-compatible release (it currently relies on
  the removed `context.getScope()`).
- **Prefer editing existing files over creating new ones.** Speculative abstractions,
  backwards-compatibility shims for code that has no existing callers, and
  unrequested refactors bundled into bug fixes are all prohibited.
- **Default to no code comments.** Comments are added only to explain a non-obvious
  _why_ (hidden constraint, subtle invariant, specific-bug workaround). Comments
  describing _what_ the code does, or referencing the current task / PR / issue,
  MUST NOT be added.

**Rationale**: Each gate is cheap to run and expensive to skip. Drift on any of them
compounds faster than it can be cleaned up later.

## Additional Constraints

- **Wasm asset loading**: `@hyzyla/pdfium` MUST be initialized via
  `PDFiumLibrary.init({ wasmUrl })` where `wasmUrl` is imported as
  `import wasmUrl from '@hyzyla/pdfium/pdfium.wasm?url'`. Vite's browser condition
  resolves `@hyzyla/pdfium` to the browser entry automatically; this MUST NOT be
  overridden.
- **Version pinning**: `@hyzyla/pdfium` is pinned to `^2.1.9`. The `0.0.x` line does
  not exist and MUST NOT be referenced in docs, issues, or dependency updates.
- **Runtime verification**: Code that depends on specific PDFium exports (e.g.
  `_FPDFText_GetCharBox`) MUST verify the export at runtime on library init and
  fail loudly if missing.

## Development Workflow & Quality Gates

- Every PR MUST, before merge:
    1. Pass `tsc` on server and frontend (0 errors).
    2. Pass ESLint on the full project.
    3. Map its changes against the five Core Principles — a PR that weakens any
       principle MUST include an explicit constitution amendment in the same change.
- Feature work follows spec-kit: `/speckit.specify` → `/speckit.plan` →
  `/speckit.tasks` → `/speckit.implement`. The `Constitution Check` gate in
  `.specify/templates/plan-template.md` MUST be filled against the five principles
  above, not left generic.
- Commits that mix a bug fix with an unrequested refactor MUST be split.

## Governance

- This constitution supersedes ad-hoc conventions, including any conflicting guidance
  in `CLAUDE.md`, `README.md`, or prior chat transcripts. Where CLAUDE.md and this
  constitution agree, both stand; where they disagree, this document wins and
  CLAUDE.md MUST be updated.
- **Amendment procedure**: Amendments are proposed as PRs that edit
  `.specify/memory/constitution.md`, include a Sync Impact Report at the top of the
  file, and update any dependent templates in the same PR. Amendments require the
  repo owner's approval.
- **Versioning policy** (semantic):
    - **MAJOR**: A principle is removed, inverted, or its non-negotiable core is
      weakened (e.g. allowing PDF.js, allowing JWT auth).
    - **MINOR**: A new principle or materially expanded section is added.
    - **PATCH**: Clarifications, wording, typos, or non-semantic refinements.
- **Compliance review**: Reviewers MUST verify principle compliance on every PR.
  Complexity or deviations MUST be justified in the PR description, not hidden in
  the diff.
- Runtime development guidance (stack quirks, PDFium API reality, auth internals)
  lives in `CLAUDE.md` and is treated as a living operational companion to this
  constitution — not as a source of authority.

**Version**: 1.0.0 | **Ratified**: 2026-04-11 | **Last Amended**: 2026-04-11
