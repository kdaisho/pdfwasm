import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { db } from "../db/index.js";
import { users, emailVerifications, userPreferences } from "../db/schema.js";
import { generateOtp, hashOtp, verifyOtp } from "../lib/otp.js";
import { generatePassphrase } from "../lib/passphrase.js";
import { hashPassphrase, verifyPassphrase } from "../lib/passphrase-hash.js";
import { sendOtpEmail } from "../lib/email.js";
import {
	createSession,
	deleteSession,
	deleteUserSessions,
} from "../lib/session.js";
import { authMiddleware } from "../middleware/auth.js";
import type { AuthEnv } from "../types.js";
import {
	SESSION_COOKIE_NAME,
	SESSION_MAX_AGE,
	OTP_TTL_MS,
	MAX_OTP_ATTEMPTS,
	OTP_RESEND_COOLDOWN_MS,
} from "../constants.js";

function checkResendCooldown(createdAt: Date): {
	retryAfterSec: number;
} | null {
	const elapsedMs = Date.now() - createdAt.getTime();
	if (elapsedMs >= OTP_RESEND_COOLDOWN_MS) return null;
	return {
		retryAfterSec: Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsedMs) / 1000),
	};
}

const auth = new Hono<AuthEnv>();

function setSessionCookie(c: Parameters<typeof setCookie>[0], token: string) {
	setCookie(c, SESSION_COOKIE_NAME, token, {
		httpOnly: true,
		sameSite: "Lax",
		path: "/",
		maxAge: SESSION_MAX_AGE,
		secure: process.env.NODE_ENV === "production",
	});
}

// ── /me ─────────────────────────────────────────────────────────────────────

auth.use("/me", authMiddleware);

auth.get("/me", async (c) => {
	const userId = c.get("userId");
	const [row] = await db
		.select({
			id: users.id,
			email: users.email,
			lastPdfId: userPreferences.lastPdfId,
		})
		.from(users)
		.leftJoin(userPreferences, eq(users.id, userPreferences.userId))
		.where(eq(users.id, userId))
		.limit(1);

	if (!row) {
		return c.json({ error: "User not found" }, 404);
	}

	return c.json({
		user: { id: row.id, email: row.email, lastPdfId: row.lastPdfId },
	});
});

// ── Signup ───────────────────────────────────────────────────────────────────

auth.post("/signup/init", async (c) => {
	const { email } = await c.req.json();
	if (!email || typeof email !== "string") {
		return c.json({ error: "Email is required" }, 400);
	}

	const existing = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.email, email.toLowerCase()))
		.limit(1);

	if (existing.length > 0) {
		return c.json({ error: "Email already registered" }, 409);
	}

	const [recentSignup] = await db
		.select({ createdAt: emailVerifications.createdAt })
		.from(emailVerifications)
		.where(
			and(
				eq(emailVerifications.email, email.toLowerCase()),
				eq(emailVerifications.type, "signup"),
			),
		)
		.orderBy(desc(emailVerifications.createdAt))
		.limit(1);

	if (recentSignup) {
		const cooldown = checkResendCooldown(recentSignup.createdAt);
		if (cooldown) {
			c.header("Retry-After", String(cooldown.retryAfterSec));
			return c.json(
				{
					error: `Please wait ${cooldown.retryAfterSec} second${cooldown.retryAfterSec === 1 ? "" : "s"} before requesting another code.`,
					retryAfter: cooldown.retryAfterSec,
				},
				429,
			);
		}
	}

	const otp = generateOtp();
	const otpHash = await hashOtp(otp);
	const expiresAt = new Date(Date.now() + OTP_TTL_MS);

	// Delete any previous signup verifications for this email before inserting a fresh one
	await db
		.delete(emailVerifications)
		.where(
			and(
				eq(emailVerifications.email, email.toLowerCase()),
				eq(emailVerifications.type, "signup"),
			),
		);

	await db.insert(emailVerifications).values({
		email: email.toLowerCase(),
		otpHash,
		type: "signup",
		expiresAt,
	});

	await sendOtpEmail(email, otp, "signup");

	return c.json({ ok: true });
});

auth.post("/signup/verify-otp", async (c) => {
	const { email, otp } = await c.req.json();
	if (!email || !otp) {
		return c.json({ error: "Email and OTP are required" }, 400);
	}

	const [record] = await db
		.select()
		.from(emailVerifications)
		.where(
			and(
				eq(emailVerifications.email, email.toLowerCase()),
				eq(emailVerifications.type, "signup"),
			),
		)
		.orderBy(desc(emailVerifications.createdAt))
		.limit(1);

	if (!record) {
		return c.json({ error: "No pending verification for this email" }, 404);
	}

	if (record.expiresAt < new Date()) {
		await db
			.delete(emailVerifications)
			.where(eq(emailVerifications.id, record.id));
		return c.json({ error: "OTP has expired. Please start over." }, 410);
	}

	if (record.attempts >= MAX_OTP_ATTEMPTS) {
		return c.json({ error: "Too many attempts. Please start over." }, 429);
	}

	const valid = await verifyOtp(otp, record.otpHash);
	if (!valid) {
		await db
			.update(emailVerifications)
			.set({ attempts: record.attempts + 1 })
			.where(eq(emailVerifications.id, record.id));
		const remaining = MAX_OTP_ATTEMPTS - (record.attempts + 1);
		return c.json(
			{
				error: `Invalid code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
			},
			400,
		);
	}

	// OTP valid — generate passphrase
	const passphrase = generatePassphrase();
	const passphraseHash = await hashPassphrase(passphrase);
	const verifiedToken = crypto.randomUUID();

	await db
		.update(emailVerifications)
		.set({ verifiedAt: new Date(), verifiedToken, passphraseHash })
		.where(eq(emailVerifications.id, record.id));

	return c.json({ verifiedToken, passphrase });
});

auth.post("/signup/complete", async (c) => {
	const { verifiedToken } = await c.req.json();
	if (!verifiedToken) {
		return c.json({ error: "Verified token is required" }, 400);
	}

	const [record] = await db
		.select()
		.from(emailVerifications)
		.where(
			and(
				eq(emailVerifications.verifiedToken, verifiedToken),
				eq(emailVerifications.type, "signup"),
			),
		)
		.limit(1);

	if (!record || !record.verifiedAt || !record.passphraseHash) {
		return c.json({ error: "Invalid or expired token" }, 400);
	}

	// Create user
	const [user] = await db
		.insert(users)
		.values({ email: record.email, passphraseHash: record.passphraseHash })
		.returning({ id: users.id, email: users.email });

	// Clean up verification record
	await db
		.delete(emailVerifications)
		.where(eq(emailVerifications.id, record.id));

	// Create session
	const sessionToken = await createSession(user.id);
	setSessionCookie(c, sessionToken);

	return c.json(
		{ user: { id: user.id, email: user.email, lastPdfId: null } },
		201,
	);
});

// ── Login ─────────────────────────────────────────────────────────────────

auth.post("/login", async (c) => {
	const { email, passphrase } = await c.req.json();
	if (!email || !passphrase) {
		return c.json({ error: "Email and passphrase are required" }, 400);
	}

	const [user] = await db
		.select()
		.from(users)
		.where(eq(users.email, email.toLowerCase()))
		.limit(1);

	if (!user) {
		return c.json({ error: "Invalid email or passphrase" }, 401);
	}

	const valid = await verifyPassphrase(passphrase, user.passphraseHash);
	if (!valid) {
		return c.json({ error: "Invalid email or passphrase" }, 401);
	}

	const [prefs] = await db
		.select({ lastPdfId: userPreferences.lastPdfId })
		.from(userPreferences)
		.where(eq(userPreferences.userId, user.id))
		.limit(1);

	const sessionToken = await createSession(user.id);
	setSessionCookie(c, sessionToken);

	return c.json({
		user: {
			id: user.id,
			email: user.email,
			lastPdfId: prefs?.lastPdfId ?? null,
		},
	});
});

// ── Logout ────────────────────────────────────────────────────────────────

auth.post("/logout", async (c) => {
	const token = getCookie(c, SESSION_COOKIE_NAME);
	if (token) {
		await deleteSession(token);
	}
	deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
	return c.json({ ok: true });
});

// ── Password Reset ────────────────────────────────────────────────────────

auth.post("/reset/init", async (c) => {
	const { email } = await c.req.json();
	if (!email || typeof email !== "string") {
		return c.json({ error: "Email is required" }, 400);
	}

	const [user] = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.email, email.toLowerCase()))
		.limit(1);

	if (!user) {
		// Generic message to prevent email enumeration
		return c.json({ ok: true });
	}

	const [recentReset] = await db
		.select({ createdAt: emailVerifications.createdAt })
		.from(emailVerifications)
		.where(
			and(
				eq(emailVerifications.email, email.toLowerCase()),
				eq(emailVerifications.type, "password_reset"),
			),
		)
		.orderBy(desc(emailVerifications.createdAt))
		.limit(1);

	if (recentReset) {
		const cooldown = checkResendCooldown(recentReset.createdAt);
		if (cooldown) {
			c.header("Retry-After", String(cooldown.retryAfterSec));
			return c.json(
				{
					error: `Please wait ${cooldown.retryAfterSec} second${cooldown.retryAfterSec === 1 ? "" : "s"} before requesting another code.`,
					retryAfter: cooldown.retryAfterSec,
				},
				429,
			);
		}
	}

	const otp = generateOtp();
	const otpHash = await hashOtp(otp);
	const expiresAt = new Date(Date.now() + OTP_TTL_MS);

	// Delete any previous reset verifications for this email before inserting a fresh one
	await db
		.delete(emailVerifications)
		.where(
			and(
				eq(emailVerifications.email, email.toLowerCase()),
				eq(emailVerifications.type, "password_reset"),
			),
		);

	await db.insert(emailVerifications).values({
		email: email.toLowerCase(),
		otpHash,
		type: "password_reset",
		expiresAt,
	});

	await sendOtpEmail(email, otp, "password_reset");

	return c.json({ ok: true });
});

auth.post("/reset/verify-otp", async (c) => {
	const { email, otp } = await c.req.json();
	if (!email || !otp) {
		return c.json({ error: "Email and OTP are required" }, 400);
	}

	const [record] = await db
		.select()
		.from(emailVerifications)
		.where(
			and(
				eq(emailVerifications.email, email.toLowerCase()),
				eq(emailVerifications.type, "password_reset"),
			),
		)
		.orderBy(desc(emailVerifications.createdAt))
		.limit(1);

	if (!record) {
		return c.json({ error: "No pending reset for this email" }, 404);
	}

	if (record.expiresAt < new Date()) {
		await db
			.delete(emailVerifications)
			.where(eq(emailVerifications.id, record.id));
		return c.json({ error: "OTP has expired. Please start over." }, 410);
	}

	if (record.attempts >= MAX_OTP_ATTEMPTS) {
		return c.json({ error: "Too many attempts. Please start over." }, 429);
	}

	const valid = await verifyOtp(otp, record.otpHash);
	if (!valid) {
		await db
			.update(emailVerifications)
			.set({ attempts: record.attempts + 1 })
			.where(eq(emailVerifications.id, record.id));
		const remaining = MAX_OTP_ATTEMPTS - (record.attempts + 1);
		return c.json(
			{
				error: `Invalid code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
			},
			400,
		);
	}

	// OTP valid — generate new passphrase
	const passphrase = generatePassphrase();
	const passphraseHash = await hashPassphrase(passphrase);
	const verifiedToken = crypto.randomUUID();

	await db
		.update(emailVerifications)
		.set({ verifiedAt: new Date(), verifiedToken, passphraseHash })
		.where(eq(emailVerifications.id, record.id));

	return c.json({ verifiedToken, passphrase });
});

auth.post("/reset/complete", async (c) => {
	const { verifiedToken } = await c.req.json();
	if (!verifiedToken) {
		return c.json({ error: "Verified token is required" }, 400);
	}

	const [record] = await db
		.select()
		.from(emailVerifications)
		.where(
			and(
				eq(emailVerifications.verifiedToken, verifiedToken),
				eq(emailVerifications.type, "password_reset"),
			),
		)
		.limit(1);

	if (!record || !record.verifiedAt || !record.passphraseHash) {
		return c.json({ error: "Invalid or expired token" }, 400);
	}

	const [user] = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.email, record.email))
		.limit(1);

	if (!user) {
		return c.json({ error: "User not found" }, 404);
	}

	// Update passphrase and invalidate existing sessions
	await db
		.update(users)
		.set({ passphraseHash: record.passphraseHash })
		.where(eq(users.id, user.id));

	await deleteUserSessions(user.id);

	// Clean up verification record
	await db
		.delete(emailVerifications)
		.where(eq(emailVerifications.id, record.id));

	const [prefs] = await db
		.select({ lastPdfId: userPreferences.lastPdfId })
		.from(userPreferences)
		.where(eq(userPreferences.userId, user.id))
		.limit(1);

	// Create new session
	const sessionToken = await createSession(user.id);
	setSessionCookie(c, sessionToken);

	return c.json({
		user: {
			id: user.id,
			email: record.email,
			lastPdfId: prefs?.lastPdfId ?? null,
		},
	});
});

export default auth;
