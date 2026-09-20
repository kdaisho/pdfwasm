export interface SuggestPage {
	/** Sequence position of the page (as the client renders it). */
	position: number;
	/** Leading text of the page. */
	text: string;
}

/** Which API answers the "does this page begin a new unit?" question. */
export type SuggestProvider = "openrouter" | "anthropic";

/** True when a page carries no extractable text. */
export function isBlank(page: SuggestPage): boolean {
	return page.text.trim() === "";
}
