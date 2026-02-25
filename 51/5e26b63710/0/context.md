# Session Context

## User Prompts

### Prompt 1

Implement the following plan:

# Plan: Integrate Skeleton UI into pdfwasm

## Context

The project currently uses hand-written scoped CSS with hardcoded colors. We want to bring in **Skeleton v4** (skeleton.dev) as the UI component library to get a polished, themeable design system with dark mode support. Skeleton is built on Tailwind CSS 4 and provides both Tailwind utility classes and pre-built Svelte components.

## Step 1: Install dependencies

```bash
pnpm add -D @skeletonlabs/skeleton @ske...

### Prompt 2

[plugin:vite:css] [postcss] postcss-import: /Users/daishokomiyama/Code/pdfwasm/node_modules/.pnpm/@skeletonlabs+skeleton-svelte@4.12.0_svelte@5.53.0/node_modules/@skeletonlabs/skeleton-svelte/dist/index.js:1:1: Unknown word export
/Users/daishokomiyama/Code/pdfwasm/node_modules/.pnpm/@skeletonlabs+skeleton-svelte@4.12.0_svelte@5.53.0/node_modules/@skeletonlabs/skeleton-svelte/dist/index.js:1:0
1  |  export * from './components/accordion/index.js';
   |  ^
2  |  export * from './components/app-ba...

### Prompt 3

now, it got worse. the button for opening PDF doesn't look like a button anymore

### Prompt 4

tailwindcss will tree-shake with my setup?

### Prompt 5

what do you mean by "You'd only lose tree-shaking"? Would I lose the classname in prod?

### Prompt 6

i see `<header data-scope="app-bar" data-part="root">`, who inserts data-scope: app-bar and data-part: root? Skeleton?

### Prompt 7

ok i want to add space between viewport edge and elements. i don't see browser default style that insert padding or margin, so i think it's good as a clean slate, but now I don't want the text 'PDF Viewer' and Open PDF button stick to the edge of screen.

### Prompt 8

ok nice. i chose theme of rocket from Skeleton, but it's not colorful enought than i expected. do we need to do by ourselves?

### Prompt 9

i accidentally set 'text-primary-500' to h1, and it shows a nice blue color. where does it come from? Tailwind?

### Prompt 10

is there a list of css class from Skeleton? i can't remember everything

