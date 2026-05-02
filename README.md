# pdfwasm

## Development Workflow

### Database migrations

`drizzle-kit generate` reads the TypeScript schema (`apps/api/src/db/schema.ts`) and generates a new SQL migration file by diffing the current schema against the last snapshot.

Concretely, when you run `pnpm db:generate`:

1. It compares `schema.ts` to the most recent snapshot in `apps/api/drizzle/meta/` (e.g. `0003_snapshot.json`)
2. It writes a new numbered SQL file to `apps/api/drizzle/` (e.g. `0004_something.sql`) containing the `CREATE TABLE` / `ALTER TABLE` / `DROP` statements needed to bring the DB from the old state to the new one
3. It writes a new snapshot JSON capturing the new schema state, so the next generate knows what to diff against
4. It updates `_journal.json` to register the new migration

**Important:** `generate` only writes the SQL file — it does not touch your database. To actually apply it, run `pnpm db:migrate` (which is `drizzle-kit migrate`).

The typical loop:

- Edit `schema.ts` (e.g. add a column)
- `pnpm db:generate` → produces `0004_xxx.sql`
- Review the generated SQL (sometimes Drizzle gets ambiguous renames wrong)
- `pnpm db:migrate` → applies it to Postgres

#### Scripts

| Script             | What it does                                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm db:generate` | Diff `schema.ts` against the latest snapshot and write a new migration + snapshot. Does not touch the DB.                                                                             |
| `pnpm db:migrate`  | Apply pending migrations to Postgres.                                                                                                                                                 |
| `pnpm db:drop`     | Interactive picker (`drizzle-kit drop`) to remove an unapplied migration: deletes the SQL, the snapshot, and the journal entry. Does not touch the DB. Use only **before** `migrate`. |
| `pnpm db:check`    | Validate migrations for collisions or corruption (`drizzle-kit check`). Cheap sanity check — run it if `meta/` looks wrong.                                                           |
| `pnpm db:reset`    | Nuke the Docker volume, recreate the DB, and re-run all migrations. Local-only, destroys all data.                                                                                    |

#### Rules

1. **Always edit `schema.ts` and run `pnpm db:generate`.** Never hand-write migration SQL — it bypasses the snapshotting step and leaves `drizzle/meta/` out of sync with `drizzle/`.
2. **If you need `pnpm db:drop`, only drop the latest migration.** Dropping older migrations is unsafe because earlier snapshots may be missing or stale.
