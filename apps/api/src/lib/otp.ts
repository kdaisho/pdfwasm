import { randomInt } from "crypto";
import bcrypt from "bcrypt";

const SALT_ROUNDS = 10;

export function generateOtp(): string {
	return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function hashOtp(otp: string): Promise<string> {
	return bcrypt.hash(otp, SALT_ROUNDS);
}

export async function verifyOtp(otp: string, hash: string): Promise<boolean> {
	return bcrypt.compare(otp, hash);
}
