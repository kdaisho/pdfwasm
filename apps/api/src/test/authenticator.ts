import {
	createHash,
	generateKeyPairSync,
	randomBytes,
	sign,
} from "node:crypto";
import type {
	AuthenticationResponseJSON,
	RegistrationResponseJSON,
} from "@simplewebauthn/server";
import {
	isoBase64URL,
	isoCBOR,
	isoUint8Array,
} from "@simplewebauthn/server/helpers";

// Authenticator data flags (WebAuthn §6.1)
const FLAG_UP = 0x01; // user present
const FLAG_UV = 0x04; // user verified
const FLAG_BE = 0x08; // backup eligible
const FLAG_BS = 0x10; // backed up
const FLAG_AT = 0x40; // attested credential data included

function sha256(data: Uint8Array): Uint8Array {
	return new Uint8Array(createHash("sha256").update(data).digest());
}

function uint(value: number, bytes: 2 | 4): Uint8Array {
	const out = new Uint8Array(bytes);
	const view = new DataView(out.buffer);
	if (bytes === 2) view.setUint16(0, value);
	else view.setUint32(0, value);
	return out;
}

/**
 * A software passkey (ES256, "none" attestation, synced) that produces
 * genuinely signed responses, so tests exercise @simplewebauthn/server's real
 * verification rather than a mock of it.
 */
export function createAuthenticator({
	rpID,
	origin,
}: {
	rpID: string;
	origin: string;
}) {
	const { privateKey, publicKey } = generateKeyPairSync("ec", {
		namedCurve: "P-256",
	});
	const jwk = publicKey.export({ format: "jwk" });
	const cosePublicKey = isoCBOR.encode(
		new Map<number, number | Uint8Array>([
			[1, 2], // kty: EC2
			[3, -7], // alg: ES256
			[-1, 1], // crv: P-256
			[-2, isoBase64URL.toBuffer(jwk.x!)],
			[-3, isoBase64URL.toBuffer(jwk.y!)],
		]),
	);
	const rawId = new Uint8Array(randomBytes(16));
	const credentialId = isoBase64URL.fromBuffer(rawId);
	const rpIdHash = sha256(isoUint8Array.fromUTF8String(rpID));
	let counter = 0;

	function authenticatorData(flags: number, attested?: Uint8Array) {
		return isoUint8Array.concat([
			rpIdHash,
			Uint8Array.of(flags),
			uint(counter, 4),
			...(attested ? [attested] : []),
		]);
	}

	function clientDataJSON(
		type: "webauthn.create" | "webauthn.get",
		challenge: string,
	) {
		return isoUint8Array.fromUTF8String(
			JSON.stringify({ type, challenge, origin, crossOrigin: false }),
		);
	}

	return {
		credentialId,
		cosePublicKey,

		register(challenge: string): RegistrationResponseJSON {
			const attested = isoUint8Array.concat([
				new Uint8Array(16), // AAGUID
				uint(rawId.length, 2),
				rawId,
				cosePublicKey,
			]);
			const attestationObject = isoCBOR.encode(
				new Map<string, Uint8Array | string | Map<string, string>>([
					["fmt", "none"],
					["attStmt", new Map<string, string>()],
					[
						"authData",
						authenticatorData(
							FLAG_UP | FLAG_UV | FLAG_BE | FLAG_BS | FLAG_AT,
							attested,
						),
					],
				]),
			);
			return {
				id: credentialId,
				rawId: credentialId,
				type: "public-key",
				response: {
					clientDataJSON: isoBase64URL.fromBuffer(
						clientDataJSON("webauthn.create", challenge),
					),
					attestationObject:
						isoBase64URL.fromBuffer(attestationObject),
					transports: ["internal"],
				},
				clientExtensionResults: {},
			};
		},

		// Authenticators may omit userHandle when allowCredentials named the
		// credential
		authenticate(
			challenge: string,
			userHandle: string | undefined,
		): AuthenticationResponseJSON {
			counter += 1;
			const authData = authenticatorData(
				FLAG_UP | FLAG_UV | FLAG_BE | FLAG_BS,
			);
			const clientData = clientDataJSON("webauthn.get", challenge);
			const signature = sign(
				"sha256",
				isoUint8Array.concat([authData, sha256(clientData)]),
				privateKey,
			);
			return {
				id: credentialId,
				rawId: credentialId,
				type: "public-key",
				response: {
					clientDataJSON: isoBase64URL.fromBuffer(clientData),
					authenticatorData: isoBase64URL.fromBuffer(authData),
					signature: isoBase64URL.fromBuffer(
						new Uint8Array(signature),
					),
					userHandle,
				},
				clientExtensionResults: {},
			};
		},
	};
}
