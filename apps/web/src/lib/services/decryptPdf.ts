import { PDFDocument } from "pdf-lib";

/**
 * Encrypted-source handling for export.
 *
 * pdf-lib cannot decrypt content streams — with `ignoreEncryption: true` it
 * loads the doc but copies still-encrypted bytes, producing garbled pages.
 * PDFium *can* decrypt (it renders these files fine) but the prebuilt
 * `@hyzyla/pdfium` Wasm exposes no way to register the FPDF_SaveAsCopy write
 * callback (no `addFunction`, fixed function table), so we can't re-serialize a
 * decrypted copy through it either.
 *
 * Until a real decryptor is wired in, we *detect* encryption and refuse the
 * export with a clear message rather than silently emitting corrupt output.
 */

/** Thrown when a source PDF is encrypted and therefore can't be exported yet. */
export class EncryptedSourceError extends Error {
	constructor(label: string) {
		super(
			`"${label}" is encrypted, so the export can't continue. Open it in ` +
				"another app, re-save an unencrypted copy, and try again.",
		);
		this.name = "EncryptedSourceError";
	}
}

/**
 * Whether a PDF carries an encryption dictionary. PDFium still renders these
 * (empty-password docs decrypt transparently), but pdf-lib can't export them —
 * use this to warn the user at ingestion. `ignoreEncryption` lets the probe
 * load without throwing; we only read the flag.
 */
export async function isPdfEncrypted(bytes: Uint8Array): Promise<boolean> {
	const probe = await PDFDocument.load(bytes, { ignoreEncryption: true });
	return probe.isEncrypted;
}

/**
 * Return export-safe bytes for a source PDF. Throws {@link EncryptedSourceError}
 * (naming `label`) if the document is encrypted; otherwise returns the original
 * bytes unchanged. `label` should identify the file to the user (e.g. its name).
 */
export async function normalizePdfBytes(
	bytes: Uint8Array,
	label: string,
): Promise<Uint8Array> {
	if (await isPdfEncrypted(bytes)) throw new EncryptedSourceError(label);
	return bytes;
}
