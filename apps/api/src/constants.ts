// ── Session ──────────────────────────────────────────────────────────────────
export const SESSION_COOKIE_NAME = "session_token";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days in seconds
export const SESSION_DURATION_MS = SESSION_MAX_AGE * 1000;

// ── OTP ──────────────────────────────────────────────────────────────────────
export const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const MAX_OTP_ATTEMPTS = 3;

// ── PDF uploads ──────────────────────────────────────────────────────────────
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
export const PDF_STORAGE_PATH =
	process.env.PDF_STORAGE_PATH || "./storage/pdfs";

// ── Server ───────────────────────────────────────────────────────────────────
export const DEFAULT_PORT = 3001;
