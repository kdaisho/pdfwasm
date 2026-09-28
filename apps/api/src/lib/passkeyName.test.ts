import { describe, expect, it } from "vitest";
import { passkeyNameFromUserAgent } from "./passkeyName.js";

describe("passkeyNameFromUserAgent", () => {
	it.each([
		[
			"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
			"Chrome on macOS",
		],
		[
			"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
			"Safari on macOS",
		],
		[
			"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
			"Safari on iPhone",
		],
		[
			"Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.0.0 Mobile/15E148 Safari/604.1",
			"Chrome on iPad",
		],
		[
			"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/131.0 Mobile/15E148 Safari/605.1.15",
			"Firefox on iPhone",
		],
		[
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0",
			"Edge on Windows",
		],
		[
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
			"Firefox on Windows",
		],
		[
			"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
			"Chrome on Android",
		],
		[
			"Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
			"Samsung Internet on Android",
		],
		[
			"Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
			"Chrome on ChromeOS",
		],
		[
			"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 OPR/114.0.0.0",
			"Opera on Linux",
		],
	])("names %s as %s", (userAgent, name) => {
		expect(passkeyNameFromUserAgent(userAgent)).toBe(name);
	});

	it("uses whichever half it recognises", () => {
		expect(
			passkeyNameFromUserAgent("SomeBrowser/1.0 (Windows NT 10.0)"),
		).toBe("Windows");
		expect(passkeyNameFromUserAgent("Firefox/131.0")).toBe("Firefox");
	});

	it("falls back to a generic name", () => {
		expect(passkeyNameFromUserAgent(undefined)).toBe("Passkey");
		expect(passkeyNameFromUserAgent("")).toBe("Passkey");
		expect(passkeyNameFromUserAgent("curl/8.7.1")).toBe("Passkey");
	});
});
