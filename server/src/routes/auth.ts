import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { signToken } from "../lib/jwt.js";
import { authMiddleware } from "../middleware/auth.js";
import type { AuthEnv } from "../types.js";

const auth = new Hono<AuthEnv>();

auth.use("/me", authMiddleware);

auth.get("/me", async (c) => {
	const userId = c.get("userId");
	const [user] = await db
		.select({ id: users.id, email: users.email })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);

	if (!user) {
		return c.json({ error: "User not found" }, 404);
	}

	return c.json({ user: { id: user.id, email: user.email } });
});

auth.post("/signup", async (c) => {
	const body = await c.req.json();
	const { email, password } = body;

	if (!email || !password) {
		return c.json({ error: "Email and password are required" }, 400);
	}

	if (password.length < 8) {
		return c.json({ error: "Password must be at least 8 characters" }, 400);
	}

	const existing = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.email, email))
		.limit(1);

	if (existing.length > 0) {
		return c.json({ error: "Email already registered" }, 409);
	}

	const passwordHash = await hashPassword(password);
	const [user] = await db
		.insert(users)
		.values({ email, passwordHash })
		.returning({ id: users.id, email: users.email });

	const token = signToken(user.id);
	return c.json({ token, user: { id: user.id, email: user.email } }, 201);
});

auth.post("/login", async (c) => {
	const body = await c.req.json();
	const { email, password } = body;

	if (!email || !password) {
		return c.json({ error: "Email and password are required" }, 400);
	}

	const [user] = await db
		.select()
		.from(users)
		.where(eq(users.email, email))
		.limit(1);

	if (!user) {
		return c.json({ error: "Invalid email or password" }, 401);
	}

	const valid = await verifyPassword(password, user.passwordHash);
	if (!valid) {
		return c.json({ error: "Invalid email or password" }, 401);
	}

	const token = signToken(user.id);
	return c.json({ token, user: { id: user.id, email: user.email } });
});

export default auth;
