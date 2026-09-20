import * as anthropic from "./suggest/anthropic.js";
import * as openrouter from "./suggest/openrouter.js";
import {
	isBlank,
	type SuggestPage,
	type SuggestProvider,
} from "./suggest/types.js";

export type { SuggestPage, SuggestProvider };

/** Environment variable holding each provider's credential. */
const API_KEY_ENV: Record<SuggestProvider, string> = {
	openrouter: "OPENROUTER_API_KEY",
	anthropic: "ANTHROPIC_API_KEY",
};

function hasKey(provider: SuggestProvider): boolean {
	return Boolean(process.env[API_KEY_ENV[provider]]?.trim());
}

/**
 * The provider that will answer a suggestion request, or null when none is
 * configured (the endpoint then reports 503 rather than failing per request).
 *
 * Values name the API we hold a key for, not the model: "openrouter" serves
 * TypeSafe's Jev through its Decisions API, so it needs an OpenRouter key and
 * never a TypeSafe one.
 *
 * OpenRouter wins when its key is present; Anthropic remains the fallback
 * until KDA-63's accuracy benchmark clears Jev. SUGGEST_PROVIDER pins one explicitly
 * — a pinned provider whose key is missing counts as unconfigured rather than
 * silently falling back to the other one.
 */
export function activeProvider(): SuggestProvider | null {
	const pinned = process.env.SUGGEST_PROVIDER?.trim();
	if (pinned === "openrouter" || pinned === "anthropic") {
		return hasKey(pinned) ? pinned : null;
	}
	if (pinned) {
		// Silently auto-selecting past a typo here sends requests to a provider
		// the operator did not choose, which is near-impossible to spot.
		console.warn(
			`SUGGEST_PROVIDER="${pinned}" is not a provider (expected "openrouter" or "anthropic"); falling back to auto-selection.`,
		);
	}
	if (hasKey("openrouter")) return "openrouter";
	if (hasKey("anthropic")) return "anthropic";
	return null;
}

/** Whether the server can answer suggestion requests at all. */
export function isSuggestConfigured(): boolean {
	return activeProvider() !== null;
}

/**
 * Convert model-reported unit-start pages into validated split-after positions.
 * The model reports the first page of each new unit (the page carrying the
 * heading); we split BEFORE it (startPage - 1) so the heading/divider page
 * leads its file, advancing past any blank page so blanks stay with the
 * preceding file. Returns a sorted, de-duplicated list of valid non-final
 * positions.
 */
export function toSplitPoints(
	pages: SuggestPage[],
	startPages: Iterable<number>,
): number[] {
	const valid = new Set(pages.map((p) => p.position));
	const firstPosition = Math.min(...pages.map((p) => p.position));
	const lastPosition = Math.max(...pages.map((p) => p.position));
	const blankByPosition = new Map(pages.map((p) => [p.position, isBlank(p)]));
	const isBlankAt = (pos: number) => blankByPosition.get(pos) ?? true;

	const kept = new Set<number>();
	for (const s of startPages) {
		if (!Number.isInteger(s) || !valid.has(s)) continue;

		// A unit never starts on a blank page (books put a blank verso before a
		// chapter opener). Advance to the real opener.
		let opener = s;
		while (opener <= lastPosition && isBlankAt(opener)) opener++;
		if (opener > lastPosition || !valid.has(opener)) continue;

		const splitAt = opener - 1;
		if (splitAt >= firstPosition && splitAt < lastPosition) {
			kept.add(splitAt);
		}
	}
	return [...kept].sort((a, b) => a - b);
}

/**
 * Propose split points for a PDF: positions to split AFTER, so each position's
 * page is the last of a segment. Response shape is provider-independent.
 */
export async function suggestSplitPoints(
	pages: SuggestPage[],
): Promise<number[]> {
	const provider = activeProvider();
	if (!provider) {
		throw new Error("No AI suggestion provider is configured");
	}

	const starts =
		provider === "openrouter"
			? await openrouter.startPages(pages)
			: await anthropic.startPages(pages);

	return toSplitPoints(pages, starts);
}
