import { getPdfiumLibrary } from "$lib/services/pdfium";
import { downloadPdf } from "$lib/services/pdf-api";
import type { PageLoad } from "./$types";

export const ssr = false;

export const load: PageLoad = async ({ parent }) => {
	const { user } = await parent();

	// Kick off both in parallel — no waterfall
	const libraryPromise = getPdfiumLibrary();
	const lastPdfPromise = user?.lastPdfId ? downloadPdf(user.lastPdfId) : null;

	return {
		libraryPromise,
		lastPdfPromise,
	};
};
