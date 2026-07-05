// Cross-route hand-off for "open this PDF" requests.
//
// The library picker (/library) is a different route than the viewer (/), so a
// click there can't call the viewer's load functions directly. It stashes the
// request here and navigates to /, where the viewer takes it once on mount.
// A saved PDF is referenced by id; a freshly opened local file is passed by value.
export type PendingPdf =
	| { type: "saved"; id: string; filename: string }
	| { type: "file"; file: File };

let pending = $state<PendingPdf | null>(null);

export const pendingPdfStore = {
	get value(): PendingPdf | null {
		return pending;
	},
	request(next: PendingPdf) {
		pending = next;
	},
	// Read and clear — the viewer consumes a pending request exactly once.
	take(): PendingPdf | null {
		const next = pending;
		pending = null;
		return next;
	},
};
