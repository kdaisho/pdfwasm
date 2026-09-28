// Drop-in replacement for `src/db/index.ts` in tests:
//   vi.mock("../db/index.js", () => import("../test/pglite.js"));
// Runs the real migrations against an in-memory Postgres (PGlite).
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { sql } from "drizzle-orm";
import * as schema from "../db/schema.js";

export const db = drizzle(new PGlite(), { schema });

// PGlite inherits the host's time zone, but `timestamp` columns are read back
// as UTC, so `defaultNow()` values would be off by the host's offset. Match
// the UTC server the app runs against.
await db.execute(sql`SET TIME ZONE 'UTC'`);

await migrate(db, {
	migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)),
});
