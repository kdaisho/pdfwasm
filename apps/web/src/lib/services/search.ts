import type { PageData, SearchMatch, SearchOptions } from "$lib/types";

function isWordChar(ch: string): boolean {
	return /\w/.test(ch);
}

/** Returns all positions of `query` across all pages. */
export function findMatches(
	pages: PageData[],
	query: string,
	options: SearchOptions,
): SearchMatch[] {
	if (!query.trim()) return [];

	const { caseSensitive, wholeWord } = options;
	const matches: SearchMatch[] = [];
	const normalizedQuery = caseSensitive ? query : query.toLowerCase();

	// Normalize whitespace *type* (tab/newline → space) but preserve run length:
	// page text is canonicalized to single spaces, so a query with extra spaces
	// (e.g. "  how ") must not collapse and falsely match single-spaced text.
	const normalizedQueryWs = normalizedQuery.replace(/\s/g, " ");

	for (const page of pages) {
		const rawText = page.chars.map((c) => c.char).join("");

		// Build normalized text (collapse whitespace runs to single space),
		// an index map from normalized position back to original char index,
		// and a flag per position marking whitespace that spans a line break
		// (contains \n or \r) — used to reject edge-whitespace matches below.
		const indexMap: number[] = [];
		const isLineBreak: boolean[] = [];
		let normalized = "";
		let i = 0;
		while (i < rawText.length) {
			if (/\s/.test(rawText[i])) {
				const runStart = i;
				let lineBreak = false;
				while (i < rawText.length && /\s/.test(rawText[i])) {
					if (rawText[i] === "\n" || rawText[i] === "\r")
						lineBreak = true;
					i++;
				}
				normalized += " ";
				indexMap.push(runStart);
				isLineBreak.push(lineBreak);
			} else {
				normalized += rawText[i];
				indexMap.push(i);
				isLineBreak.push(false);
				i++;
			}
		}

		const text = caseSensitive ? normalized : normalized.toLowerCase();

		let startIdx = 0;
		while (true) {
			const idx = text.indexOf(normalizedQueryWs, startIdx);
			if (idx === -1) break;

			// A leading/trailing space in the query must match an actual space,
			// not a line break. Otherwise " As with ARM" wrongly matches "As" at
			// the start of a line/sentence, where the only preceding whitespace is
			// the line break. (Internal whitespace may still span line breaks so
			// wrapped phrases like "how come" → "how\ncome" keep matching.)
			const lastQ = normalizedQueryWs.length - 1;
			const leadIsLineBreak =
				/\s/.test(normalizedQueryWs[0]) && isLineBreak[idx];
			const trailIsLineBreak =
				/\s/.test(normalizedQueryWs[lastQ]) && isLineBreak[idx + lastQ];
			if (leadIsLineBreak || trailIsLineBreak) {
				startIdx = idx + 1;
				continue;
			}

			if (wholeWord) {
				// Only require a word boundary on an edge where the query itself
				// ends in a word char. If the query starts/ends with whitespace
				// (or any non-word char), that edge is already a boundary, so the
				// adjacent text char must not be inspected — otherwise a query
				// like "how " is wrongly rejected because "come" follows it.
				const queryStartsWord = isWordChar(normalizedQueryWs[0]);
				const queryEndsWord = isWordChar(
					normalizedQueryWs[normalizedQueryWs.length - 1],
				);
				const before = idx > 0 ? text[idx - 1] : " ";
				const after =
					idx + normalizedQueryWs.length < text.length
						? text[idx + normalizedQueryWs.length]
						: " ";
				const brokenStart = queryStartsWord && isWordChar(before);
				const brokenEnd = queryEndsWord && isWordChar(after);
				if (brokenStart || brokenEnd) {
					startIdx = idx + 1;
					continue;
				}
			}

			const origStart = indexMap[idx];
			const origEnd = indexMap[idx + normalizedQueryWs.length - 1];

			matches.push({
				pageIndex: page.index,
				charIndex: origStart,
				charCount: origEnd - origStart + 1,
			});
			startIdx = idx + 1;
		}
	}

	return matches;
}
