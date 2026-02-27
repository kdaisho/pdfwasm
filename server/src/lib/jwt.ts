import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET!;
const EXPIRES_IN = "7d";

interface TokenPayload {
	userId: string;
}

export function signToken(userId: string): string {
	return jwt.sign({ userId } satisfies TokenPayload, SECRET, {
		expiresIn: EXPIRES_IN,
	});
}

export function verifyToken(token: string): TokenPayload {
	return jwt.verify(token, SECRET) as TokenPayload;
}
