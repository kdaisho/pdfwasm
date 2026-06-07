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
export const SUGGEST_MODEL_SMALL = "claude-haiku-4-5";
// Long page listings make the small model lose track of page numbers and drift
// (accuracy degrades the deeper into the doc it gets), so above this page count
// we switch to a stronger model with better long-context tracking. KDA-53.
export const SUGGEST_MODEL_LARGE = "claude-sonnet-4-6";
export const SUGGEST_LARGE_DOC_PAGES = 150;
// Defensive per-page snippet cap (the client already truncates).
export const SUGGEST_SNIPPET_MAX = 400;
// Guardrail on request size.
export const MAX_SUGGEST_PAGES = 600;
