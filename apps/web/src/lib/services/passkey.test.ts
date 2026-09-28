import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as browser from "@simplewebauthn/browser";
import { startAuthentication, WebAuthnError } from "@simplewebauthn/browser";
import { apiFetch } from "./api.js";
import {
	isPasskeyCancellation,
	PasskeyVerificationError,
	signInWithPasskey,
} from "./passkey.js";

vi.mock("@simplewebauthn/browser", async (importOriginal) => ({
	...(await importOriginal<typeof browser>()),
	startAuthentication: vi.fn(),
}));
vi.mock("./api.js", () => ({ apiFetch: vi.fn() }));

const optionsJSON = { challenge: "abc", rpId: "localhost" };
const assertion = { id: "cred-1", type: "public-key" };

describe("signInWithPasskey", () => {
	beforeEach(() => {
		vi.mocked(apiFetch).mockReset();
		vi.mocked(startAuthentication).mockReset();
	});

	it.each([true, false])(
		"fetches options, runs the ceremony (autofill: %s), then verifies the assertion",
		async (useBrowserAutofill) => {
			vi.mocked(apiFetch)
				.mockResolvedValueOnce(optionsJSON)
				.mockResolvedValueOnce({ user: { id: "u1" } });
			vi.mocked(startAuthentication).mockResolvedValue(
				assertion as never,
			);

			await signInWithPasskey(useBrowserAutofill);

			expect(apiFetch).toHaveBeenNthCalledWith(
				1,
				"/auth/passkey/authentication/options",
				{ method: "POST" },
			);
			expect(startAuthentication).toHaveBeenCalledWith({
				optionsJSON,
				useBrowserAutofill,
			});
			expect(apiFetch).toHaveBeenNthCalledWith(
				2,
				"/auth/passkey/authentication/verify",
				{ method: "POST", body: JSON.stringify(assertion) },
			);
		},
	);

	it("throws PasskeyVerificationError when the server rejects the assertion", async () => {
		vi.mocked(apiFetch)
			.mockResolvedValueOnce(optionsJSON)
			.mockRejectedValueOnce(new Error("API error: 400"));
		vi.mocked(startAuthentication).mockResolvedValue(assertion as never);

		await expect(signInWithPasskey(true)).rejects.toBeInstanceOf(
			PasskeyVerificationError,
		);
	});

	it("does not wrap a failure to fetch options", async () => {
		vi.mocked(apiFetch).mockRejectedValueOnce(new Error("API error: 429"));

		const err = await signInWithPasskey(true).catch((e: unknown) => e);
		expect(err).not.toBeInstanceOf(PasskeyVerificationError);
		expect(startAuthentication).not.toHaveBeenCalled();
	});

	it("does not verify when the ceremony fails", async () => {
		vi.mocked(apiFetch).mockResolvedValueOnce(optionsJSON);
		vi.mocked(startAuthentication).mockRejectedValue(
			new DOMException("cancelled", "NotAllowedError"),
		);

		await expect(signInWithPasskey(false)).rejects.toThrow("cancelled");
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

	it("treats an aborted autofill request as a cancellation", () => {
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
