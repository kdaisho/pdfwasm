import { randomInt } from "crypto";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const words: string[] = require("../data/eff-wordlist.json");

export function generatePassphrase(): string {
	const picked = Array.from(
		{ length: 4 },
		() => words[randomInt(0, words.length)],
	);
	const digits = String(randomInt(0, 10000)).padStart(4, "0");
	return [...picked, digits].join("-");
}
