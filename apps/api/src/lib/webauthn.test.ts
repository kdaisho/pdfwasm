import { describe, expect, it } from "vitest";
import { loadWebAuthnConfig } from "./webauthn.js";

const dev = {
	RP_ID: "localhost",
	RP_NAME: "PDF Viewer",
	RP_ORIGIN: "http://localhost:5173",
};

describe("loadWebAuthnConfig", () => {
	it("accepts the localhost dev setup", () => {
		expect(loadWebAuthnConfig(dev)).toEqual({
			rpID: "localhost",
			rpName: "PDF Viewer",
			origin: "http://localhost:5173",
			decoySecret: expect.stringMatching(/^[0-9a-f]{64}$/),
		});
	});

	it("uses PASSKEY_DECOY_SECRET when set", () => {
		const config = loadWebAuthnConfig({
			...dev,
			PASSKEY_DECOY_SECRET: "s3cret",
		});
		expect(config.decoySecret).toBe("s3cret");
	});

	it("requires PASSKEY_DECOY_SECRET in production", () => {
		expect(() =>
			loadWebAuthnConfig({ ...dev, NODE_ENV: "production" }),
		).toThrow("PASSKEY_DECOY_SECRET");
	});

	it("accepts an https origin on a subdomain of the RP ID", () => {
		const config = loadWebAuthnConfig({
			...dev,
			RP_ID: "example.com",
			RP_ORIGIN: "https://app.example.com",
		});
		expect(config.origin).toBe("https://app.example.com");
	});

	it.each(["RP_ID", "RP_NAME", "RP_ORIGIN"])("requires %s", (key) => {
		expect(() => loadWebAuthnConfig({ ...dev, [key]: "" })).toThrow(key);
	});

	it.each([
		["an RP ID with a scheme or port", { RP_ID: "http://localhost:5173" }],
		["an origin with a path", { RP_ORIGIN: "http://localhost:5173/app" }],
		[
			"an origin outside the RP ID",
			{ RP_ID: "example.com", RP_ORIGIN: "https://example.org" },
		],
		[
			"plain http outside localhost",
			{ RP_ID: "example.com", RP_ORIGIN: "http://example.com" },
		],
	])("rejects %s", (_, overrides) => {
		expect(() => loadWebAuthnConfig({ ...dev, ...overrides })).toThrow();
	});
});
