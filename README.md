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

### Email (sign-in and signup codes)

Signup and email-code sign-in send a 6-digit code through MailerSend
(`apps/api/src/lib/email.ts`). It's configured by two variables in
`apps/api/.env`: `MAILERSEND_API_KEY`, and `MAILERSEND_FROM_EMAIL`, which takes
a full address or a bare domain (a bare domain becomes `noreply@<domain>`).

**Local development needs no email.** With `NODE_ENV=development`, the API
prints the code in its terminal instead of sending it:

```
[email] dev mode — signup code for you@example.com: 305178
```

Copy the code from there. It's random each time, and still expires after 10
minutes and allows 3 attempts.

**Real email needs a verified sender domain.** MailerSend only sends from a
domain in your account that is verified through DNS records (SPF, DKIM) at
your registrar. `localhost` can't be verified, but a local app can send
through any domain you own. MailerSend's test domains (`test-….mlsender.net`)
are temporary: they usually deliver only to the MailerSend account owner's
exact address (a `+alias` counts as a different address), and MailerSend can
remove them, for example when an account drops to sandbox mode.

#### When a code email doesn't arrive

1. **Is the address new to that flow?** By design, signup with an email that
   already has an account sends nothing, and so does sign-in with an unknown
   email. Both still show the "check your inbox" screen, so the endpoints
   can't be used to find out which emails have accounts.
2. **Check the address on the "check your inbox" screen.** A typo like
   `gmail.co` goes nowhere.
3. **Check the API terminal.** Sends are fire-and-forget, so the page reports
   success even when MailerSend refuses. A refusal is logged as
   `[email] <type> OTP send failed:` followed by MailerSend's response.
   `#MS42207` ("The from.email domain must be verified") means the sender
   domain is missing or unverified: check MailerSend → Email → Domains.
4. **Don't look for the code in the database.** `email_verifications` only
   stores a bcrypt hash, which can't be turned back into the code.
