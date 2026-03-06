import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import wasm from "vite-plugin-wasm";

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), wasm()],
	optimizeDeps: { exclude: ["@hyzyla/pdfium"] },
	build: { target: "esnext" },
});
