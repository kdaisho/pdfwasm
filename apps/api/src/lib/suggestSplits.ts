import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import {
	SUGGEST_MODEL,
	SUGGEST_CHUNK_THRESHOLD,
	SUGGEST_CHUNK_WINDOW,
	SUGGEST_CHUNK_OVERLAP,
	SUGGEST_SNIPPET_MAX,
} from "../constants.js";

export interface SuggestPage {
	/** Sequence position of the page (as the client renders it). */
	position: number;
	/** Leading text of the page. */
	text: string;
}

// Constructed lazily so the API server still boots when ANTHROPIC_API_KEY is
// unset — only the suggest-splits endpoint depends on it.
let _client: Anthropic | null = null;
function getClient(): Anthropic {
	if (!_client) _client = new Anthropic();
	return _client;
}

const SYSTEM_PROMPT = `You suggest where to split one PDF into multiple separate files.

You are given the pages in order. Each line is "Page <N>: <leading text of that page>". Identify the pages that BEGIN a new unit — the first page of a new chapter or major section of the same work, or the first page of a new, unrelated document (a new invoice, letter, statement, form, contract, report, etc.).

Return the page number of each such first page — the page that CARRIES the heading itself: the page showing "Chapter 3", "Part II", a titled section start, a new letterhead, or a reset "Page 1 of N". A chapter or part title/divider page is the FIRST page of its unit, not the last page of the previous one — return that title/divider page's number. Rules:
- Use the exact page numbers shown in the listing.
- Identify a new unit from cues such as a chapter or part heading, a new header or letterhead, a "Page 1 of N" counter resetting, a new addressee or sender, a new invoice/reference/account number, or an abrupt change of subject.
- Prefer top-level boundaries (chapters, major sections, separate documents) over minor ones (sub-sections, individual figures, or single paragraphs).
- Some pages are shown as "[blank page]" (they contain no text). A blank page belongs to the unit that PRECEDES it — never report a blank page as the start of a unit. A unit's first page is the page that carries its heading; when a chapter opener follows one or more blank pages, return the opener's page number, not the blank one.
- When you are genuinely unsure whether a page begins a new unit, PREFER to include it. A spurious split is trivial for the user to remove, whereas a missed one is easy to overlook.
- Do NOT include the very first page of the listing (it already starts the first file). Return an empty list only when the pages truly form a single continuous unit.`;

const outputFormat = jsonSchemaOutputFormat({
	type: "object",
	properties: {
		startPages: {
			type: "array",
			items: { type: "integer" },
			description:
				"Page numbers that each BEGIN a new chapter, section, or document (the page carrying the heading/title/letterhead).",
		},
	},
	required: ["startPages"],
	additionalProperties: false,
} as const);

/** Ask the model which pages begin a new unit, for one listing of pages. */
async function requestStartPages(pages: SuggestPage[]): Promise<number[]> {
	const listing = pages
		.map((p) =>
			p.text.trim() === ""
				? `Page ${p.position}: [blank page]`
				: `Page ${p.position}: ${p.text.slice(0, SUGGEST_SNIPPET_MAX)}`,
		)
		.join("\n");

	const message = await getClient().messages.parse({
		model: SUGGEST_MODEL,
		max_tokens: 2048,
		system: SYSTEM_PROMPT,
		messages: [
			{
				role: "user",
				content: `Here are the ${pages.length} pages in order. Identify the pages that begin a new unit.\n\n${listing}`,
			},
		],
		output_config: { format: outputFormat },
	});

	return message.parsed_output?.startPages ?? [];
}

/**
 * Convert model-reported unit-start pages into validated split-after positions.
 * The model reports the first page of each new unit (the page carrying the
 * heading); we split BEFORE it (startPage - 1) so the heading/divider page
 * leads its file, advancing past any blank page so blanks stay with the
 * preceding file. Returns a sorted, de-duplicated list of valid non-final
 * positions.
 */
function toSplitPoints(
	pages: SuggestPage[],
	startPages: Iterable<number>,
): number[] {
	const valid = new Set(pages.map((p) => p.position));
	const firstPosition = Math.min(...pages.map((p) => p.position));
	const lastPosition = Math.max(...pages.map((p) => p.position));
	const blankByPosition = new Map(
		pages.map((p) => [p.position, p.text.trim() === ""]),
	);
	const isBlank = (pos: number) => blankByPosition.get(pos) ?? true;

	const kept = new Set<number>();
	for (const s of startPages) {
		if (!Number.isInteger(s) || !valid.has(s)) continue;

		// A unit never starts on a blank page (books put a blank verso before a
		// chapter opener). Advance to the real opener.
		let opener = s;
		while (opener <= lastPosition && isBlank(opener)) opener++;
		if (opener > lastPosition || !valid.has(opener)) continue;

		const splitAt = opener - 1;
		if (splitAt >= firstPosition && splitAt < lastPosition) {
			kept.add(splitAt);
		}
	}
	return [...kept].sort((a, b) => a - b);
}

/** Slice pages into overlapping windows for chunked processing. */
function buildWindows(pages: SuggestPage[]): SuggestPage[][] {
	const stride = SUGGEST_CHUNK_WINDOW - SUGGEST_CHUNK_OVERLAP;
	const windows: SuggestPage[][] = [];
	for (let start = 0; start < pages.length; start += stride) {
		windows.push(pages.slice(start, start + SUGGEST_CHUNK_WINDOW));
		if (start + SUGGEST_CHUNK_WINDOW >= pages.length) break;
	}
	return windows;
}

/**
 * Propose split points for a PDF. Large docs (>= SUGGEST_CHUNK_THRESHOLD) are
 * split into overlapping windows processed in parallel, so the model never has
 * to track page numbers across a long listing (which makes accuracy drift the
 * deeper it gets); smaller docs go in a single call. Boundaries found in any
 * window are merged.
 */
export async function suggestSplitPoints(
	pages: SuggestPage[],
): Promise<number[]> {
	const windows =
		pages.length >= SUGGEST_CHUNK_THRESHOLD ? buildWindows(pages) : [pages];

	const perWindow = await Promise.all(
		windows.map((w) => requestStartPages(w)),
	);

	const merged = new Set<number>();
	for (const list of perWindow) for (const s of list) merged.add(s);

	return toSplitPoints(pages, merged);
}
