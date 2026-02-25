# Session Context

## User Prompts

### Prompt 1

Implement the following plan:

# Plan: ESLint Setup for pdfwasm

## Context
The project (SvelteKit + Svelte 5 + TypeScript) has no ESLint configuration. Only Prettier and `svelte-check` are in place. The user wants ESLint with `eslint-plugin-tree-shaking` and sensible recommended rules. Using ESLint v9 flat config format (modern standard, required for ESM projects with `"type": "module"`).

---

## Packages to Install

```
pnpm add -D eslint @eslint/js typescript-eslint eslint-plugin-svelte svel...

### Prompt 2

seems eslint ts.config is deprecated. make sure it.

### Prompt 3

tell me why prettier doesn't take effect for eslint.config.js?

### Prompt 4

can we set no-console, but allow warn or error?

