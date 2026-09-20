export {
	SESSION_COOKIE_NAME,
	OTP_TTL_MS,
	OTP_RESEND_COOLDOWN_MS,
	MAX_OTP_ATTEMPTS,
	MAX_FILE_SIZE,
} from "@pdfwasm/shared/constants";

// ── Session (server-only) ────────────────────────────────────────────────────
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days in seconds
export const SESSION_DURATION_MS = SESSION_MAX_AGE * 1000;

// ── PDF uploads (server-only) ────────────────────────────────────────────────
export const PDF_STORAGE_PATH =
	process.env.PDF_STORAGE_PATH || "./storage/pdfs";

// ── Server ───────────────────────────────────────────────────────────────────
export const DEFAULT_PORT = 3001;

// ── AI split suggestions (server-only) ───────────────────────────────────────
// Incremental help, not perfection: the editor recovers the last ~10%, so a
// fast/cheap model beats a slow/accurate one here. See KDA-53.
//
// Two providers are wired up while KDA-63's accuracy benchmark is outstanding:
// "openrouter" (TypeSafe's Jev, one Noul question per page) when
// OPENROUTER_API_KEY is set, "anthropic" (Haiku) otherwise. SUGGEST_PROVIDER
// pins one explicitly — the benchmark harness uses it to run both over the
// same fixtures. Once Jev is shown to hold up, the Anthropic path and its
// chunking constants below go away.
export const SUGGEST_ANTHROPIC_MODEL = "claude-haiku-4-5";
// Guardrail on request size.
export const MAX_SUGGEST_PAGES = 600;
// Defensive per-page snippet cap (the client already truncates).
export const SUGGEST_SNIPPET_MAX = 400;

// ── OpenRouter provider (TypeSafe's Jev, via the Decisions API) ──────────────
// Jev answers each page's question with a 0–1 probability; pages scoring above
// this threshold are treated as unit starts. Biased below 0.5 on purpose: a
// spurious split is trivial to remove in the editor, a missed one is easy to
// overlook. UNTUNED — tune it from `src/scripts/benchmark-suggest.ts`.
export const SUGGEST_THRESHOLD = 0.4;
// Reached through OpenRouter (POST /api/alpha/decisions), which proxies
// TypeSafe's own Decisions API with an identical wire format. The leading "~"
// is part of the alias and is required — "typesafe/jev-latest" without it is
// rejected as a nonexistent model. Pin "typesafe/jev-1.13" to freeze the
// version; both resolve to typesafe/jev-1.13-20260917 today.
export const SUGGEST_OPENROUTER_MODEL = "~typesafe/jev-latest";
// Jev's context window, per its OpenRouter model page. This is the binding
// constraint on request size: a 600-page listing plus one question per page
// does NOT fit in a single call, so requests are planned against a budget
// below the ceiling (tokenizer variance, JSON overhead) rather than assuming
// one call per document.
export const SUGGEST_OPENROUTER_CONTEXT_TOKENS = 32_000;
export const SUGGEST_OPENROUTER_TOKEN_BUDGET = 26_000;
// Rough token estimates used by the planner: characters per token, the JSON
// overhead of one page entry in the state, and the cost of one question.
export const SUGGEST_OPENROUTER_CHARS_PER_TOKEN = 4;
export const SUGGEST_OPENROUTER_PAGE_OVERHEAD_TOKENS = 8;
export const SUGGEST_OPENROUTER_QUESTION_TOKENS = 30;
// Pages repeated between adjacent windows when a document does not fit in one
// call, so a boundary near a window edge is still seen with context on both
// sides. A page asked twice keeps its highest probability.
export const SUGGEST_OPENROUTER_WINDOW_OVERLAP = 10;
// Per-attempt timeout, and the window the SDK keeps retrying within. 429/529
// are retried with exponential backoff (the OpenRouter SDK budgets retries by
// elapsed time rather than attempt count).
export const SUGGEST_TIMEOUT_MS = 120_000;
export const SUGGEST_RETRY_MAX_ELAPSED_MS = 60_000;

// ── Anthropic provider (fallback until Jev is benchmarked) ───────────────────
// Large docs are split into overlapping windows processed in parallel, so the
// model never tracks page numbers across a long listing (accuracy drifts the
// deeper it gets otherwise). Docs with at least this many pages are chunked;
// smaller docs go in a single call. KDA-53.
export const SUGGEST_CHUNK_THRESHOLD = 150;
// Chunking window: pages per window and overlap between adjacent windows. The
// overlap ensures a boundary at a window edge is still seen mid-listing in a
// neighbouring window (so it is never the suppressed first page).
export const SUGGEST_CHUNK_WINDOW = 60;
export const SUGGEST_CHUNK_OVERLAP = 10;
