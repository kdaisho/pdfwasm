import { describe, expect, it } from "vitest";
import type { PageData } from "$lib/types";
import { findMatches, findMatchesPerPage, type SearchCache } from "./search";

function makePage(index: number, text: string): PageData {
	return {
		index,
		width: 100,
		height: 100,
		originalWidth: 50,
		originalHeight: 50,
		scale: 2,
		chars: [...text].map((char) => ({
			char,
			left: 0,
			right: 1,
			bottom: 0,
			top: 1,
		})),
	};
}

const opts = { caseSensitive: false, wholeWord: false };

describe("findMatchesPerPage", () => {
	it("agrees with findMatches, grouped by page", () => {
		const pages = [
			makePage(0, "fox and fox"),
			makePage(1, "no match"),
			makePage(2, "Fox"),
		];
		const perPage = findMatchesPerPage(pages, "fox", opts, new WeakMap());
		expect(perPage.map((m) => m.length)).toEqual([2, 0, 1]);
		expect(perPage.flat()).toEqual(findMatches(pages, "fox", opts));
	});

	it("reuses cached results for unchanged pages", () => {
		const cache: SearchCache = new WeakMap();
		const pages = [makePage(0, "fox"), makePage(1, "")];
		const first = findMatchesPerPage(pages, "fox", opts, cache);

		// Simulate background extraction filling in page 1.
		pages[1] = { ...pages[1], chars: makePage(1, "a fox").chars };
		const second = findMatchesPerPage(pages, "fox", opts, cache);

		expect(second[0]).toBe(first[0]);
		expect(second[1]).toEqual([
			{ pageIndex: 1, charIndex: 2, charCount: 3 },
		]);
	});

	it("recomputes when the query or options change", () => {
		const cache: SearchCache = new WeakMap();
		const pages = [makePage(0, "Fox fox")];
		expect(findMatchesPerPage(pages, "fox", opts, cache)[0]).toHaveLength(
			2,
		);
		expect(findMatchesPerPage(pages, "fo", opts, cache)[0]).toHaveLength(2);
		expect(
			findMatchesPerPage(
				pages,
				"fox",
				{ caseSensitive: true, wholeWord: false },
				cache,
			)[0],
		).toHaveLength(1);
	});
});
