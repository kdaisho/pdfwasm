import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { validateSession } from "../lib/session.js";
import type { AuthEnv } from "../types.js";

export const authMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
	const token = getCookie(c, "session_token");
	if (!token) {
		return c.json({ error: "Not authenticated" }, 401);
	}

	const session = await validateSession(token);
	if (!session) {
		return c.json({ error: "Session expired or invalid" }, 401);
	}

	c.set("userId", session.userId);
	await next();
});
