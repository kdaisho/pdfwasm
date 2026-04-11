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
