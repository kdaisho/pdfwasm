import { apiFetch } from "./api";

export interface SuggestPage {
	/** Sequence position of the page. */
	position: number;
	/** Leading text of the page. */
	text: string;
}

/**
 * Ask the server to propose document boundaries. Returns the sequence
 * positions to split AFTER (i.e. each position's page is the last of a segment).
 */
export async function suggestSplitPoints(
	pages: SuggestPage[],
): Promise<number[]> {
	const body = await apiFetch<{ splitAfter: number[] }>(
		"/pdfs/suggest-splits",
		{
			method: "POST",
			body: JSON.stringify({ pages }),
		},
	);
	return body.splitAfter;
}
