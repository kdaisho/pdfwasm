import bcrypt from "bcrypt";

const SALT_ROUNDS = 12;

export async function hashPassphrase(passphrase: string): Promise<string> {
	return bcrypt.hash(passphrase, SALT_ROUNDS);
}

export async function verifyPassphrase(
	passphrase: string,
	hash: string,
): Promise<boolean> {
	return bcrypt.compare(passphrase, hash);
}
