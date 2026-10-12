import { toaster } from "$lib/stores/toaster";
import { pickDocument } from "./documentFile";

// Shared by the "Open file" picker and drag-and-drop: returns the file to
// open, or null after telling the user why nothing was opened.
export function takeDocument(
	files: ArrayLike<File> | null | undefined,
): File | null {
	const pick = pickDocument(files ?? []);
	if (!pick.ok) {
		toaster.error({ title: "Couldn't open file", description: pick.error });
		return null;
	}
	if (pick.ignored > 0) {
		toaster.info({
			title: `Opened "${pick.file.name}"`,
			description: `${pick.ignored} other file${pick.ignored === 1 ? " was" : "s were"} ignored. Only one file can be opened at a time.`,
		});
	}
	return pick.file;
}
