# Project Conventions

## CSS / Styling

- **Prefer Tailwind utilities over `<style>` blocks.** Only use `<style>` for:
    - `:global()` selectors (styling child component internals)
    - `@keyframes` animations
    - Complex selectors that Tailwind genuinely cannot express
- If a CSS property has a direct Tailwind equivalent (`display: flex` → `flex`, `padding: 16px` → `p-4`, etc.), use the Tailwind class.
- **Blank lines between CSS rules:** Add a blank line between each rule block (e.g., between `.selector1 { ... }` and `.selector2 { ... }` or `@keyframes`).
