import {
	browserSupportsWebAuthn,
	startAuthentication,
	startRegistration,
	WebAuthnError,
	type PublicKeyCredentialCreationOptionsJSON,
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

export interface PasskeySummary {
	id: string;
	name: string;
	createdAt: string;
	lastUsedAt: string | null;
	/** Synced to the user's password manager (e.g. iCloud Keychain) */
	backedUp: boolean;
}

/**
 * Creates a passkey for the signed-in user. Errors are best turned into
 * user-facing text with passkeyRegistrationError.
 */
export async function registerPasskey(): Promise<PasskeySummary> {
	const optionsJSON = await apiFetch<PublicKeyCredentialCreationOptionsJSON>(
		"/auth/passkey/registration/options",
		{ method: "POST" },
	);
	const response = await startRegistration({ optionsJSON });
	const res = await apiFetch<{ passkey: PasskeySummary }>(
		"/auth/passkey/registration/verify",
		{ method: "POST", body: JSON.stringify(response) },
	);
	return res.passkey;
}

/**
 * The message to show for a failed registerPasskey, or null when the user
 * simply cancelled.
 */
export function passkeyRegistrationError(err: unknown): string | null {
	if (isPasskeyCancellation(err)) return null;
	// The authenticator already holds one of the passkeys the server excluded
	if (err instanceof Error && err.name === "InvalidStateError") {
		return "This device already has a passkey for your account. You can sign in with it.";
	}
	// Browser errors are technical; the API's own messages are written for users
	if (err instanceof WebAuthnError || !(err instanceof Error)) {
		return "We couldn't create a passkey. Please try again.";
	}
	return err.message;
}

export async function listPasskeys(): Promise<PasskeySummary[]> {
	const res = await apiFetch<{ passkeys: PasskeySummary[] }>(
		"/auth/passkey/credentials",
	);
	return res.passkeys;
}

export async function renamePasskey(
	id: string,
	name: string,
): Promise<PasskeySummary> {
	const res = await apiFetch<{ passkey: PasskeySummary }>(
		`/auth/passkey/credentials/${encodeURIComponent(id)}`,
		{ method: "PATCH", body: JSON.stringify({ name }) },
	);
	return res.passkey;
}

export async function deletePasskey(id: string): Promise<void> {
	await apiFetch(`/auth/passkey/credentials/${encodeURIComponent(id)}`, {
		method: "DELETE",
	});
}

// Per device and per user: passkeys usually live on a device, so a new
// device is worth asking about again.
const promptDismissedKey = (userId: string) =>
	`passkey_prompt_dismissed:${userId}`;

export function dismissPasskeyPrompt(userId: string): void {
	try {
		localStorage.setItem(promptDismissedKey(userId), "1");
	} catch {
		// Storage unavailable (private mode, blocked site data): ask again next time
	}
}

function isPasskeyPromptDismissed(userId: string): boolean {
	try {
		return localStorage.getItem(promptDismissedKey(userId)) !== null;
	} catch {
		return false;
	}
}

/**
 * Whether to offer creating a passkey after an email-code sign-in: only to
 * users without one, who haven't dismissed the offer on this device.
 */
export async function shouldPromptForPasskey(userId: string): Promise<boolean> {
	if (!browserSupportsWebAuthn() || isPasskeyPromptDismissed(userId)) {
		return false;
	}
	try {
		return (await listPasskeys()).length === 0;
	} catch {
		// Never hold up sign-in over an optional prompt
		return false;
	}
}
