/**
 * Accuracy benchmark for AI split suggestions (KDA-63).
 *
 * Runs both providers over the same fixtures, scores each against hand-marked
 * boundaries, and sweeps SUGGEST_THRESHOLD over Jev's raw probabilities so the
 * constant can be tuned from data rather than guessed.
 *
 *   pnpm --filter @api run benchmark:suggest <fixtures-dir> [--provider openrouter|anthropic]
 *
 * A fixture is one JSON file per document:
 *
 *   {
 *     "name": "multi-chapter book with blank versos",
 *     "pages": [{ "position": 1, "text": "..." }, ...],
 *     "expectedSplitAfter": [12, 30, 44]
 *   }
 *
 * `pages` is exactly the body the editor already POSTs to /pdfs/suggest-splits,
 * so a fixture can be captured from that request in devtools (copy the request
 * payload) and annotated with the boundaries you would have drawn by hand.
 * `expectedSplitAfter` uses the same convention as the response: the position
 * of the LAST page of each segment.
 */
import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { SUGGEST_THRESHOLD } from "../constants.js";
import * as anthropic from "../lib/suggest/anthropic.js";
import * as openrouter from "../lib/suggest/openrouter.js";
import { toSplitPoints } from "../lib/suggestSplits.js";
import type { SuggestPage, SuggestProvider } from "../lib/suggest/types.js";

interface Fixture {
	name: string;
	pages: SuggestPage[];
	expectedSplitAfter: number[];
}

interface Score {
	truePositives: number;
	missed: number[];
	spurious: number[];
	precision: number;
	recall: number;
	f1: number;
	/** Recall-weighted: a missed boundary costs more than a spurious one. */
	f2: number;
}

const THRESHOLD_SWEEP = Array.from({ length: 19 }, (_, i) => (i + 1) / 20);

function score(expected: number[], actual: number[]): Score {
	const expectedSet = new Set(expected);
	const actualSet = new Set(actual);
	const truePositives = [...actualSet].filter((p) =>
		expectedSet.has(p),
	).length;
	const missed = [...expectedSet]
		.filter((p) => !actualSet.has(p))
		.sort((a, b) => a - b);
	const spurious = [...actualSet]
		.filter((p) => !expectedSet.has(p))
		.sort((a, b) => a - b);

	const precision = actualSet.size === 0 ? 1 : truePositives / actualSet.size;
	const recall =
		expectedSet.size === 0 ? 1 : truePositives / expectedSet.size;
	const fBeta = (beta: number) => {
		const b2 = beta * beta;
		const denominator = b2 * precision + recall;
		return denominator === 0
			? 0
			: ((1 + b2) * precision * recall) / denominator;
	};

	return {
		truePositives,
		missed,
		spurious,
		precision,
		recall,
		f1: fBeta(1),
		f2: fBeta(2),
	};
}

function pct(value: number): string {
	return `${(value * 100).toFixed(1)}%`;
}

function summarize(label: string, s: Score, elapsedMs?: number): void {
	const timing =
		elapsedMs === undefined ? "" : `  ${(elapsedMs / 1000).toFixed(2)}s`;
	console.log(
		`  ${label.padEnd(10)} P ${pct(s.precision).padStart(6)}  R ${pct(s.recall).padStart(6)}` +
			`  F1 ${s.f1.toFixed(3)}  F2 ${s.f2.toFixed(3)}${timing}`,
	);
	if (s.missed.length > 0)
		console.log(`    missed:   ${s.missed.join(", ")}`);
	if (s.spurious.length > 0)
		console.log(`    spurious: ${s.spurious.join(", ")}`);
}

async function loadFixtures(dir: string): Promise<Fixture[]> {
	const entries = (await readdir(dir))
		.filter((f) => f.endsWith(".json"))
		.sort();
	if (entries.length === 0) throw new Error(`No .json fixtures in ${dir}`);

	return Promise.all(
		entries.map(async (file) => {
			const raw: unknown = JSON.parse(
				await readFile(join(dir, file), "utf8"),
			);
			const data = raw as Partial<Fixture>;
			if (
				!Array.isArray(data.pages) ||
				!Array.isArray(data.expectedSplitAfter)
			) {
				throw new Error(
					`${file}: needs pages[] and expectedSplitAfter[]`,
				);
			}
			return {
				name: data.name ?? basename(file, ".json"),
				pages: data.pages,
				expectedSplitAfter: data.expectedSplitAfter,
			};
		}),
	);
}

/** Per-fixture Jev probabilities, fetched once and re-thresholded in memory. */
async function sweepOpenRouter(
	fixtures: Fixture[],
): Promise<Map<string, Map<number, number>>> {
	const byFixture = new Map<string, Map<number, number>>();
	for (const fixture of fixtures) {
		const startedAt = Date.now();
		const probabilities = await openrouter.scorePages(fixture.pages);
		byFixture.set(fixture.name, probabilities);

		const starts = [...probabilities]
			.filter(([, p]) => p > SUGGEST_THRESHOLD)
			.map(([position]) => position);
		const actual = toSplitPoints(fixture.pages, starts);
		console.log(`\n${fixture.name} (${fixture.pages.length} pages)`);
		summarize(
			`openrouter @${SUGGEST_THRESHOLD}`,
			score(fixture.expectedSplitAfter, actual),
			Date.now() - startedAt,
		);
	}
	return byFixture;
}

async function runAnthropic(fixtures: Fixture[]): Promise<void> {
	for (const fixture of fixtures) {
		const startedAt = Date.now();
		const starts = await anthropic.startPages(fixture.pages);
		const actual = toSplitPoints(fixture.pages, starts);
		console.log(`\n${fixture.name} (${fixture.pages.length} pages)`);
		summarize(
			"haiku",
			score(fixture.expectedSplitAfter, actual),
			Date.now() - startedAt,
		);
	}
}

/** Aggregate F-scores at each candidate threshold, pooled over all fixtures. */
function printSweep(
	fixtures: Fixture[],
	probabilitiesByFixture: Map<string, Map<number, number>>,
): void {
	console.log("\nThreshold sweep (pooled over all fixtures)");
	console.log("  thresh   precision   recall      F1      F2");

	let best = { threshold: SUGGEST_THRESHOLD, f2: -1 };
	for (const threshold of THRESHOLD_SWEEP) {
		const expected: number[] = [];
		const actual: number[] = [];
		// Offset each fixture into its own numeric range so pooled positions
		// from different documents cannot collide.
		let offset = 0;
		for (const fixture of fixtures) {
			const probabilities = probabilitiesByFixture.get(fixture.name);
			if (!probabilities) continue;
			const starts = [...probabilities]
				.filter(([, p]) => p > threshold)
				.map(([position]) => position);
			for (const p of fixture.expectedSplitAfter)
				expected.push(offset + p);
			for (const p of toSplitPoints(fixture.pages, starts))
				actual.push(offset + p);
			offset += fixture.pages.length + 1;
		}

		const s = score(expected, actual);
		if (s.f2 > best.f2) best = { threshold, f2: s.f2 };
		console.log(
			`  ${threshold.toFixed(2)}    ${pct(s.precision).padStart(7)}   ` +
				`${pct(s.recall).padStart(7)}   ${s.f1.toFixed(3)}   ${s.f2.toFixed(3)}`,
		);
	}

	console.log(
		`\nBest F2 at threshold ${best.threshold.toFixed(2)} (currently ` +
			`SUGGEST_THRESHOLD = ${SUGGEST_THRESHOLD}). F2 weights recall over ` +
			"precision: a missed boundary is easier to overlook than a spurious one.",
	);
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const dir = args.find((a) => !a.startsWith("--"));
	if (!dir) {
		console.error(
			"usage: benchmark-suggest <fixtures-dir> [--provider openrouter|anthropic]",
		);
		process.exitCode = 1;
		return;
	}

	const providerArg = args[args.indexOf("--provider") + 1];
	const only: SuggestProvider | null =
		providerArg === "openrouter" || providerArg === "anthropic"
			? providerArg
			: null;

	const fixtures = await loadFixtures(dir);
	console.log(`${fixtures.length} fixture(s) from ${dir}`);

	const runOpenRouter =
		only !== "anthropic" && Boolean(process.env.OPENROUTER_API_KEY);
	const runHaiku =
		only !== "openrouter" && Boolean(process.env.ANTHROPIC_API_KEY);
	if (!runOpenRouter && !runHaiku) {
		console.error(
			"No provider to run: set OPENROUTER_API_KEY and/or ANTHROPIC_API_KEY.",
		);
		process.exitCode = 1;
		return;
	}

	if (runHaiku) {
		console.log("\n── Anthropic (claude-haiku-4-5) ──");
		await runAnthropic(fixtures);
	}
	if (runOpenRouter) {
		console.log("\n── TypeSafe Jev via OpenRouter ──");
		printSweep(fixtures, await sweepOpenRouter(fixtures));
	}
}

main().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});
