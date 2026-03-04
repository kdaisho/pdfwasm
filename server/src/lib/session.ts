import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { sessions } from "../db/schema.js";

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

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
