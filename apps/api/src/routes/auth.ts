import { Hono, type Context } from "hono";
import { eq, and, desc, lt, sql } from "drizzle-orm";
import { getCookie, deleteCookie } from "hono/cookie";
import { db } from "../db/index.js";
import {
	users,
	emailVerifications,
	userPreferences,
	pdfDocuments,
} from "../db/schema.js";
import { generateOtp, hashOtp, verifyOtp } from "../lib/otp.js";
import { sendOtpEmail } from "../lib/email.js";
import {
	createSession,
	deleteSession,
	setSessionCookie,
} from "../lib/session.js";
import { authMiddleware } from "../middleware/auth.js";
import type { AuthEnv } from "../types.js";
import {
	SESSION_COOKIE_NAME,
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

// ── /me ─────────────────────────────────────────────────────────────────────

auth.use("/me", authMiddleware);

auth.get("/me", async (c) => {
	const userId = c.get("userId");
	const [row] = await db
		.select({
			id: users.id,
			email: users.email,
			lastPdfId: userPreferences.lastPdfId,
			lastPdfFilename: pdfDocuments.filename,
		})
		.from(users)
		.leftJoin(userPreferences, eq(users.id, userPreferences.userId))
		.leftJoin(pdfDocuments, eq(userPreferences.lastPdfId, pdfDocuments.id))
		.where(eq(users.id, userId))
		.limit(1);

	if (!row) {
		return c.json({ error: "User not found" }, 404);
	}

	return c.json({
		user: {
			id: row.id,
			email: row.email,
			lastPdfId: row.lastPdfId,
			lastPdfFilename: row.lastPdfFilename,
		},
	});
});

// ── Email codes (shared by signup and sign-in) ──────────────────────────────

type OtpType = "signup" | "sign_in";

/**
 * Stores a fresh code for `email`, replacing any earlier one, and emails it
 * when `send` is true. Returns a 429 response while the resend cooldown runs.
 */
async function issueOtp(
	c: Context,
	email: string,
	type: OtpType,
	send: boolean,
): Promise<Response> {
	const [recent] = await db
		.select({ createdAt: emailVerifications.createdAt })
		.from(emailVerifications)
		.where(
			and(
				eq(emailVerifications.email, email.toLowerCase()),
				eq(emailVerifications.type, type),
			),
		)
		.orderBy(desc(emailVerifications.createdAt))
		.limit(1);

	if (recent) {
		const cooldown = checkResendCooldown(recent.createdAt);
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

	// Delete any previous verifications of this type for this email before inserting a fresh one
	await db
		.delete(emailVerifications)
		.where(
			and(
				eq(emailVerifications.email, email.toLowerCase()),
				eq(emailVerifications.type, type),
			),
		);

	await db.insert(emailVerifications).values({
		email: email.toLowerCase(),
		otpHash,
		type,
		expiresAt,
	});

	if (send) {
		// Fire-and-forget: don't await, so the response time doesn't depend on
		// the email send (closes the timing side-channel vs. the no-send path).
		void sendOtpEmail(email, otp, type).catch((err) =>
			console.error(`[email] ${type} OTP send failed:`, err),
		);
	}

	return c.json({ ok: true });
}

/**
 * Checks `otp` against the pending code for `email`. On success the code is
 * consumed (single use) and `null` is returned; otherwise the error response.
 */
async function consumeOtp(
	c: Context,
	email: string,
	otp: string,
	type: OtpType,
): Promise<Response | null> {
	const [record] = await db
		.select()
		.from(emailVerifications)
		.where(
			and(
				eq(emailVerifications.email, email.toLowerCase()),
				eq(emailVerifications.type, type),
			),
		)
		.orderBy(desc(emailVerifications.createdAt))
		.limit(1);

	if (!record) {
		return c.json(
			{
				error: "We couldn't find a pending verification for this email. Please request a new code.",
			},
			404,
		);
	}

	if (record.expiresAt < new Date()) {
		await db
			.delete(emailVerifications)
			.where(eq(emailVerifications.id, record.id));
		return c.json(
			{ error: "Your code has expired. Please request a new one." },
			410,
		);
	}

	// Count the attempt before checking the code, in one conditional update, so
	// parallel guesses can't all read the same count and slip past the limit.
	const [attempt] = await db
		.update(emailVerifications)
		.set({ attempts: sql`${emailVerifications.attempts} + 1` })
		.where(
			and(
				eq(emailVerifications.id, record.id),
				lt(emailVerifications.attempts, MAX_OTP_ATTEMPTS),
			),
		)
		.returning({ attempts: emailVerifications.attempts });

	if (!attempt) {
		return c.json(
			{ error: "Too many incorrect attempts. Please start over." },
			429,
		);
	}

	const valid = await verifyOtp(otp, record.otpHash);
	if (!valid) {
		const remaining = MAX_OTP_ATTEMPTS - attempt.attempts;
		return c.json(
			{
				error: `That code isn't right. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
			},
			400,
		);
	}

	// Only the request that deletes the row gets through, so a code is
	// single-use even when it's submitted in parallel.
	const [consumed] = await db
		.delete(emailVerifications)
		.where(eq(emailVerifications.id, record.id))
		.returning({ id: emailVerifications.id });

	if (!consumed) {
		return c.json(
			{
				error: "We couldn't find a pending verification for this email. Please request a new code.",
			},
			404,
		);
	}

	return null;
}

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
		// Don't reveal that the email is already registered — return the same
		// generic response a fresh signup gets, and send nothing. The "check your
		// inbox" screen tells existing users to log in instead, so the endpoint
		// can't be used to probe which emails have accounts.
		return c.json({ ok: true });
	}

	return issueOtp(c, email, "signup", true);
});

auth.post("/signup/verify-otp", async (c) => {
	const { email, otp } = await c.req.json();
	if (!email || !otp) {
		return c.json({ error: "Email and code are required." }, 400);
	}

	const failure = await consumeOtp(c, email, otp, "signup");
	if (failure) return failure;

	const [user] = await db
		.insert(users)
		.values({ email: email.toLowerCase() })
		.returning({ id: users.id, email: users.email });

	const sessionToken = await createSession(user.id);
	setSessionCookie(c, sessionToken);

	return c.json(
		{
			user: {
				id: user.id,
				email: user.email,
				lastPdfId: null,
				lastPdfFilename: null,
			},
		},
		201,
	);
});

// ── Email-code sign-in ───────────────────────────────────────────────────────

auth.post("/login/init", async (c) => {
	const { email } = await c.req.json();
	if (!email || typeof email !== "string") {
		return c.json({ error: "Email is required" }, 400);
	}

	const [user] = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.email, email.toLowerCase()))
		.limit(1);

	// An unknown email still gets a (never-sent) code, so the cooldown and the
	// verify responses match a real account's and can't be used to probe which
	// emails have accounts.
	return issueOtp(c, email, "sign_in", Boolean(user));
});

auth.post("/login/verify-otp", async (c) => {
	const { email, otp } = await c.req.json();
	if (!email || !otp) {
		return c.json({ error: "Email and code are required." }, 400);
	}

	const failure = await consumeOtp(c, email, otp, "sign_in");
	if (failure) return failure;

	const [user] = await db
		.select({ id: users.id, email: users.email })
		.from(users)
		.where(eq(users.email, email.toLowerCase()))
		.limit(1);

	// Only reachable by guessing the unsent code issued to an unknown email
	if (!user) {
		return c.json(
			{ error: "Something went wrong. Please start over." },
			400,
		);
	}

	const [prefs] = await db
		.select({
			lastPdfId: userPreferences.lastPdfId,
			lastPdfFilename: pdfDocuments.filename,
		})
		.from(userPreferences)
		.leftJoin(pdfDocuments, eq(userPreferences.lastPdfId, pdfDocuments.id))
		.where(eq(userPreferences.userId, user.id))
		.limit(1);

	const sessionToken = await createSession(user.id);
	setSessionCookie(c, sessionToken);

	return c.json({
		user: {
			id: user.id,
			email: user.email,
			lastPdfId: prefs?.lastPdfId ?? null,
			lastPdfFilename: prefs?.lastPdfFilename ?? null,
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

export default auth;
