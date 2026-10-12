import JSZip from "jszip";

/**
 * Strip the trailing `.pdf` or `.epub` extension (case-insensitive), replace
 * path separators with `-`, collapse whitespace runs to a single `-`, and cap
 * at 80 chars. Non-ASCII characters are preserved. Falls back to "document"
 * when the input is empty after sanitization or not provided.
 */
export function sanitizeBasename(input: string | null | undefined): string {
	if (!input) return "document";
	let name = input.replace(/\.(?:pdf|epub)$/i, "");
	name = name.replace(/[/\\]/g, "-");
	name = name.replace(/\s+/g, "-");
	if (name.length > 80) name = name.slice(0, 80);
	return name || "document";
}

/**
 * Download split results as a single zip, `{basename}-split.zip`. Bundling
 * avoids the browser's multi-download throttling, which silently dropped
 * files past ~10 when each part was downloaded on its own (KDA-26).
 */
export async function downloadSplitZip(
	files: { name: string; data: Uint8Array | Blob }[],
	basename: string,
): Promise<void> {
	const zip = new JSZip();
	for (const { name, data } of files) {
		zip.file(name, data);
	}
	const blob = await zip.generateAsync({ type: "blob" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = `${basename}-split.zip`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
