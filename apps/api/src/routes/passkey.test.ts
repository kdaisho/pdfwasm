import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { isoBase64URL } from "@simplewebauthn/server/helpers";

vi.mock("../db/index.js", () => import("../test/pglite.js"));

import { db } from "../db/index.js";
import { passkeys, sessions, users, webauthnChallenges } from "../db/schema.js";
import { createSession } from "../lib/session.js";
import { createAuthenticator } from "../test/authenticator.js";
import {
	SESSION_COOKIE_NAME,
	WEBAUTHN_CHALLENGE_COOKIE_NAME,
	WEBAUTHN_CHALLENGE_TTL_MS,
	PASSKEY_OPTIONS_RATE_LIMIT_MAX,
} from "../constants.js";
import passkeyRoutes from "./passkey.js";

const app = new Hono().route("/api/auth/passkey", passkeyRoutes);
const rp = { rpID: "localhost", origin: "http://localhost:5173" };

type User = typeof users.$inferSelect;
type Authenticator = ReturnType<typeof createAuthenticator>;
type Cookies = Record<string, string>;

// Each request gets its own client IP unless one is given, so the options
// rate limiter only trips in the test that targets it.
let ipCounter = 0;

function post(
	path: string,
	{
		body,
		cookies,
		ip,
	}: { body?: unknown; cookies?: Cookies; ip?: string } = {},
) {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};
	if (cookies) {
		headers.Cookie = Object.entries(cookies)
			.map(([name, value]) => `${name}=${value}`)
			.join("; ");
	}
	return app.request(
		`/api/auth/passkey${path}`,
		{
			method: "POST",
			headers,
			body: body === undefined ? undefined : JSON.stringify(body),
		},
		{
			incoming: {
				socket: { remoteAddress: ip ?? `10.0.0.${++ipCounter}` },
			},
		},
	);
}

function getCookie(res: Response, name: string): string | undefined {
	for (const header of res.headers.getSetCookie()) {
		const [pair] = header.split(";");
		const [key, value] = pair.split("=");
		if (key === name && value) return value;
	}
	return undefined;
}

async function createUser(email: string): Promise<User> {
	const [user] = await db.insert(users).values({ email }).returning();
	return user;
}

async function sessionFor(user: User): Promise<Cookies> {
	return { [SESSION_COOKIE_NAME]: await createSession(user.id) };
}

async function savePasskey(user: User, authenticator: Authenticator) {
	await db.insert(passkeys).values({
		id: authenticator.credentialId,
		userId: user.id,
		publicKey: authenticator.cosePublicKey,
		deviceType: "multiDevice",
		backedUp: true,
		transports: ["internal"],
	});
}

function userHandleOf(user: User): string {
	return isoBase64URL.fromUTF8String(user.webauthnUserId);
}

async function getPasskey(id: string) {
	const [row] = await db.select().from(passkeys).where(eq(passkeys.id, id));
	return row;
}

async function startSignIn() {
	const res = await post("/authentication/options");
	expect(res.status).toBe(200);
	const options = await res.json();
	const challengeId = getCookie(res, WEBAUTHN_CHALLENGE_COOKIE_NAME);
	expect(challengeId).toBeDefined();
	return {
		challenge: options.challenge as string,
		cookies: { [WEBAUTHN_CHALLENGE_COOKIE_NAME]: challengeId! },
	};
}

async function startRegistration(session: Cookies) {
	const res = await post("/registration/options", { cookies: session });
	expect(res.status).toBe(200);
	const options = await res.json();
	return {
		options,
		cookies: {
			...session,
			[WEBAUTHN_CHALLENGE_COOKIE_NAME]: getCookie(
				res,
				WEBAUTHN_CHALLENGE_COOKIE_NAME,
			)!,
		},
	};
}

beforeEach(async () => {
	await db.delete(webauthnChallenges);
	await db.delete(users); // cascades to sessions and passkeys
});

afterEach(() => {
	vi.useRealTimers();
});

describe("POST /authentication/options", () => {
	it("issues a usernameless challenge bound to an HttpOnly cookie", async () => {
		const res = await post("/authentication/options");
		expect(res.status).toBe(200);

		const options = await res.json();
		expect(options.challenge).toEqual(expect.any(String));
		expect(options.rpId).toBe("localhost");
		expect(options.allowCredentials).toBeUndefined();

		const setCookie = res.headers
			.getSetCookie()
			.find((h) => h.startsWith(`${WEBAUTHN_CHALLENGE_COOKIE_NAME}=`));
		expect(setCookie).toMatch(/HttpOnly/);
		expect(setCookie).toMatch(/Max-Age=300/);
	});

	it("is rate-limited per client", async () => {
		const ip = "192.0.2.1";
		for (let i = 0; i < PASSKEY_OPTIONS_RATE_LIMIT_MAX; i++) {
			expect((await post("/authentication/options", { ip })).status).toBe(
				200,
			);
		}
		const limited = await post("/authentication/options", { ip });
		expect(limited.status).toBe(429);
		expect(limited.headers.get("Retry-After")).toEqual(expect.any(String));
	});
});

describe("POST /authentication/verify", () => {
	let alice: User;
	let authenticator: Authenticator;

	beforeEach(async () => {
		alice = await createUser("alice@example.com");
		authenticator = createAuthenticator(rp);
		await savePasskey(alice, authenticator);
	});

	async function expectRejected(res: Response) {
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({
			error: "We couldn't sign you in with that passkey. Please try again.",
		});
		expect(getCookie(res, SESSION_COOKIE_NAME)).toBeUndefined();
	}

	it("signs the user in and records the passkey's use", async () => {
		const { challenge, cookies } = await startSignIn();
		const res = await post("/authentication/verify", {
			cookies,
			body: authenticator.authenticate(challenge, userHandleOf(alice)),
		});

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			user: {
				id: alice.id,
				email: "alice@example.com",
				lastPdfId: null,
				lastPdfFilename: null,
			},
		});

		const token = getCookie(res, SESSION_COOKIE_NAME);
		const [session] = await db
			.select()
			.from(sessions)
			.where(eq(sessions.id, token!));
		expect(session.userId).toBe(alice.id);

		const passkey = await getPasskey(authenticator.credentialId);
		expect(passkey.counter).toBe(1);
		expect(passkey.lastUsedAt).toBeInstanceOf(Date);
	});

	it("rejects a response signed over a different challenge", async () => {
		const { cookies } = await startSignIn();
		const res = await post("/authentication/verify", {
			cookies,
			body: authenticator.authenticate(
				isoBase64URL.fromUTF8String("not-the-issued-challenge"),
				userHandleOf(alice),
			),
		});

		await expectRejected(res);
		const passkey = await getPasskey(authenticator.credentialId);
		expect(passkey.counter).toBe(0);
		expect(passkey.lastUsedAt).toBeNull();
	});

	it("rejects an expired challenge", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		const { challenge, cookies } = await startSignIn();
		vi.setSystemTime(Date.now() + WEBAUTHN_CHALLENGE_TTL_MS + 1000);

		const res = await post("/authentication/verify", {
			cookies,
			body: authenticator.authenticate(challenge, userHandleOf(alice)),
		});

		await expectRejected(res);
		expect((await getPasskey(authenticator.credentialId)).counter).toBe(0);
	});

	it("rejects a replayed challenge", async () => {
		const { challenge, cookies } = await startSignIn();

		const first = await post("/authentication/verify", {
			cookies,
			body: authenticator.authenticate(challenge, userHandleOf(alice)),
		});
		expect(first.status).toBe(200);

		// A fresh signature (higher counter) over the same challenge, so only
		// the challenge's single use can stop it.
		await expectRejected(
			await post("/authentication/verify", {
				cookies,
				body: authenticator.authenticate(
					challenge,
					userHandleOf(alice),
				),
			}),
		);
		expect((await getPasskey(authenticator.credentialId)).counter).toBe(1);
	});

	it("rejects a userHandle that doesn't belong to the credential's owner", async () => {
		const bob = await createUser("bob@example.com");
		const { challenge, cookies } = await startSignIn();

		const res = await post("/authentication/verify", {
			cookies,
			body: authenticator.authenticate(challenge, userHandleOf(bob)),
		});

		await expectRejected(res);
		expect((await getPasskey(authenticator.credentialId)).counter).toBe(0);
	});

	it("rejects an unknown credential with the same generic error", async () => {
		const stranger = createAuthenticator(rp);
		const { challenge, cookies } = await startSignIn();

		await expectRejected(
			await post("/authentication/verify", {
				cookies,
				body: stranger.authenticate(challenge, userHandleOf(alice)),
			}),
		);
	});

	it("rejects a request without a challenge cookie", async () => {
		const { challenge } = await startSignIn();

		await expectRejected(
			await post("/authentication/verify", {
				body: authenticator.authenticate(
					challenge,
					userHandleOf(alice),
				),
			}),
		);
	});

	it("rejects a registration challenge", async () => {
		const { options, cookies } = await startRegistration(
			await sessionFor(alice),
		);

		await expectRejected(
			await post("/authentication/verify", {
				cookies,
				body: authenticator.authenticate(
					options.challenge,
					userHandleOf(alice),
				),
			}),
		);
	});
});

describe("registration", () => {
	let alice: User;

	beforeEach(async () => {
		alice = await createUser("alice@example.com");
	});

	it("requires a session", async () => {
		expect((await post("/registration/options")).status).toBe(401);
		expect((await post("/registration/verify", { body: {} })).status).toBe(
			401,
		);
	});

	it("asks for a discoverable credential and excludes existing passkeys", async () => {
		const existing = createAuthenticator(rp);
		await savePasskey(alice, existing);

		const { options } = await startRegistration(await sessionFor(alice));

		expect(options.user).toEqual({
			id: userHandleOf(alice),
			name: "alice@example.com",
			displayName: "alice@example.com",
		});
		expect(options.excludeCredentials).toEqual([
			{
				id: existing.credentialId,
				type: "public-key",
				transports: ["internal"],
			},
		]);
		expect(options.authenticatorSelection).toEqual({
			residentKey: "required",
			requireResidentKey: true,
			userVerification: "preferred",
		});
	});

	it("stores the verified credential for the session user", async () => {
		const authenticator = createAuthenticator(rp);
		const { options, cookies } = await startRegistration(
			await sessionFor(alice),
		);

		const res = await post("/registration/verify", {
			cookies,
			body: authenticator.register(options.challenge),
		});

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true });
		expect(getCookie(res, WEBAUTHN_CHALLENGE_COOKIE_NAME)).toBeUndefined();

		const passkey = await getPasskey(authenticator.credentialId);
		expect(passkey).toMatchObject({
			userId: alice.id,
			counter: 0,
			deviceType: "multiDevice",
			backedUp: true,
			transports: ["internal"],
			lastUsedAt: null,
		});
		expect(passkey.publicKey).toEqual(authenticator.cosePublicKey);
	});

	it("rejects a challenge issued to another account", async () => {
		const bob = await createUser("bob@example.com");
		const authenticator = createAuthenticator(rp);
		const { options, cookies } = await startRegistration(
			await sessionFor(alice),
		);

		const res = await post("/registration/verify", {
			cookies: { ...cookies, ...(await sessionFor(bob)) },
			body: authenticator.register(options.challenge),
		});

		expect(res.status).toBe(400);
		expect(await getPasskey(authenticator.credentialId)).toBeUndefined();
	});

	it("rejects a replayed registration challenge", async () => {
		const { options, cookies } = await startRegistration(
			await sessionFor(alice),
		);

		const first = await post("/registration/verify", {
			cookies,
			body: createAuthenticator(rp).register(options.challenge),
		});
		expect(first.status).toBe(200);

		const second = createAuthenticator(rp);
		const replay = await post("/registration/verify", {
			cookies,
			body: second.register(options.challenge),
		});
		expect(replay.status).toBe(400);
		expect(await getPasskey(second.credentialId)).toBeUndefined();
	});
});
