import { defineConfig } from "eslint/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import svelte from "eslint-plugin-svelte";
import prettier from "eslint-config-prettier";
import tailwindcss from "eslint-plugin-tailwindcss";
import globals from "globals";

const __dirname = dirname(fileURLToPath(import.meta.url));
// NOTE: eslint-plugin-tree-shaking uses context.getScope() which was removed in ESLint v9.
// The package is installed but not usable until the plugin publishes an ESLint v9-compatible release.

export default defineConfig(
	// 1. Global ignores
	{
		ignores: [".svelte-kit/", "build/", "node_modules/", "dist/"],
	},

	// 2. Base JS + TS recommended
	js.configs.recommended,
	tseslint.configs.recommended,

	// 3. Svelte recommended + Prettier override (Svelte files)
	...svelte.configs["flat/recommended"],
	...svelte.configs["flat/prettier"],

	// 4. Tailwind CSS rules (all active rules as errors)
	...tailwindcss.configs["flat/recommended"],
	{
		settings: {
			tailwindcss: {
				config: resolve(__dirname, "src/app.css"),
			},
		},
		rules: {
			"tailwindcss/classnames-order": "error",
			"tailwindcss/enforces-negative-arbitrary-values": "error",
			"tailwindcss/enforces-shorthand": "error",
			"tailwindcss/no-arbitrary-value": "error",
			"tailwindcss/no-contradicting-classname": "error",
			"tailwindcss/no-custom-classname": "error",
			"tailwindcss/no-unnecessary-arbitrary-value": "error",
		},
	},

	// 5. Prettier formatting override (all files)
	prettier,

	// 6. Browser globals + disable no-undef (TypeScript handles undeclared vars)
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
		},
		rules: {
			"no-undef": "off",
		},
	},

	// 7. Svelte file parser (must reference TS parser for <script lang="ts">)
	{
		files: ["**/*.svelte"],
		languageOptions: {
			parserOptions: {
				parser: tseslint.parser,
			},
		},
	},

	// 8. Project-wide custom rules
	{
		rules: {
			"no-console": ["warn", { allow: ["warn", "error"] }],
			eqeqeq: ["error", "always", { null: "ignore" }],
			"prefer-const": "error",
			"no-unused-expressions": "error",

			// TS-specific
			"@typescript-eslint/no-explicit-any": "warn", // charBoxes.ts uses (page as any)
			"@typescript-eslint/no-unused-vars": [
				"error",
				{ argsIgnorePattern: "^_" },
			],
			"@typescript-eslint/consistent-type-imports": [
				"warn",
				{ prefer: "type-imports" },
			],
		},
	},

	// 9. Svelte 5 rune pattern overrides (must come after project-wide rules)
	{
		files: ["**/*.svelte"],
		rules: {
			// $props() destructuring requires `let` for reactivity, not `const`
			"prefer-const": "off",
			// $effect() uses standalone reactive reads as dependency declarations:
			//   $effect(() => { someSignal; otherSignal; ... })
			"no-unused-expressions": "off",
			"@typescript-eslint/no-unused-expressions": "off",
		},
	},
);
