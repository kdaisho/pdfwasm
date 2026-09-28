import {
	startAuthentication,
	type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { apiFetch } from "./api.js";

export const PASSKEY_SIGN_IN_FAILED =
	"We couldn't sign you in with that passkey. Please try again.";

/** The server rejected the passkey the user picked. */
export class PasskeyVerificationError extends Error {
	name = "PasskeyVerificationError";
}

/**
 * Runs a discoverable-credential sign-in. With `useBrowserAutofill`, the
 * request stays pending until the user picks a passkey from the email field's
 * autofill (conditional UI); otherwise the browser shows its passkey dialog.
 * On success the session cookie is set; a rejected assertion throws
 * PasskeyVerificationError.
 */
export async function signInWithPasskey(
	useBrowserAutofill: boolean,
): Promise<void> {
	const optionsJSON = await apiFetch<PublicKeyCredentialRequestOptionsJSON>(
		"/auth/passkey/authentication/options",
		{ method: "POST" },
	);
	const response = await startAuthentication({
		optionsJSON,
		useBrowserAutofill,
	});
	try {
		await apiFetch("/auth/passkey/authentication/verify", {
			method: "POST",
			body: JSON.stringify(response),
		});
	} catch (err) {
		throw new PasskeyVerificationError(PASSKEY_SIGN_IN_FAILED, {
			cause: err,
		});
	}
}

/**
 * The user dismissed the passkey prompt (NotAllowedError), or the request was
 * aborted — e.g. the pending autofill request being replaced by the button
 * ceremony. Neither deserves an error message.
 */
export function isPasskeyCancellation(err: unknown): boolean {
	return (
		err instanceof Error &&
		(err.name === "NotAllowedError" || err.name === "AbortError")
	);
}
