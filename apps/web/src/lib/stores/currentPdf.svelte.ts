// The PDF currently open in the viewer, surfaced as the "Now viewing" dock in the
// sidebar. The dock lives in the persistent layout, so this store outlives route
// changes — that's what lets the picker's fly-to-dock animation land on a target
// that's still there after navigating from /library to the viewer.
export interface CurrentPdf {
	/** Saved-PDF id, when known — drives the dock's first-page thumbnail. */
	id: string | null;
	filename: string;
	/** e.g. "2.9 MB · 6/7/2026"; omitted when size/date aren't known. */
	subtitle: string | null;
}

let current = $state<CurrentPdf | null>(null);

export const currentPdfStore = {
	get value(): CurrentPdf | null {
		return current;
	},
	set(next: CurrentPdf) {
		current = next;
	},
	clear() {
		current = null;
	},
};
