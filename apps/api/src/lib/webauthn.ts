import { randomBytes } from "node:crypto";

export interface WebAuthnConfig {
	rpID: string;
	rpName: string;
	origin: string;
	/** Keys the decoy credential IDs given to emails without passkeys */
	decoySecret: string;
}

/**
 * Reads and validates the relying-party settings. Misconfiguration throws
 * here, at startup, rather than as opaque "origin mismatch" failures on
 * every passkey ceremony.
 */
export function loadWebAuthnConfig(
	env: Record<string, string | undefined>,
): WebAuthnConfig {
	for (const key of ["RP_ID", "RP_NAME", "RP_ORIGIN"]) {
		if (!env[key]) {
			throw new Error(`${key} must be set (see apps/api/.env.example)`);
		}
	}
	const rpID = env.RP_ID!;
	const rpName = env.RP_NAME!;
	const origin = env.RP_ORIGIN!;

	if (!/^[a-z0-9.-]+$/i.test(rpID)) {
		throw new Error(
			`RP_ID must be a bare domain such as "localhost" or "example.com", got "${rpID}"`,
		);
	}

	let url: URL;
	try {
		url = new URL(origin);
	} catch {
		throw new Error(`RP_ORIGIN must be a URL, got "${origin}"`);
	}
	if (url.origin !== origin) {
		throw new Error(
			`RP_ORIGIN must be a bare origin such as "https://example.com" (no path or trailing slash), got "${origin}"`,
		);
	}
	if (url.protocol !== "https:" && url.hostname !== "localhost") {
		throw new Error(`RP_ORIGIN must use https outside localhost`);
	}
	if (url.hostname !== rpID && !url.hostname.endsWith(`.${rpID}`)) {
		throw new Error(
			`RP_ORIGIN's host must be RP_ID or a subdomain of it (RP_ID="${rpID}", RP_ORIGIN="${origin}")`,
		);
	}

	// Decoys must stay stable across restarts in production, or an email's
	// changing decoy would give away that it has no passkey. Development can
	// make do with a per-process key.
	let decoySecret = env.PASSKEY_DECOY_SECRET;
	if (!decoySecret) {
		if (env.NODE_ENV === "production") {
			throw new Error(
				"PASSKEY_DECOY_SECRET must be set in production (see apps/api/.env.example)",
			);
		}
		decoySecret = randomBytes(32).toString("hex");
	}

	return { rpID, rpName, origin, decoySecret };
}

export const webauthnConfig = loadWebAuthnConfig(process.env);
