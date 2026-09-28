import { createMiddleware } from "hono/factory";
import { getConnInfo } from "@hono/node-server/conninfo";

/**
 * Fixed-window, per-client-IP rate limit held in memory. Fine for the single
 * API process we run; it would need a shared store if the API is scaled out,
 * and the client IP must come from a trusted header if it moves behind a
 * reverse proxy.
 */
export function rateLimit({
	windowMs,
	max,
}: {
	windowMs: number;
	max: number;
}) {
	const hits = new Map<string, { count: number; resetAt: number }>();
	let lastSweep = Date.now();

	return createMiddleware(async (c, next) => {
		const now = Date.now();
		if (now - lastSweep >= windowMs) {
			for (const [key, entry] of hits) {
				if (entry.resetAt <= now) hits.delete(key);
			}
			lastSweep = now;
		}

		const key = getConnInfo(c).remote.address ?? "unknown";
		const entry = hits.get(key);

		if (!entry || entry.resetAt <= now) {
			hits.set(key, { count: 1, resetAt: now + windowMs });
		} else if (entry.count >= max) {
			const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
			c.header("Retry-After", String(retryAfterSec));
			return c.json(
				{
					error: "Too many requests. Please try again in a moment.",
					retryAfter: retryAfterSec,
				},
				429,
			);
		} else {
			entry.count++;
		}

		await next();
	});
}
