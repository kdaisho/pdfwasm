// @vitest-environment jsdom
// readDocument parses EPUBs with the browser's DOMParser, which Node lacks.
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
	documentTitle,
	epubOpenError,
	readDocument,
	readEpubCover,
	sniffDocumentType,
	type ReadDocumentResult,
} from "./openDocument";
import type { EpubErrorCode } from "./epub";

const PDF = new TextEncoder().encode("%PDF-1.7\n%âãÏÓ\n1 0 obj\n");

const CONTAINER = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
	<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

function opf({ title = "<dc:title>The Book</dc:title>", cover = true } = {}) {
	return `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
	<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
		<dc:identifier id="id">urn:uuid:1</dc:identifier>
		${title}
		<dc:creator>Ada Author</dc:creator>
	</metadata>
	<manifest>
		<item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
		${cover ? '<item id="cover" href="images/cover.png" media-type="image/png" properties="cover-image"/>' : ""}
	</manifest>
	<spine><itemref idref="ch1"/></spine>
</package>`;
}

/** A small valid EPUB; `files` overrides or adds entries (null removes one). */
async function buildEpub(
	files: Record<string, string | null> = {},
): Promise<Uint8Array> {
	const entries: Record<string, string | null> = {
		mimetype: "application/epub+zip",
		"META-INF/container.xml": CONTAINER,
		"OEBPS/content.opf": opf(),
		"OEBPS/ch1.xhtml": `<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Hi</p></body></html>`,
		"OEBPS/images/cover.png": "png-bytes",
		...files,
	};
	const zip = new JSZip();
	for (const [path, content] of Object.entries(entries)) {
		if (content === null) continue;
		zip.file(path, content, {
			compression: path === "mimetype" ? "STORE" : "DEFLATE",
		});
	}
	return zip.generateAsync({ type: "uint8array" });
}

const DRM_ENCRYPTION = `<?xml version="1.0"?>
<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#">
	<enc:EncryptedData>
		<enc:EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/>
		<enc:CipherData><enc:CipherReference URI="OEBPS/ch1.xhtml"/></enc:CipherData>
	</enc:EncryptedData>
</encryption>`;

function expectError(result: ReadDocumentResult) {
	expect(result.ok).toBe(false);
	if (result.ok) throw new Error("expected an error");
	return result.error;
}

describe("sniffDocumentType", () => {
	it("recognizes the PDF header", () => {
		expect(sniffDocumentType(PDF)).toBe("pdf");
	});

	it("recognizes a PDF header after leading junk", () => {
		const bytes = new Uint8Array([0, 0, 0, ...PDF]);
		expect(sniffDocumentType(bytes)).toBe("pdf");
	});

	it("recognizes a zip archive", async () => {
		expect(sniffDocumentType(await buildEpub())).toBe("zip");
	});

	it("returns null for anything else", () => {
		expect(sniffDocumentType(new TextEncoder().encode("hello"))).toBe(null);
		expect(sniffDocumentType(new Uint8Array())).toBe(null);
	});
});

describe("readDocument", () => {
	it("opens a PDF as a PDF", async () => {
		const result = await readDocument(PDF, "report.pdf");
		expect(result).toEqual({
			ok: true,
			document: { type: "pdf", bytes: PDF },
		});
	});

	it("opens an EPUB and exposes its parsed book", async () => {
		const bytes = await buildEpub();
		const result = await readDocument(bytes, "book.epub");

		expect(result.ok).toBe(true);
		if (!result.ok || result.document.type !== "epub") return;
		expect(result.document.bytes).toBe(bytes);
		expect(result.document.epub.book.metadata.title).toBe("The Book");
		expect(result.document.epub.book.metadata.creators).toEqual([
			"Ada Author",
		]);
	});

	it("goes by content, not extension: an EPUB named .pdf opens as an EPUB", async () => {
		const result = await readDocument(await buildEpub(), "misnamed.pdf");
		expect(result.ok && result.document.type).toBe("epub");
	});

	it("goes by content, not extension: a PDF named .epub opens as a PDF", async () => {
		const result = await readDocument(PDF, "misnamed.epub");
		expect(result.ok && result.document.type).toBe("pdf");
	});

	it("rejects a zip without an EPUB mimetype entry", async () => {
		const error = expectError(
			await readDocument(
				await buildEpub({ mimetype: null }),
				"no-mimetype.epub",
			),
		);
		expect(error.title).toBe("Couldn't open file");
		expect(error.description).toMatch(/no-mimetype\.epub.*isn't an EPUB/);
	});

	it("rejects a zip whose mimetype names another format", async () => {
		const error = expectError(
			await readDocument(
				await buildEpub({
					mimetype: "application/vnd.oasis.opendocument.text",
				}),
				"letter.odt",
			),
		);
		expect(error.description).toMatch(/isn't an EPUB/);
	});

	it("rejects a plain zip archive", async () => {
		const zip = new JSZip();
		zip.file("photo.txt", "x");
		const bytes = await zip.generateAsync({ type: "uint8array" });

		const error = expectError(await readDocument(bytes, "photos.zip"));
		expect(error.description).toMatch(/photos\.zip/);
	});

	it("tries the EPUB parser for a non-zip file named .epub", async () => {
		const error = expectError(
			await readDocument(
				new TextEncoder().encode("plain text"),
				"broken.epub",
			),
		);
		expect(error.description).toBe(
			epubOpenError("invalid-zip", "broken.epub").description,
		);
	});

	it("hands unrecognized bytes with any other name to the PDF viewer, as before", async () => {
		const bytes = new TextEncoder().encode("not really a pdf");
		const result = await readDocument(bytes, "odd.pdf");
		expect(result).toEqual({ ok: true, document: { type: "pdf", bytes } });
	});

	it("reports a DRM-protected EPUB with its own message", async () => {
		const error = expectError(
			await readDocument(
				await buildEpub({ "META-INF/encryption.xml": DRM_ENCRYPTION }),
				"locked.epub",
			),
		);
		expect(error.title).toMatch(/DRM/);
		expect(error.description).toMatch(/locked\.epub/);
	});

	it("reports a damaged EPUB whose package document is missing", async () => {
		const error = expectError(
			await readDocument(
				await buildEpub({ "OEBPS/content.opf": null }),
				"damaged.epub",
			),
		);
		expect(error.description).toBe(
			epubOpenError("missing-package", "damaged.epub").description,
		);
	});
});

describe("epubOpenError", () => {
	const codes: (EpubErrorCode | "not-epub")[] = [
		"invalid-zip",
		"missing-container",
		"missing-package",
		"invalid-package",
		"missing-resource",
		"not-epub",
	];

	it("gives every failure a distinct, readable reason naming the file", () => {
		const descriptions = codes.map(
			(code) => epubOpenError(code, "x.epub").description,
		);
		for (const description of descriptions) {
			expect(description).toMatch(/^"x\.epub" /);
		}
		expect(new Set(descriptions).size).toBe(codes.length);
	});

	it("titles DRM differently from other failures", () => {
		const drm = epubOpenError("drm-encrypted", "x.epub");
		expect(drm.title).not.toBe(epubOpenError("invalid-zip", "x").title);
		expect(drm.description).toMatch(/DRM-free/);
	});
});

describe("readEpubCover", () => {
	it("returns the cover image with its media type", async () => {
		const result = await readDocument(await buildEpub(), "book.epub");
		if (!result.ok || result.document.type !== "epub") throw new Error();

		const cover = await readEpubCover(result.document.epub);

		expect(cover?.type).toBe("image/png");
		expect(await cover?.text()).toBe("png-bytes");
	});

	it("returns null when the book declares no cover", async () => {
		const result = await readDocument(
			await buildEpub({ "OEBPS/content.opf": opf({ cover: false }) }),
			"book.epub",
		);
		if (!result.ok || result.document.type !== "epub") throw new Error();

		expect(await readEpubCover(result.document.epub)).toBe(null);
	});

	it("returns null when the declared cover file is missing", async () => {
		const result = await readDocument(
			await buildEpub({ "OEBPS/images/cover.png": null }),
			"book.epub",
		);
		if (!result.ok || result.document.type !== "epub") throw new Error();

		expect(await readEpubCover(result.document.epub)).toBe(null);
	});
});

describe("documentTitle", () => {
	it("uses the book's own title", async () => {
		const result = await readDocument(await buildEpub(), "file.epub");
		if (!result.ok || result.document.type !== "epub") throw new Error();
		expect(documentTitle(result.document.epub.book, "file.epub")).toBe(
			"The Book",
		);
	});

	it("falls back on the filename without its extension", async () => {
		const result = await readDocument(
			await buildEpub({ "OEBPS/content.opf": opf({ title: "" }) }),
			"My Novel.epub",
		);
		if (!result.ok || result.document.type !== "epub") throw new Error();
		expect(documentTitle(result.document.epub.book, "My Novel.epub")).toBe(
			"My Novel",
		);
	});
});
