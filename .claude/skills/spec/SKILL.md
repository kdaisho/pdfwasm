---
name: spec
description: Create a lean feature specification (spec.md) for a Linear issue. Use when the user wants to spec out a new feature before implementation, or types /spec. Produces a single spec.md focused on problem + acceptance criteria — not design, not tasks.
---

# Spec — Lean Feature Specification

A deliberately small alternative to spec-kit. One file per feature, focused on **what & why**, not **how**.

## When to use
- User asks to "spec out" a feature, or invokes `/spec`.
- Starting work on a Linear issue and wanting an aligned written scope before coding.

## When NOT to use
- Bug fixes (just fix it)
- Refactors with no user-visible change
- One-line tweaks

## Workflow

### Step 1 — Gather input
Ask the user for the **Linear issue ID** (e.g. `KDA-29`). If not provided, ask once.

Then fetch it via the Linear MCP:
- `mcp__linear__get_issue` with the ID
- Capture: title, description, URL, any linked context

If the issue has **attached images** (e.g. Excalidraw PNG exports for wireframes), pull them with `mcp__linear__extract_images` or `get_attachment` and read them. Excalidraw **iframe embeds** in the description are not renderable — only attached images are. If only an iframe is present, ask the user to attach a PNG export.

If the user pastes issue content directly instead of an ID, use that — don't insist on the MCP path.

### Step 2 — Explore the codebase
Before writing anything, build context:
- List existing `specs/` to find related prior specs (read titles, skim relevant ones)
- Locate the files/modules the feature will touch (use Grep/Glob; spawn `Explore` agent only if the surface area is wide)
- Note existing patterns to follow or constraints to respect

Keep this scoped. The goal is to inform the spec, not to design the implementation.

### Step 3 — Write the problem statement
One paragraph. Three things only:
- **Who** hits this (which user, in which mode/flow)
- **What** is missing or broken today
- **Why** it matters (the cost of not doing it)

No solution language. If you find yourself writing "we will…" or "the system should…", that belongs in acceptance criteria, not here.

### Step 4 — List acceptance criteria
Behavioral, testable, user-visible. Each one must be something a human could verify by using the app.

Format: checklist of `Given / When / Then` statements.

```
- [ ] Given <state>, when <action>, then <observable outcome>
```

Aim for 3–7 criteria. If you have more than 8, the feature is probably too big — flag this to the user and suggest splitting.

## Output: spec.md format

Write to: `specs/{ISSUE-ID}-{kebab-title}/spec.md`
(Keyed by Linear ID so spec ↔ branch ↔ issue is 1:1.)

```markdown
# {Feature Title}

**Linear:** [{ISSUE-ID}]({url}) — {issue title}
**Branch:** `{ISSUE-ID}/{kebab-title}`
**Created:** {YYYY-MM-DD}
**Status:** Draft

## Problem Statement
{One paragraph: who, what, why. No solutions.}

## Context
{Relevant existing code and prior specs. Bullet list, terse.}
- Files likely touched: `src/...`
- Related specs: `specs/...` (or "none")
- Constraints / prior art: ...

## Acceptance Criteria
- [ ] Given ..., when ..., then ...
- [ ] ...

## Out of Scope
{Explicit non-goals. At least one bullet — forces the question.}
- ...

## Open Questions
{Anything that must be resolved before status moves to Ready. Empty list is fine.}
- ...
```

## Rules

- **No design / solution section.** That goes in the PR description or a separate doc when needed.
- **No task breakdown.** Tasks belong in Linear sub-issues or the in-session todo list.
- **Status starts as `Draft`.** Only the user moves it to `Ready`.
- **Don't pad.** If a section has nothing real to say, write one honest line ("No related specs.") rather than fabricating bullets.
- **Today's date** comes from the environment, not a guess.

## After writing
- Show the user the file path.
- Ask if they want any section expanded or revised before moving to `Ready`.
- Do **not** start implementing. The spec is the deliverable.
