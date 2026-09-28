import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { eq } from "drizzle-orm";

vi.mock("../db/index.js", () => import("../test/pglite.js"));
vi.mock("../lib/email.js", () => ({
	sendOtpEmail: vi.fn().mockResolvedValue(undefined),
}));

import { db } from "../db/index.js";
import { emailVerifications, sessions, users } from "../db/schema.js";
import { sendOtpEmail } from "../lib/email.js";
import {
	SESSION_COOKIE_NAME,
	SESSION_MAX_AGE,
	OTP_TTL_MS,
	OTP_RESEND_COOLDOWN_MS,
	MAX_OTP_ATTEMPTS,
} from "../constants.js";
import authRoutes from "./auth.js";

const app = new Hono().route("/api/auth", authRoutes);
const sendOtp = vi.mocked(sendOtpEmail);

function post(path: string, body?: unknown) {
	return app.request(`/api/auth${path}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
}

function getCookie(res: Response, name: string): string | undefined {
	for (const header of res.headers.getSetCookie()) {
		const [pair] = header.split(";");
		const [key, value] = pair.split("=");
		if (key === name && value) return value;
	}
	return undefined;
}

async function createUser(email: string) {
	const [user] = await db.insert(users).values({ email }).returning();
	return user;
}

/** The code handed to the (mocked) mailer by the most recent send. */
function lastSentCode(): string {
	const call = sendOtp.mock.lastCall;
	expect(call).toBeDefined();
	return call![1];
}

/** Any 6-digit code other than `code`. */
function wrongCode(code: string): string {
	return code === "000000" ? "111111" : "000000";
}

async function expectSession(res: Response, userId: string) {
	const cookie = res.headers
		.getSetCookie()
		.find((h) => h.startsWith(`${SESSION_COOKIE_NAME}=`));
	expect(cookie).toMatch(/HttpOnly/);
	expect(cookie).toMatch(new RegExp(`Max-Age=${SESSION_MAX_AGE}`));

	const token = getCookie(res, SESSION_COOKIE_NAME);
	const [session] = await db
		.select()
		.from(sessions)
		.where(eq(sessions.id, token!));
	expect(session.userId).toBe(userId);
}

beforeEach(async () => {
	sendOtp.mockClear();
	await db.delete(emailVerifications);
	await db.delete(users); // cascades to sessions
});

afterEach(() => {
	vi.useRealTimers();
});

describe("signup", () => {
	it("creates the account and signs in once the emailed code is verified", async () => {
		const init = await post("/signup/init", { email: "Alice@Example.com" });
		expect(init.status).toBe(200);
		expect(sendOtp).toHaveBeenCalledWith(
			"Alice@Example.com",
			expect.stringMatching(/^\d{6}$/),
			"signup",
		);

		const res = await post("/signup/verify-otp", {
			email: "alice@example.com",
			otp: lastSentCode(),
		});

		expect(res.status).toBe(201);
		const [user] = await db
			.select()
			.from(users)
			.where(eq(users.email, "alice@example.com"));
		expect(await res.json()).toEqual({
			user: {
				id: user.id,
				email: "alice@example.com",
				lastPdfId: null,
				lastPdfFilename: null,
			},
		});
		await expectSession(res, user.id);
		expect(await db.select().from(emailVerifications)).toEqual([]);
	});

	it("sends nothing to an email that already has an account", async () => {
		await createUser("alice@example.com");

		const res = await post("/signup/init", { email: "alice@example.com" });

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true });
		expect(sendOtp).not.toHaveBeenCalled();
	});

	it("does not accept a sign-in code", async () => {
		await createUser("alice@example.com");
		await post("/login/init", { email: "alice@example.com" });

		const res = await post("/signup/verify-otp", {
			email: "alice@example.com",
			otp: lastSentCode(),
		});

		expect(res.status).toBe(404);
		expect(getCookie(res, SESSION_COOKIE_NAME)).toBeUndefined();
	});
});

describe("email-code sign-in", () => {
	let alice: typeof users.$inferSelect;

	beforeEach(async () => {
		alice = await createUser("alice@example.com");
	});

	it("signs the user in with the emailed code", async () => {
		const init = await post("/login/init", { email: "Alice@Example.com" });
		expect(init.status).toBe(200);
		expect(await init.json()).toEqual({ ok: true });
		expect(sendOtp).toHaveBeenCalledWith(
			"Alice@Example.com",
			expect.stringMatching(/^\d{6}$/),
			"sign_in",
		);

		const res = await post("/login/verify-otp", {
			email: "alice@example.com",
			otp: lastSentCode(),
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
		await expectSession(res, alice.id);
	});

	it("accepts a code only once", async () => {
		await post("/login/init", { email: "alice@example.com" });
		const otp = lastSentCode();

		const first = await post("/login/verify-otp", {
			email: "alice@example.com",
			otp,
		});
		expect(first.status).toBe(200);

		const replay = await post("/login/verify-otp", {
			email: "alice@example.com",
			otp,
		});
		expect(replay.status).toBe(404);
		expect(getCookie(replay, SESSION_COOKIE_NAME)).toBeUndefined();
	});

	it("rejects a wrong code and counts down the remaining attempts", async () => {
		await post("/login/init", { email: "alice@example.com" });
		const otp = lastSentCode();

		const res = await post("/login/verify-otp", {
			email: "alice@example.com",
			otp: wrongCode(otp),
		});

		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({
			error: `That code isn't right. ${MAX_OTP_ATTEMPTS - 1} attempts remaining.`,
		});
		expect(getCookie(res, SESSION_COOKIE_NAME)).toBeUndefined();
	});

	it(`locks the code after ${MAX_OTP_ATTEMPTS} wrong attempts`, async () => {
		await post("/login/init", { email: "alice@example.com" });
		const otp = lastSentCode();

		for (let i = 0; i < MAX_OTP_ATTEMPTS; i++) {
			await post("/login/verify-otp", {
				email: "alice@example.com",
				otp: wrongCode(otp),
			});
		}
		const res = await post("/login/verify-otp", {
			email: "alice@example.com",
			otp,
		});

		expect(res.status).toBe(429);
		expect(getCookie(res, SESSION_COOKIE_NAME)).toBeUndefined();
	});

	it("holds the attempt limit against parallel guesses", async () => {
		await post("/login/init", { email: "alice@example.com" });
		const otp = lastSentCode();

		const responses = await Promise.all(
			Array.from({ length: MAX_OTP_ATTEMPTS + 3 }, () =>
				post("/login/verify-otp", {
					email: "alice@example.com",
					otp: wrongCode(otp),
				}),
			),
		);

		const checked = responses.filter((r) => r.status === 400);
		expect(checked).toHaveLength(MAX_OTP_ATTEMPTS);
	});

	it("accepts a code only once under parallel requests", async () => {
		await post("/login/init", { email: "alice@example.com" });
		const otp = lastSentCode();

		const responses = await Promise.all(
			Array.from({ length: 3 }, () =>
				post("/login/verify-otp", { email: "alice@example.com", otp }),
			),
		);

		const signedIn = responses.filter((r) => r.status === 200);
		expect(signedIn).toHaveLength(1);
	});

	it("rejects an expired code", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		await post("/login/init", { email: "alice@example.com" });
		vi.setSystemTime(Date.now() + OTP_TTL_MS + 1000);

		const res = await post("/login/verify-otp", {
			email: "alice@example.com",
			otp: lastSentCode(),
		});

		expect(res.status).toBe(410);
		expect(getCookie(res, SESSION_COOKIE_NAME)).toBeUndefined();
	});

	it("enforces the resend cooldown", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		await post("/login/init", { email: "alice@example.com" });

		const tooSoon = await post("/login/init", {
			email: "alice@example.com",
		});
		expect(tooSoon.status).toBe(429);
		expect(tooSoon.headers.get("Retry-After")).toEqual(expect.any(String));
		expect(sendOtp).toHaveBeenCalledTimes(1);

		vi.setSystemTime(Date.now() + OTP_RESEND_COOLDOWN_MS);
		const later = await post("/login/init", { email: "alice@example.com" });
		expect(later.status).toBe(200);
		expect(sendOtp).toHaveBeenCalledTimes(2);
	});

	describe("for an email without an account", () => {
		// Every response must match the known-email case, so the endpoints
		// can't be used to probe which emails have accounts.

		it("responds generically and sends nothing", async () => {
			const res = await post("/login/init", {
				email: "nobody@example.com",
			});

			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({ ok: true });
			expect(sendOtp).not.toHaveBeenCalled();
		});

		it("enforces the same resend cooldown", async () => {
			await post("/login/init", { email: "nobody@example.com" });

			const res = await post("/login/init", {
				email: "nobody@example.com",
			});
			expect(res.status).toBe(429);
		});

		it("rejects codes like a wrong code", async () => {
			await post("/login/init", { email: "nobody@example.com" });

			const res = await post("/login/verify-otp", {
				email: "nobody@example.com",
				otp: "123456",
			});

			expect(res.status).toBe(400);
			expect(await res.json()).toEqual({
				error: `That code isn't right. ${MAX_OTP_ATTEMPTS - 1} attempts remaining.`,
			});
			expect(getCookie(res, SESSION_COOKIE_NAME)).toBeUndefined();
		});
	});

	it("does not accept a signup code", async () => {
		await post("/signup/init", { email: "bob@example.com" });

		const res = await post("/login/verify-otp", {
			email: "bob@example.com",
			otp: lastSentCode(),
		});

		expect(res.status).toBe(404);
	});
});

describe("removed passphrase endpoints", () => {
	it.each(["/login", "/reset/init", "/reset/verify-otp", "/reset/complete"])(
		"%s is gone",
		async (path) => {
			expect((await post(path, {})).status).toBe(404);
		},
	);
});
