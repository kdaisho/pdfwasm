// First match wins, so browsers that embed another's token (Edge and Opera
// carry "Chrome/", Chrome carries "Safari/") come before the one they mimic.
const BROWSERS: [RegExp, string][] = [
	[/Edg(e|A|iOS)?\//, "Edge"],
	[/OPR\/|Opera/, "Opera"],
	[/SamsungBrowser\//, "Samsung Internet"],
	[/Firefox\/|FxiOS\//, "Firefox"],
	[/Chrome\/|CriOS\//, "Chrome"],
	[/Version\/[\d.]+.*Safari\//, "Safari"],
];

// iOS UAs say "like Mac OS X" and ChromeOS says "X11", so those come first.
const PLATFORMS: [RegExp, string][] = [
	[/iPhone/, "iPhone"],
	[/iPad/, "iPad"],
	[/Android/, "Android"],
	[/CrOS/, "ChromeOS"],
	[/Windows/, "Windows"],
	[/Mac OS X|Macintosh/, "macOS"],
	[/Linux/, "Linux"],
];

function firstMatch(ua: string, table: [RegExp, string][]): string | null {
	return table.find(([pattern]) => pattern.test(ua))?.[1] ?? null;
}

/**
 * A default name for a new passkey, such as "Chrome on macOS", taken from the
 * registering request's User-Agent so users can tell their passkeys apart.
 */
export function passkeyNameFromUserAgent(ua: string | undefined): string {
	if (!ua) return "Passkey";
	const browser = firstMatch(ua, BROWSERS);
	const platform = firstMatch(ua, PLATFORMS);
	if (browser && platform) return `${browser} on ${platform}`;
	return browser ?? platform ?? "Passkey";
}
