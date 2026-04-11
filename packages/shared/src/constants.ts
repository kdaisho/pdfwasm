// ── Session ──────────────────────────────────────────────────────────────────
export const SESSION_COOKIE_NAME = "session_token";

// ── OTP ──────────────────────────────────────────────────────────────────────
export const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const OTP_RESEND_COOLDOWN_MS = 20 * 1000; // 20 seconds
export const MAX_OTP_ATTEMPTS = 3;

// ── PDF uploads ──────────────────────────────────────────────────────────────
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
