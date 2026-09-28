import { eq } from "drizzle-orm";
import { setCookie } from "hono/cookie";
import { db } from "../db/index.js";
import { sessions } from "../db/schema.js";
import {
	SESSION_COOKIE_NAME,
	SESSION_MAX_AGE,
	SESSION_DURATION_MS,
} from "../constants.js";

export function setSessionCookie(
	c: Parameters<typeof setCookie>[0],
	token: string,
) {
	setCookie(c, SESSION_COOKIE_NAME, token, {
		httpOnly: true,
		sameSite: "Lax",
		path: "/",
		maxAge: SESSION_MAX_AGE,
		secure: process.env.NODE_ENV === "production",
	});
}

export async function createSession(userId: string): Promise<string> {
	const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
	const [session] = await db
		.insert(sessions)
		.values({ userId, expiresAt })
		.returning({ id: sessions.id });
	return session.id;
}

export async function validateSession(
	token: string,
): Promise<{ userId: string } | null> {
	const [session] = await db
		.select({
			id: sessions.id,
			userId: sessions.userId,
			expiresAt: sessions.expiresAt,
		})
		.from(sessions)
		.where(eq(sessions.id, token))
		.limit(1);

	if (!session || session.expiresAt < new Date()) {
		if (session) {
			await db.delete(sessions).where(eq(sessions.id, token));
		}
		return null;
	}

	return { userId: session.userId };
}

export async function deleteSession(token: string): Promise<void> {
	await db.delete(sessions).where(eq(sessions.id, token));
}

export async function deleteUserSessions(userId: string): Promise<void> {
	await db.delete(sessions).where(eq(sessions.userId, userId));
}
