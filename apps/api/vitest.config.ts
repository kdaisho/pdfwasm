import { defineConfig } from "vitest/config";

// Standalone config (does not load the Svelte plugin used for email
// templates). Route tests swap the Postgres client for in-memory PGlite, so
// they need no database server.
export default defineConfig({
	test: {
		environment: "node",
		include: ["src/**/*.test.ts"],
		env: {
			RP_ID: "localhost",
			RP_NAME: "PDF Viewer",
			RP_ORIGIN: "http://localhost:5173",
		},
	},
});
