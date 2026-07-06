import { redirect } from "@sveltejs/kit";
import { resolve } from "$app/paths";
import { listPdfs, type PdfDocumentMeta } from "$lib/services/pdf-api";
import type { PageLoad } from "./$types";

export const ssr = false;

export const load: PageLoad = async ({ parent }) => {
	const { user } = await parent();
	if (!user) redirect(307, resolve("/login"));

	try {
		const pdfs = await listPdfs();
		return { pdfs, loadError: null as string | null };
	} catch (err) {
		return {
			pdfs: [] as PdfDocumentMeta[],
			loadError:
				err instanceof Error ? err.message : "Failed to load your PDFs",
		};
	}
};
