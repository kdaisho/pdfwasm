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

### AI split suggestions

Edit Mode's "Suggest splits" asks a model which pages begin a new chapter,
section, or document. Two providers are wired up (`apps/api/src/lib/suggest/`):

| Provider    | Model              | Key                 | How it asks                                                                      |
| ----------- | ------------------ | ------------------- | -------------------------------------------------------------------------------- |
| `jev`       | `jev-latest`       | `TYPESAFE_API_KEY`  | One Noul question per page in a single `systemOne` call, evaluated in parallel.  |
| `anthropic` | `claude-haiku-4-5` | `ANTHROPIC_API_KEY` | One prompt listing every page, chunked into overlapping windows above 150 pages. |

OpenRouter is used whenever its key is present; Anthropic is the fallback until Jev
clears the accuracy benchmark below (KDA-63). `SUGGEST_PROVIDER=openrouter|anthropic`
pins one regardless of which keys are set. With no key, the server still boots
and `/api/pdf/suggest-splits` answers 503.

#### Benchmarking and tuning `SUGGEST_THRESHOLD`

Jev returns a 0–1 probability per page; `SUGGEST_THRESHOLD` in
`apps/api/src/constants.ts` decides which become splits. Tune it from real
documents rather than by eye:

```
pnpm --filter @api run benchmark:suggest <fixtures-dir>
```

Each fixture is one JSON file — `{ name, pages, expectedSplitAfter }` — where
`pages` is the payload the editor already POSTs to `/pdfs/suggest-splits`
(copy the request body from devtools) and `expectedSplitAfter` is the
boundaries you would have drawn by hand. The harness scores both providers per
fixture and sweeps every candidate threshold over Jev's probabilities, ranking
by F2 (a missed boundary costs more than a spurious one, which the user can
delete in one click).
