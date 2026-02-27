import { createMiddleware } from "hono/factory";
import { verifyToken } from "../lib/jwt.js";

type AuthEnv = {
	Variables: {
		userId: string;
	};
};

export const authMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
	const header = c.req.header("Authorization");
	if (!header?.startsWith("Bearer ")) {
		return c.json(
			{ error: "Missing or invalid Authorization header" },
			401,
		);
	}

	const token = header.slice(7);
	try {
		const payload = verifyToken(token);
		c.set("userId", payload.userId);
	} catch {
		return c.json({ error: "Invalid or expired token" }, 401);
	}

	await next();
});
