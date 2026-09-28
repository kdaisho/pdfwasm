import { Hono, type Context } from "hono";
import { eq, lt, or } from "drizzle-orm";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import {
	generateAuthenticationOptions,
	generateRegistrationOptions,
	verifyAuthenticationResponse,
	verifyRegistrationResponse,
	type AuthenticationResponseJSON,
	type AuthenticatorTransportFuture,
	type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { isoBase64URL, isoUint8Array } from "@simplewebauthn/server/helpers";
import { db } from "../db/index.js";
import {
	users,
	passkeys,
	webauthnChallenges,
	userPreferences,
	pdfDocuments,
} from "../db/schema.js";
import { createSession, setSessionCookie } from "../lib/session.js";
import { webauthnConfig } from "../lib/webauthn.js";
import { authMiddleware } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import type { AuthEnv } from "../types.js";
import {
	WEBAUTHN_CHALLENGE_COOKIE_NAME,
	WEBAUTHN_CHALLENGE_COOKIE_PATH,
	WEBAUTHN_CHALLENGE_TTL_MS,
	PASSKEY_OPTIONS_RATE_LIMIT_WINDOW_MS,
	PASSKEY_OPTIONS_RATE_LIMIT_MAX,
} from "../constants.js";

// Every failure gets the same message, so responses never reveal whether a
// credential or account exists.
const SIGN_IN_FAILED =
	"We couldn't sign you in with that passkey. Please try again.";
const REGISTRATION_FAILED = "We couldn't save that passkey. Please try again.";

type ChallengeType = "registration" | "authentication";

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readChallengeCookie(c: Context): string | null {
	const id = getCookie(c, WEBAUTHN_CHALLENGE_COOKIE_NAME);
	return id && UUID_RE.test(id) ? id : null;
}

async function issueChallenge(
	c: Context,
	type: ChallengeType,
	challenge: string,
	userId: string | null,
) {
	const now = new Date();
	// Replace this browser's previous challenge and sweep any expired ones
	const previousId = readChallengeCookie(c);
	await db
		.delete(webauthnChallenges)
		.where(
			previousId
				? or(
						eq(webauthnChallenges.id, previousId),
						lt(webauthnChallenges.expiresAt, now),
					)
				: lt(webauthnChallenges.expiresAt, now),
		);

	const [row] = await db
		.insert(webauthnChallenges)
		.values({
			challenge,
			type,
			userId,
			expiresAt: new Date(now.getTime() + WEBAUTHN_CHALLENGE_TTL_MS),
		})
		.returning({ id: webauthnChallenges.id });

	setCookie(c, WEBAUTHN_CHALLENGE_COOKIE_NAME, row.id, {
		httpOnly: true,
		sameSite: "Lax",
		path: WEBAUTHN_CHALLENGE_COOKIE_PATH,
		maxAge: WEBAUTHN_CHALLENGE_TTL_MS / 1000,
		secure: process.env.NODE_ENV === "production",
	});
}

// Single use: the row is deleted before verification, whatever the outcome,
// so a challenge can never be replayed.
async function consumeChallenge(c: Context, type: ChallengeType) {
	const id = readChallengeCookie(c);
	deleteCookie(c, WEBAUTHN_CHALLENGE_COOKIE_NAME, {
		path: WEBAUTHN_CHALLENGE_COOKIE_PATH,
	});
	if (!id) return null;

	const [row] = await db
		.delete(webauthnChallenges)
		.where(eq(webauthnChallenges.id, id))
		.returning();

	if (!row || row.type !== type || row.expiresAt < new Date()) return null;
	return row;
}

// The authenticator stores the user handle as raw bytes; we hand it the UTF-8
// bytes of `users.webauthn_user_id`, and assertions return them as base64url.
function userHandleBytes(webauthnUserId: string): Uint8Array {
	return isoUint8Array.fromUTF8String(webauthnUserId);
}

async function readJson<T>(c: Context): Promise<T | null> {
	return c.req.json<T>().catch(() => null);
}

const passkey = new Hono<AuthEnv>();

const optionsRateLimit = rateLimit({
	windowMs: PASSKEY_OPTIONS_RATE_LIMIT_WINDOW_MS,
	max: PASSKEY_OPTIONS_RATE_LIMIT_MAX,
});

// ── Registration (adds a passkey to the signed-in account) ─────────────────

passkey.use("/registration/*", authMiddleware);

passkey.post("/registration/options", optionsRateLimit, async (c) => {
	const userId = c.get("userId");

	const [user] = await db
		.select({ email: users.email, webauthnUserId: users.webauthnUserId })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);

	if (!user) {
		return c.json({ error: "Not authenticated" }, 401);
	}

	const existing = await db
		.select({ id: passkeys.id, transports: passkeys.transports })
		.from(passkeys)
		.where(eq(passkeys.userId, userId));

	const options = await generateRegistrationOptions({
		rpName: webauthnConfig.rpName,
		rpID: webauthnConfig.rpID,
		userID: userHandleBytes(user.webauthnUserId),
		userName: user.email,
		userDisplayName: user.email,
		attestationType: "none",
		excludeCredentials: existing.map((p) => ({
			id: p.id,
			transports: (p.transports ?? undefined) as
				| AuthenticatorTransportFuture[]
				| undefined,
		})),
		// No authenticatorAttachment: security keys and phone (QR) sign-in
		// must stay possible.
		authenticatorSelection: {
			residentKey: "required",
			userVerification: "preferred",
		},
		timeout: WEBAUTHN_CHALLENGE_TTL_MS,
	});

	await issueChallenge(c, "registration", options.challenge, userId);

	return c.json(options);
});

passkey.post("/registration/verify", async (c) => {
	const userId = c.get("userId");
	const challenge = await consumeChallenge(c, "registration");
	const body = await readJson<RegistrationResponseJSON>(c);

	if (!challenge || challenge.userId !== userId || !body) {
		return c.json({ error: REGISTRATION_FAILED }, 400);
	}

	let verification;
	try {
		verification = await verifyRegistrationResponse({
			response: body,
			expectedChallenge: challenge.challenge,
			expectedOrigin: webauthnConfig.origin,
			expectedRPID: webauthnConfig.rpID,
			requireUserVerification: false,
		});
	} catch (err) {
		console.warn("[passkey] registration verification failed:", err);
		return c.json({ error: REGISTRATION_FAILED }, 400);
	}

	if (!verification.verified) {
		return c.json({ error: REGISTRATION_FAILED }, 400);
	}

	const { credential, credentialDeviceType, credentialBackedUp } =
		verification.registrationInfo;

	const inserted = await db
		.insert(passkeys)
		.values({
			id: credential.id,
			userId,
			publicKey: credential.publicKey,
			counter: credential.counter,
			deviceType: credentialDeviceType,
			backedUp: credentialBackedUp,
			transports: credential.transports ?? null,
		})
		.onConflictDoNothing()
		.returning({ id: passkeys.id });

	if (inserted.length === 0) {
		return c.json({ error: REGISTRATION_FAILED }, 400);
	}

	return c.json({ ok: true });
});

// ── Authentication (discoverable / usernameless sign-in) ───────────────────

passkey.post("/authentication/options", optionsRateLimit, async (c) => {
	// No allowCredentials: the authenticator offers whichever passkeys it holds
	// for this RP, and the user is identified from the assertion.
	const options = await generateAuthenticationOptions({
		rpID: webauthnConfig.rpID,
		userVerification: "preferred",
		timeout: WEBAUTHN_CHALLENGE_TTL_MS,
	});

	await issueChallenge(c, "authentication", options.challenge, null);

	return c.json(options);
});

passkey.post("/authentication/verify", async (c) => {
	const challenge = await consumeChallenge(c, "authentication");
	const body = await readJson<AuthenticationResponseJSON>(c);

	if (!challenge || typeof body?.id !== "string") {
		return c.json({ error: SIGN_IN_FAILED }, 400);
	}

	const [row] = await db
		.select({ passkey: passkeys, webauthnUserId: users.webauthnUserId })
		.from(passkeys)
		.innerJoin(users, eq(passkeys.userId, users.id))
		.where(eq(passkeys.id, body.id))
		.limit(1);

	// The authenticator names the account via userHandle; it must be the
	// credential owner's handle.
	if (
		!row ||
		body.response?.userHandle !==
			isoBase64URL.fromUTF8String(row.webauthnUserId)
	) {
		return c.json({ error: SIGN_IN_FAILED }, 400);
	}

	let verification;
	try {
		verification = await verifyAuthenticationResponse({
			response: body,
			expectedChallenge: challenge.challenge,
			expectedOrigin: webauthnConfig.origin,
			expectedRPID: webauthnConfig.rpID,
			credential: {
				id: row.passkey.id,
				publicKey: row.passkey.publicKey,
				counter: row.passkey.counter,
				transports: (row.passkey.transports ?? undefined) as
					| AuthenticatorTransportFuture[]
					| undefined,
			},
			requireUserVerification: false,
		});
	} catch (err) {
		console.warn("[passkey] authentication verification failed:", err);
		return c.json({ error: SIGN_IN_FAILED }, 400);
	}

	if (!verification.verified) {
		return c.json({ error: SIGN_IN_FAILED }, 400);
	}

	const userId = row.passkey.userId;

	await db
		.update(passkeys)
		.set({
			counter: verification.authenticationInfo.newCounter,
			lastUsedAt: new Date(),
		})
		.where(eq(passkeys.id, row.passkey.id));

	const [user] = await db
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

	const sessionToken = await createSession(userId);
	setSessionCookie(c, sessionToken);

	return c.json({ user });
});

export default passkey;
