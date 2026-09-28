import { toaster } from "$lib/stores/toaster";
import { pickPdf } from "./pdfFile";

// Shared by the "Open PDF" picker and drag-and-drop: returns the PDF to open,
// or null after telling the user why nothing was opened.
export function takePdf(
	files: ArrayLike<File> | null | undefined,
): File | null {
	const pick = pickPdf(files ?? []);
	if (!pick.ok) {
		toaster.error({ title: "Couldn't open file", description: pick.error });
		return null;
	}
	if (pick.ignored > 0) {
		toaster.info({
			title: `Opened "${pick.file.name}"`,
			description: `${pick.ignored} other file${pick.ignored === 1 ? " was" : "s were"} ignored. Only one PDF can be opened at a time.`,
		});
	}
	return pick.file;
}
