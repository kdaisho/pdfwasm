import { defineConfig } from "vitest/config";

// Standalone config (does not load the SvelteKit plugin) so pure-TS service
// tests run without the full app/Wasm toolchain.
export default defineConfig({
	test: {
		environment: "node",
		include: ["src/**/*.test.ts"],
	},
});
