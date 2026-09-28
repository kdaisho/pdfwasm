export interface WebAuthnConfig {
	rpID: string;
	rpName: string;
	origin: string;
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

	return { rpID, rpName, origin };
}

export const webauthnConfig = loadWebAuthnConfig(process.env);
