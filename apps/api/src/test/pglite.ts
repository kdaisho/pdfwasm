// Drop-in replacement for `src/db/index.ts` in tests:
//   vi.mock("../db/index.js", () => import("../test/pglite.js"));
// Runs the real migrations against an in-memory Postgres (PGlite).
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../db/schema.js";

export const db = drizzle(new PGlite(), { schema });

await migrate(db, {
	migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)),
});
