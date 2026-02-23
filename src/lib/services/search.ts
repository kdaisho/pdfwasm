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

	const normalizedQueryWs = normalizedQuery.replace(/\s+/g, " ");

	for (const page of pages) {
		const rawText = page.chars.map((c) => c.char).join("");

		// Build normalized text (collapse whitespace runs to single space)
		// and an index map from normalized position back to original char index
		const indexMap: number[] = [];
		let normalized = "";
		let i = 0;
		while (i < rawText.length) {
			if (/\s/.test(rawText[i])) {
				normalized += " ";
				indexMap.push(i);
				while (i < rawText.length && /\s/.test(rawText[i])) i++;
			} else {
				normalized += rawText[i];
				indexMap.push(i);
				i++;
			}
		}

		const text = caseSensitive ? normalized : normalized.toLowerCase();

		let startIdx = 0;
		while (true) {
			const idx = text.indexOf(normalizedQueryWs, startIdx);
			if (idx === -1) break;

			if (wholeWord) {
				const before = idx > 0 ? text[idx - 1] : " ";
				const after =
					idx + normalizedQueryWs.length < text.length
						? text[idx + normalizedQueryWs.length]
						: " ";
				if (isWordChar(before) || isWordChar(after)) {
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
