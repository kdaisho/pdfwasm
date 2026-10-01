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
 * Signs in with one of the passkeys of the account for `email`. Naming them
 * keeps password managers that hold none of them (e.g. a locked 1Password)
 * out of the way, so the browser's passkey picker handles the request. On
 * success the session cookie is set; a rejected assertion throws
 * PasskeyVerificationError.
 */
export async function signInWithPasskey(email: string): Promise<void> {
	const optionsJSON = await apiFetch<PublicKeyCredentialRequestOptionsJSON>(
		"/auth/passkey/authentication/options",
		{ method: "POST", body: JSON.stringify({ email }) },
	);
	const response = await startAuthentication({ optionsJSON });
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
	rememberPasskeyUse();
}

// Per device, not per user: it's read before anyone has signed in. It only
// decides which sign-in method the form leads with, so a stale value (passkey
// since deleted, storage restored) costs nothing but emphasis.
const PASSKEY_USED_KEY = "passkey_used_on_device";

function rememberPasskeyUse(): void {
	try {
		localStorage.setItem(PASSKEY_USED_KEY, "1");
	} catch {
		// Storage unavailable (private mode, blocked site data): lead with email
	}
}

/**
 * Whether sign-in should lead with the passkey button: a passkey has signed
 * in or been created in this browser before.
 */
export function prefersPasskey(): boolean {
	if (!browserSupportsWebAuthn()) return false;
	try {
		return localStorage.getItem(PASSKEY_USED_KEY) !== null;
	} catch {
		return false;
	}
}

/**
 * The user dismissed the passkey prompt (NotAllowedError), or the request was
 * aborted. Neither deserves an error message.
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
	rememberPasskeyUse();
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
