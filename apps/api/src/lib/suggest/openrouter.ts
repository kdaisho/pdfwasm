import { OpenRouter } from "@openrouter/sdk";
import type { DecisionsNoulQuestion } from "@openrouter/sdk/models";
import {
	SUGGEST_OPENROUTER_CHARS_PER_TOKEN,
	SUGGEST_OPENROUTER_MODEL,
	SUGGEST_OPENROUTER_PAGE_OVERHEAD_TOKENS,
	SUGGEST_OPENROUTER_QUESTION_TOKENS,
	SUGGEST_OPENROUTER_TOKEN_BUDGET,
	SUGGEST_OPENROUTER_WINDOW_OVERLAP,
	SUGGEST_RETRY_MAX_ELAPSED_MS,
	SUGGEST_SNIPPET_MAX,
	SUGGEST_THRESHOLD,
	SUGGEST_TIMEOUT_MS,
} from "../../constants.js";
import { isBlank, type SuggestPage } from "./types.js";

// Constructed lazily so the API server still boots when OPENROUTER_API_KEY is
// unset — only the suggest-splits endpoint depends on it.
let _client: OpenRouter | null = null;
function getClient(): OpenRouter {
	if (!_client) {
		// Note: this alpha operation is pinned to openrouter.ai by the SDK's own
		// server list — neither `serverURL` nor OPENROUTER_BASE_URL redirects
		// it, so tests stub at the fetch layer.
		_client = new OpenRouter({
			apiKey: process.env.OPENROUTER_API_KEY ?? "",
			appTitle: "pdfwasm",
			timeoutMs: SUGGEST_TIMEOUT_MS,
			retryConfig: {
				strategy: "backoff",
				backoff: {
					initialInterval: 500,
					maxInterval: 8_000,
					exponent: 2,
					maxElapsedTime: SUGGEST_RETRY_MAX_ELAPSED_MS,
				},
				retryConnectionErrors: true,
			},
		});
	}
	return _client;
}

/**
 * The shared rules, carried once in the state rather than repeated on every
 * question. Jev evaluates questions in isolation, so this is what the single
 * Anthropic system prompt becomes — but duplicating it across hundreds of
 * questions would blow the 32k context on guidance alone.
 */
const RULES = [
	"Each page below is one page of a single PDF, in order.",
	'A page BEGINS A NEW UNIT when it carries the heading of a new chapter, part, or major section, or the first page of a separate document: a chapter or part heading, a titled section start, a title or divider page, a new header or letterhead, a "Page 1 of N" counter resetting, a new addressee or sender, a new invoice/reference/account number, or an abrupt change of subject.',
	"A page does NOT begin a new unit when it continues what precedes it: running body text, a continued table or list, or a page whose header and numbering carry on from the page before.",
	"Prefer top-level boundaries (chapters, major sections, separate documents) over minor ones (sub-sections, individual figures, single paragraphs).",
	'Pages shown as "[blank page]" belong to the unit that precedes them.',
	"When genuinely unsure, lean towards yes: a spurious split is trivial for the user to remove, whereas a missed one is easy to overlook.",
].join("\n");

/**
 * Status codes retried with the client's backoff policy. The SDK defaults this
 * operation to "5XX" only, which would leave rate limiting unhandled; 529
 * (overloaded) is already covered by the 5XX entry.
 */
const RETRY_CODES = ["429", "5XX"];

/** Question name for a page; answers come back keyed the same way. */
function key(position: number): string {
	return `p${position}`;
}

function snippet(page: SuggestPage): string {
	return isBlank(page)
		? "[blank page]"
		: page.text.slice(0, SUGGEST_SNIPPET_MAX);
}

/** Rough token cost of carrying one page in the state. */
function pageTokens(page: SuggestPage): number {
	return (
		Math.ceil(snippet(page).length / SUGGEST_OPENROUTER_CHARS_PER_TOKEN) +
		SUGGEST_OPENROUTER_PAGE_OVERHEAD_TOKENS
	);
}

/**
 * Plan the calls needed to cover every page.
 *
 * Jev's context is 32k tokens, which a 600-page listing plus one question per
 * page overruns — so a document that fits goes in one call with the whole
 * listing as state (the ideal: every question sees full sequence context), and
 * a document that does not is cut into the fewest windows that fit, each
 * overlapping its neighbour by SUGGEST_OPENROUTER_WINDOW_OVERLAP pages. Windows are
 * far larger than the Anthropic path's fixed 60-page ones, and a page asked in
 * two windows keeps its highest probability.
 */
export function planWindows(
	pages: SuggestPage[],
	askedPositions: ReadonlySet<number>,
): SuggestPage[][] {
	const budget =
		SUGGEST_OPENROUTER_TOKEN_BUDGET -
		Math.ceil(RULES.length / SUGGEST_OPENROUTER_CHARS_PER_TOKEN);
	const cost = (p: SuggestPage) =>
		pageTokens(p) +
		(askedPositions.has(p.position)
			? SUGGEST_OPENROUTER_QUESTION_TOKENS
			: 0);

	const total = pages.reduce((sum, p) => sum + cost(p), 0);
	if (total <= budget) return [pages];

	const windows: SuggestPage[][] = [];
	let current: SuggestPage[] = [];
	let spent = 0;
	for (const page of pages) {
		const c = cost(page);
		if (current.length > 0 && spent + c > budget) {
			windows.push(current);
			const carried = current.slice(-SUGGEST_OPENROUTER_WINDOW_OVERLAP);
			current = [...carried];
			spent = carried.reduce((sum, p) => sum + cost(p), 0);
		}
		current.push(page);
		spent += c;
	}
	if (current.length > 0) windows.push(current);
	return windows;
}

/**
 * Probability that each page begins a new unit, keyed by page position.
 *
 * One question per page, evaluated in parallel and in isolation, so there is
 * no long listing for the model to drift through (the reason the Anthropic
 * path needs overlapping windows even for modest documents). Two pages are
 * never asked about:
 *
 * - the first page of the listing, which already starts the first file;
 * - blank pages, which belong to the unit that precedes them — a blank verso
 *   before a chapter opener is part of the previous chapter, and asking about
 *   it risks a split one page early.
 */
export async function scorePages(
	pages: SuggestPage[],
): Promise<Map<number, number>> {
	const firstPosition = Math.min(...pages.map((p) => p.position));
	const asked = new Set(
		pages
			.filter((p) => p.position !== firstPosition && !isBlank(p))
			.map((p) => p.position),
	);

	const windows = planWindows(pages, asked);
	const scored = await Promise.all(
		windows.map((window) => requestWindow(window, asked)),
	);

	const probabilities = new Map<number, number>();
	for (const window of scored) {
		for (const [position, probability] of window) {
			// A page carried in two windows keeps its highest score, matching
			// the recall bias in RULES.
			const seen = probabilities.get(position);
			if (seen === undefined || probability > seen) {
				probabilities.set(position, probability);
			}
		}
	}
	return probabilities;
}

/** One Decisions call: this window's pages as state, one Noul question each. */
async function requestWindow(
	window: SuggestPage[],
	asked: ReadonlySet<number>,
): Promise<Array<[number, number]>> {
	const targets = window.filter((p) => asked.has(p.position));
	if (targets.length === 0) return [];

	const questions: Record<string, DecisionsNoulQuestion> = {};
	for (const page of targets) {
		questions[key(page.position)] = {
			type: "noul",
			instructions: `Page ${page.position} begins a new unit, by the rules given in the state.`,
		};
	}

	const { answers } = await getClient().alpha.decisions.create(
		{
			decisionsRequest: {
				model: SUGGEST_OPENROUTER_MODEL,
				state: {
					rules: RULES,
					pages: window.map((p) => ({
						position: p.position,
						text: snippet(p),
					})),
				},
				questions,
			},
		},
		{ retryCodes: RETRY_CODES },
	);

	return targets.map((page) => {
		const answer = answers[key(page.position)];
		return [page.position, answer?.type === "noul" ? answer.noul : 0] as [
			number,
			number,
		];
	});
}

/** Pages whose probability clears the threshold, i.e. those beginning a unit. */
export async function startPages(
	pages: SuggestPage[],
	threshold: number = SUGGEST_THRESHOLD,
): Promise<Set<number>> {
	const probabilities = await scorePages(pages);
	const starts = new Set<number>();
	for (const [position, probability] of probabilities) {
		if (probability > threshold) starts.add(position);
	}
	return starts;
}
