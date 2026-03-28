import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
	plugins: [
		svelte({
			compilerOptions: {
				hmr: false,
			},
		}),
	],
	build: {
		ssr: "src/index.ts",
		outDir: "dist",
	},
});
