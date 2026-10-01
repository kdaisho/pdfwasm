import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as browser from "@simplewebauthn/browser";
import {
	browserSupportsWebAuthn,
	startAuthentication,
	startRegistration,
	WebAuthnError,
} from "@simplewebauthn/browser";
import { apiFetch } from "./api.js";
import {
	deletePasskey,
	dismissPasskeyPrompt,
	isPasskeyCancellation,
	listPasskeys,
	passkeyRegistrationError,
	PasskeyVerificationError,
	prefersPasskey,
	registerPasskey,
	renamePasskey,
	shouldPromptForPasskey,
	signInWithPasskey,
} from "./passkey.js";

vi.mock("@simplewebauthn/browser", async (importOriginal) => ({
	...(await importOriginal<typeof browser>()),
	browserSupportsWebAuthn: vi.fn(),
	startAuthentication: vi.fn(),
	startRegistration: vi.fn(),
}));
vi.mock("./api.js", () => ({ apiFetch: vi.fn() }));

const optionsJSON = { challenge: "abc", rpId: "localhost" };
const assertion = { id: "cred-1", type: "public-key" };

describe("signInWithPasskey", () => {
	beforeEach(() => {
		vi.mocked(apiFetch).mockReset();
		vi.mocked(startAuthentication).mockReset();
	});

	it("fetches options for the email, runs the ceremony, then verifies the assertion", async () => {
		vi.mocked(apiFetch)
			.mockResolvedValueOnce(optionsJSON)
			.mockResolvedValueOnce({ user: { id: "u1" } });
		vi.mocked(startAuthentication).mockResolvedValue(assertion as never);

		await signInWithPasskey("alice@example.com");

		expect(apiFetch).toHaveBeenNthCalledWith(
			1,
			"/auth/passkey/authentication/options",
			{
				method: "POST",
				body: JSON.stringify({ email: "alice@example.com" }),
			},
		);
		expect(startAuthentication).toHaveBeenCalledWith({ optionsJSON });
		expect(apiFetch).toHaveBeenNthCalledWith(
			2,
			"/auth/passkey/authentication/verify",
			{ method: "POST", body: JSON.stringify(assertion) },
		);
	});

	it("throws PasskeyVerificationError when the server rejects the assertion", async () => {
		vi.mocked(apiFetch)
			.mockResolvedValueOnce(optionsJSON)
			.mockRejectedValueOnce(new Error("API error: 400"));
		vi.mocked(startAuthentication).mockResolvedValue(assertion as never);

		await expect(
			signInWithPasskey("alice@example.com"),
		).rejects.toBeInstanceOf(PasskeyVerificationError);
	});

	it("does not wrap a failure to fetch options", async () => {
		vi.mocked(apiFetch).mockRejectedValueOnce(new Error("API error: 429"));

		const err = await signInWithPasskey("alice@example.com").catch(
			(e: unknown) => e,
		);
		expect(err).not.toBeInstanceOf(PasskeyVerificationError);
		expect(startAuthentication).not.toHaveBeenCalled();
	});

	it("does not verify when the ceremony fails", async () => {
		vi.mocked(apiFetch).mockResolvedValueOnce(optionsJSON);
		vi.mocked(startAuthentication).mockRejectedValue(
			new DOMException("cancelled", "NotAllowedError"),
		);

		await expect(signInWithPasskey("alice@example.com")).rejects.toThrow(
			"cancelled",
		);
		expect(apiFetch).toHaveBeenCalledTimes(1);
	});
});

describe("isPasskeyCancellation", () => {
	it("treats a user cancel as a cancellation", () => {
		const cause = new DOMException("cancelled", "NotAllowedError");
		expect(
			isPasskeyCancellation(
				new WebAuthnError({
					message: cause.message,
					code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
					cause,
				}),
			),
		).toBe(true);
	});

	it("treats an aborted request as a cancellation", () => {
		const cause = new Error("Cancelling existing WebAuthn API call");
		cause.name = "AbortError";
		expect(
			isPasskeyCancellation(
				new WebAuthnError({
					message: "aborted",
					code: "ERROR_CEREMONY_ABORTED",
					cause,
				}),
			),
		).toBe(true);
	});

	it("does not treat other failures as cancellations", () => {
		expect(isPasskeyCancellation(new Error("API error: 400"))).toBe(false);
		expect(
			isPasskeyCancellation(new DOMException("bad", "SecurityError")),
		).toBe(false);
		expect(isPasskeyCancellation("nope")).toBe(false);
	});
});

function webAuthnError(name: string, code: WebAuthnError["code"]) {
	const cause = new DOMException(name, name);
	return new WebAuthnError({ message: cause.message, code, cause });
}

describe("registerPasskey", () => {
	beforeEach(() => {
		vi.mocked(apiFetch).mockReset();
		vi.mocked(startRegistration).mockReset();
	});

	it("fetches options, runs the ceremony, then saves and returns the passkey", async () => {
		const attestation = { id: "cred-2", type: "public-key" };
		const created = { id: "cred-2", name: "Chrome on macOS" };
		vi.mocked(apiFetch)
			.mockResolvedValueOnce(optionsJSON)
			.mockResolvedValueOnce({ passkey: created });
		vi.mocked(startRegistration).mockResolvedValue(attestation as never);

		expect(await registerPasskey()).toEqual(created);

		expect(apiFetch).toHaveBeenNthCalledWith(
			1,
			"/auth/passkey/registration/options",
			{ method: "POST" },
		);
		expect(startRegistration).toHaveBeenCalledWith({ optionsJSON });
		expect(apiFetch).toHaveBeenNthCalledWith(
			2,
			"/auth/passkey/registration/verify",
			{ method: "POST", body: JSON.stringify(attestation) },
		);
	});
});

describe("passkeyRegistrationError", () => {
	it("stays quiet when the user cancels", () => {
		expect(
			passkeyRegistrationError(
				webAuthnError(
					"NotAllowedError",
					"ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
				),
			),
		).toBeNull();
	});

	it("explains a passkey already registered on this authenticator", () => {
		expect(
			passkeyRegistrationError(
				webAuthnError(
					"InvalidStateError",
					"ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED",
				),
			),
		).toBe(
			"This device already has a passkey for your account. You can sign in with it.",
		);
	});

	it("hides other browser errors behind a generic message", () => {
		expect(
			passkeyRegistrationError(
				webAuthnError("SecurityError", "ERROR_INVALID_DOMAIN"),
			),
		).toBe("We couldn't create a passkey. Please try again.");
	});

	it("passes server messages through", () => {
		expect(
			passkeyRegistrationError(
				new Error("We couldn't save that passkey. Please try again."),
			),
		).toBe("We couldn't save that passkey. Please try again.");
	});
});

describe("passkey management", () => {
	beforeEach(() => {
		vi.mocked(apiFetch).mockReset();
	});

	const summary = {
		id: "a/b+c",
		name: "Chrome on macOS",
		createdAt: "2026-09-01T00:00:00.000Z",
		lastUsedAt: null,
		backedUp: true,
	};

	it("lists the user's passkeys", async () => {
		vi.mocked(apiFetch).mockResolvedValueOnce({ passkeys: [summary] });

		expect(await listPasskeys()).toEqual([summary]);
		expect(apiFetch).toHaveBeenCalledWith("/auth/passkey/credentials");
	});

	it("renames a passkey by its URL-encoded ID", async () => {
		vi.mocked(apiFetch).mockResolvedValueOnce({ passkey: summary });

		expect(await renamePasskey("a/b+c", "Laptop")).toEqual(summary);
		expect(apiFetch).toHaveBeenCalledWith(
			"/auth/passkey/credentials/a%2Fb%2Bc",
			{ method: "PATCH", body: JSON.stringify({ name: "Laptop" }) },
		);
	});

	it("deletes a passkey by its URL-encoded ID", async () => {
		vi.mocked(apiFetch).mockResolvedValueOnce({ ok: true });

		await deletePasskey("a/b+c");
		expect(apiFetch).toHaveBeenCalledWith(
			"/auth/passkey/credentials/a%2Fb%2Bc",
			{ method: "DELETE" },
		);
	});
});

describe("shouldPromptForPasskey", () => {
	let storage: Map<string, string>;

	beforeEach(() => {
		vi.mocked(apiFetch).mockReset();
		vi.mocked(browserSupportsWebAuthn).mockReturnValue(true);
		storage = new Map();
		vi.stubGlobal("localStorage", {
			getItem: (key: string) => storage.get(key) ?? null,
			setItem: (key: string, value: string) => storage.set(key, value),
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("prompts a user with no passkeys", async () => {
		vi.mocked(apiFetch).mockResolvedValueOnce({ passkeys: [] });
		expect(await shouldPromptForPasskey("u1")).toBe(true);
	});

	it("does not prompt a user who already has a passkey", async () => {
		vi.mocked(apiFetch).mockResolvedValueOnce({
			passkeys: [{ id: "cred-1" }],
		});
		expect(await shouldPromptForPasskey("u1")).toBe(false);
	});

	it("remembers a dismissal per user on this device", async () => {
		dismissPasskeyPrompt("u1");

		expect(await shouldPromptForPasskey("u1")).toBe(false);
		expect(apiFetch).not.toHaveBeenCalled();

		vi.mocked(apiFetch).mockResolvedValueOnce({ passkeys: [] });
		expect(await shouldPromptForPasskey("u2")).toBe(true);
	});

	it("does not prompt when the browser lacks WebAuthn", async () => {
		vi.mocked(browserSupportsWebAuthn).mockReturnValue(false);
		expect(await shouldPromptForPasskey("u1")).toBe(false);
		expect(apiFetch).not.toHaveBeenCalled();
	});

	it("does not prompt when the passkey list can't be loaded", async () => {
		vi.mocked(apiFetch).mockRejectedValueOnce(new Error("API error: 500"));
		expect(await shouldPromptForPasskey("u1")).toBe(false);
	});

	it("still works when storage is unavailable", async () => {
		vi.stubGlobal("localStorage", {
			getItem: () => {
				throw new Error("SecurityError");
			},
			setItem: () => {
				throw new Error("SecurityError");
			},
		});
		vi.mocked(apiFetch).mockResolvedValueOnce({ passkeys: [] });

		expect(() => dismissPasskeyPrompt("u1")).not.toThrow();
		expect(await shouldPromptForPasskey("u1")).toBe(true);
	});
});

describe("prefersPasskey", () => {
	let storage: Map<string, string>;

	beforeEach(() => {
		vi.mocked(apiFetch).mockReset();
		vi.mocked(startAuthentication).mockReset();
		vi.mocked(startRegistration).mockReset();
		vi.mocked(browserSupportsWebAuthn).mockReturnValue(true);
		storage = new Map();
		vi.stubGlobal("localStorage", {
			getItem: (key: string) => storage.get(key) ?? null,
			setItem: (key: string, value: string) => storage.set(key, value),
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("is false on a device that hasn't used a passkey", () => {
		expect(prefersPasskey()).toBe(false);
	});

	it("turns true after a passkey sign-in on this device", async () => {
		vi.mocked(apiFetch)
			.mockResolvedValueOnce(optionsJSON)
			.mockResolvedValueOnce({ user: { id: "u1" } });
		vi.mocked(startAuthentication).mockResolvedValue(assertion as never);

		await signInWithPasskey("alice@example.com");

		expect(prefersPasskey()).toBe(true);
	});

	it("turns true after creating a passkey on this device", async () => {
		vi.mocked(apiFetch)
			.mockResolvedValueOnce(optionsJSON)
			.mockResolvedValueOnce({ passkey: { id: "cred-2" } });
		vi.mocked(startRegistration).mockResolvedValue({
			id: "cred-2",
		} as never);

		await registerPasskey();

		expect(prefersPasskey()).toBe(true);
	});

	it("stays false when the sign-in is rejected", async () => {
		vi.mocked(apiFetch)
			.mockResolvedValueOnce(optionsJSON)
			.mockRejectedValueOnce(new Error("API error: 400"));
		vi.mocked(startAuthentication).mockResolvedValue(assertion as never);

		await signInWithPasskey("alice@example.com").catch(() => {});

		expect(prefersPasskey()).toBe(false);
	});

	it("is false when the browser lacks WebAuthn", async () => {
		vi.mocked(apiFetch)
			.mockResolvedValueOnce(optionsJSON)
			.mockResolvedValueOnce({ user: { id: "u1" } });
		vi.mocked(startAuthentication).mockResolvedValue(assertion as never);
		await signInWithPasskey("alice@example.com");

		vi.mocked(browserSupportsWebAuthn).mockReturnValue(false);
		expect(prefersPasskey()).toBe(false);
	});

	it("still signs in when storage is unavailable", async () => {
		vi.stubGlobal("localStorage", {
			getItem: () => {
				throw new Error("SecurityError");
			},
			setItem: () => {
				throw new Error("SecurityError");
			},
		});
		vi.mocked(apiFetch)
			.mockResolvedValueOnce(optionsJSON)
			.mockResolvedValueOnce({ user: { id: "u1" } });
		vi.mocked(startAuthentication).mockResolvedValue(assertion as never);

		await expect(signInWithPasskey("alice@example.com")).resolves.toBe(
			undefined,
		);
		expect(prefersPasskey()).toBe(false);
	});
});
