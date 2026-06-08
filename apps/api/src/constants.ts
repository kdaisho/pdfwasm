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
export const SUGGEST_MODEL = "claude-haiku-4-5";
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
// Defensive per-page snippet cap (the client already truncates).
export const SUGGEST_SNIPPET_MAX = 400;
// Guardrail on request size.
export const MAX_SUGGEST_PAGES = 600;
