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
const webFiles = ["apps/web/**/*.{js,ts,svelte}"];
// NOTE: eslint-plugin-tree-shaking uses context.getScope() which was removed in ESLint v9.
// The package is installed but not usable until the plugin publishes an ESLint v9-compatible release.

export default defineConfig(
	{
		ignores: [
			"**/.svelte-kit/",
			"**/build/",
			"**/node_modules/",
			"**/dist/",
		],
	},

	js.configs.recommended,
	tseslint.configs.recommended,

	...svelte.configs["flat/recommended"],
	...svelte.configs["flat/prettier"],

	...tailwindcss.configs["flat/recommended"].map((c) => ({
		...c,
		files: webFiles,
	})),
	{
		files: webFiles,
		settings: {
			tailwindcss: {
				config: resolve(__dirname, "apps/web/src/app.css"),
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

	prettier,

	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
			},
		},
		rules: {
			"no-undef": "off",
		},
	},

	{
		files: ["**/*.svelte"],
		languageOptions: {
			parserOptions: {
				parser: tseslint.parser,
			},
		},
	},

	{
		rules: {
			"no-console": ["warn", { allow: ["warn", "error", "info"] }],
			eqeqeq: ["error", "always", { null: "ignore" }],
			"prefer-const": "error",
			"no-unused-expressions": "error",

			"@typescript-eslint/no-explicit-any": "warn",
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

	{
		files: ["**/*.svelte"],
		rules: {
			"prefer-const": "off",
			"no-unused-expressions": "off",
			"@typescript-eslint/no-unused-expressions": "off",
		},
	},

	{
		files: ["**/*.svelte.ts"],
		languageOptions: {
			parser: tseslint.parser,
		},
	},
);
