import type { DocumentType } from "@pdfwasm/shared/constants";

// Cross-route hand-off for "open this document" requests.
//
// The library picker (/library) is a different route than the viewer (/), so a
// click there can't call the viewer's load functions directly. It stashes the
// request here and navigates to /, where the viewer takes it once on mount.
// A saved document is referenced by id; a freshly opened local file is passed by
// value (and identified by content once the viewer reads it).
export type PendingPdf =
	| {
			type: "saved";
			id: string;
			documentType: DocumentType;
			filename: string;
			subtitle: string;
	  }
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
