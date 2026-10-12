// @vitest-environment jsdom
// The parser uses the browser's native DOMParser. Vitest runs in Node, which
// has none, so this file opts into jsdom (a spec-compliant, namespace-aware
// XML parser) instead of changing the global test environment.
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { EpubError, parseEpub, resolveHref, type EpubErrorCode } from "./epub";

/**
 * Zip `files` into an EPUB. `mimetype` is written first and uncompressed, as
 * the OCF spec requires, unless the caller supplies its own entry.
 */
async function buildEpub(
	files: Record<string, string | Uint8Array>,
): Promise<Uint8Array> {
	const zip = new JSZip();
	if (!("mimetype" in files)) {
		zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
	}
	for (const [path, content] of Object.entries(files)) {
		zip.file(path, content);
	}
	return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

const container = (opfPath: string) => `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
	<rootfiles>
		<rootfile full-path="${opfPath}" media-type="application/oebps-package+xml"/>
	</rootfiles>
</container>`;

const xhtml = (
	title: string,
	body = "",
) => `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${title}</title></head><body>${body}</body></html>`;

/** Expect `promise` to reject with an `EpubError` carrying `code`. */
async function expectEpubError(
	promise: Promise<unknown>,
	code: EpubErrorCode,
): Promise<void> {
	const error = await promise.then(
		() => null,
		(e: unknown) => e,
	);
	expect(error).toBeInstanceOf(EpubError);
	expect((error as EpubError).code).toBe(code);
}

/**
 * EPUB 3 book with its package document in `OEBPS/`, the nav document one
 * level deeper in `OEBPS/toc/` (so nav hrefs climb with `../`), a
 * percent-encoded cover href, and an NCX that must be ignored in favor of nav.
 */
function epub3Files(): Record<string, string> {
	return {
		"META-INF/container.xml": container("OEBPS/package.opf"),
		"OEBPS/package.opf": `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="en">
	<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
		<dc:identifier id="isbn">urn:isbn:9780000000000</dc:identifier>
		<dc:identifier id="pub-id">urn:uuid:1b4e28ba-2fa1-11d2-883f-0016d3cca427</dc:identifier>
		<dc:title>  The   Modern
			Book </dc:title>
		<dc:title>A Subtitle</dc:title>
		<dc:creator id="a1">Ada Author</dc:creator>
		<dc:creator>Bea Writer</dc:creator>
		<dc:language>en-GB</dc:language>
		<dc:publisher>Example Press</dc:publisher>
		<meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
	</metadata>
	<manifest>
		<item id="nav" href="toc/nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
		<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
		<item id="ch1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>
		<item id="ch2" href="text/ch2.xhtml" media-type="application/xhtml+xml" properties="scripted svg"/>
		<item id="notes" href="text/notes.xhtml" media-type="application/xhtml+xml"/>
		<item id="cover" href="images/cover%20art.jpg" media-type="image/jpeg" properties="cover-image"/>
		<item id="audio" href="https://example.com/a.mp3" media-type="audio/mpeg"/>
	</manifest>
	<spine toc="ncx" page-progression-direction="ltr">
		<itemref idref="ch1"/>
		<itemref idref="ch2" properties="page-spread-right"/>
		<itemref idref="notes" linear="no"/>
		<itemref idref="missing"/>
	</spine>
</package>`,
		"OEBPS/toc/nav.xhtml": `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Contents</title></head>
<body>
	<nav epub:type="toc" id="toc">
		<h1>Contents</h1>
		<ol>
			<li><span>Part <em>One</em></span>
				<ol>
					<li><a href="../text/ch1.xhtml">Chapter 1</a></li>
					<li><a href="../text/ch1.xhtml#sec%202">Chapter 1, Section 2</a>
						<ol><li><a href="../text/ch1.xhtml#deep">Deep</a></li></ol>
					</li>
				</ol>
			</li>
			<li><a href="../text/ch2.xhtml#start">Chapter 2</a></li>
		</ol>
	</nav>
	<nav epub:type="landmarks">
		<ol>
			<li><a epub:type="toc" href="nav.xhtml#toc">Table of Contents</a></li>
			<li><a epub:type="bodymatter" href="../text/ch1.xhtml">Start Reading</a></li>
		</ol>
	</nav>
	<nav epub:type="page-list" hidden="">
		<ol>
			<li><a href="../text/ch1.xhtml#page1">1</a></li>
			<li><a href="../text/ch2.xhtml#page2">2</a></li>
		</ol>
	</nav>
</body>
</html>`,
		"OEBPS/toc.ncx": `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
	<navMap><navPoint id="n1"><navLabel><text>From NCX</text></navLabel><content src="text/ch1.xhtml"/></navPoint></navMap>
</ncx>`,
		"OEBPS/text/ch1.xhtml": xhtml("Chapter 1", "<p>One</p>"),
		"OEBPS/text/ch2.xhtml": xhtml("Chapter 2"),
		"OEBPS/text/notes.xhtml": xhtml("Notes"),
		"OEBPS/images/cover art.jpg": "jpeg-bytes",
	};
}

/**
 * EPUB 2 book with its package document at the zip root (empty directory),
 * an NCX table of contents with nested navPoints and a pageList, a `<guide>`,
 * and the cover declared with `<meta name="cover">`.
 */
function epub2Files(): Record<string, string> {
	return {
		"META-INF/container.xml": container("content.opf"),
		"content.opf": `<?xml version="1.0" encoding="UTF-8"?>
<opf:package xmlns:opf="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="BookId">
	<opf:metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
		<dc:title>Old Book</dc:title>
		<dc:creator opf:role="aut">Carl Classic</dc:creator>
		<dc:language>fr</dc:language>
		<dc:identifier id="BookId" opf:scheme="ISBN">123456789X</dc:identifier>
		<opf:meta name="cover" content="cover-img"/>
	</opf:metadata>
	<opf:manifest>
		<opf:item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
		<opf:item id="c1" href="chapter1.html" media-type="application/xhtml+xml"/>
		<opf:item id="c2" href="chapter2.html" media-type="application/xhtml+xml"/>
		<opf:item id="cover-img" href="cover.png" media-type="image/png"/>
	</opf:manifest>
	<opf:spine toc="ncx">
		<opf:itemref idref="c1"/>
		<opf:itemref idref="c2"/>
	</opf:spine>
	<opf:guide>
		<opf:reference type="toc" title="Contents" href="chapter1.html#contents"/>
		<opf:reference type="text" title="Begin" href="chapter2.html"/>
	</opf:guide>
</opf:package>`,
		"toc.ncx": `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
	<head><meta name="dtb:uid" content="123456789X"/></head>
	<docTitle><text>Old Book</text></docTitle>
	<navMap>
		<navPoint id="p1" playOrder="1">
			<navLabel><text>Chapter 1</text></navLabel>
			<content src="chapter1.html"/>
			<navPoint id="p1-1" playOrder="2">
				<navLabel><text>Section 1.1</text></navLabel>
				<content src="chapter1.html#s1"/>
			</navPoint>
		</navPoint>
		<navPoint id="p2" playOrder="3">
			<navLabel><text>Chapter 2</text></navLabel>
			<content src="chapter2.html"/>
		</navPoint>
	</navMap>
	<pageList>
		<pageTarget id="pg1" type="normal" value="1"><navLabel><text>1</text></navLabel><content src="chapter1.html#pg1"/></pageTarget>
		<pageTarget id="pg2" type="normal" value="2"><navLabel><text>2</text></navLabel><content src="chapter2.html#pg2"/></pageTarget>
	</pageList>
</ncx>`,
		"chapter1.html": xhtml("Chapter 1"),
		"chapter2.html": xhtml("Chapter 2"),
		"cover.png": "png-bytes",
	};
}

/** Minimal EPUB 3 package; `extra` is spliced into the manifest/metadata. */
function minimalEpub3(opts: {
	metadata?: string;
	manifest?: string;
	spine?: string;
}): Record<string, string> {
	return {
		"META-INF/container.xml": container("book.opf"),
		"book.opf": `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
	<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
		<dc:identifier id="id">urn:uuid:minimal</dc:identifier>
		<dc:title>Minimal</dc:title>
		<dc:language>en</dc:language>
		${opts.metadata ?? ""}
	</metadata>
	<manifest>
		<item id="p1" href="p1.xhtml" media-type="application/xhtml+xml"/>
		<item id="p2" href="p2.xhtml" media-type="application/xhtml+xml"/>
		${opts.manifest ?? ""}
	</manifest>
	<spine>${opts.spine ?? '<itemref idref="p1"/><itemref idref="p2"/>'}</spine>
</package>`,
		"p1.xhtml": xhtml("Page 1"),
		"p2.xhtml": xhtml("Page 2"),
	};
}

const encryptionXml = (
	entries: { algorithm: string; uri: string }[],
) => `<?xml version="1.0" encoding="UTF-8"?>
<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#">
${entries
	.map(
		({ algorithm, uri }) => `	<enc:EncryptedData>
		<enc:EncryptionMethod Algorithm="${algorithm}"/>
		<enc:CipherData><enc:CipherReference URI="${uri}"/></enc:CipherData>
	</enc:EncryptedData>`,
	)
	.join("\n")}
</encryption>`;

describe("parseEpub (EPUB 3)", () => {
	it("resolves the package document through container.xml", async () => {
		const { book } = await parseEpub(await buildEpub(epub3Files()));
		expect(book.version).toBe("3.0");
		expect(book.packagePath).toBe("OEBPS/package.opf");
		expect(book.packageDirectory).toBe("OEBPS/");
	});

	it("reads metadata, using the unique-identifier for the identifier", async () => {
		const { book } = await parseEpub(await buildEpub(epub3Files()));
		expect(book.metadata).toEqual({
			title: "The Modern Book",
			creators: ["Ada Author", "Bea Writer"],
			language: "en-GB",
			identifier: "urn:uuid:1b4e28ba-2fa1-11d2-883f-0016d3cca427",
			publisher: "Example Press",
			description: null,
			date: null,
			modified: "2026-01-01T00:00:00Z",
		});
	});

	it("resolves manifest hrefs to zip paths and keeps the original href", async () => {
		const { book } = await parseEpub(await buildEpub(epub3Files()));
		const byId = Object.fromEntries(book.manifest.map((m) => [m.id, m]));
		expect(byId.ch2).toEqual({
			id: "ch2",
			href: "text/ch2.xhtml",
			path: "OEBPS/text/ch2.xhtml",
			mediaType: "application/xhtml+xml",
			properties: ["scripted", "svg"],
			remote: false,
		});
		expect(byId.cover.href).toBe("images/cover%20art.jpg");
		expect(byId.cover.path).toBe("OEBPS/images/cover art.jpg");
		expect(byId.audio).toMatchObject({
			path: "https://example.com/a.mp3",
			remote: true,
		});
	});

	it("returns the spine in reading order and skips unknown idrefs", async () => {
		const { book } = await parseEpub(await buildEpub(epub3Files()));
		expect(book.spine).toEqual([
			{
				index: 0,
				idref: "ch1",
				href: "text/ch1.xhtml",
				path: "OEBPS/text/ch1.xhtml",
				mediaType: "application/xhtml+xml",
				linear: true,
				properties: [],
				layout: "reflowable",
			},
			{
				index: 1,
				idref: "ch2",
				href: "text/ch2.xhtml",
				path: "OEBPS/text/ch2.xhtml",
				mediaType: "application/xhtml+xml",
				linear: true,
				properties: ["page-spread-right"],
				layout: "reflowable",
			},
			{
				index: 2,
				idref: "notes",
				href: "text/notes.xhtml",
				path: "OEBPS/text/notes.xhtml",
				mediaType: "application/xhtml+xml",
				linear: false,
				properties: [],
				layout: "reflowable",
			},
		]);
		expect(book.pageProgressionDirection).toBe("ltr");
	});

	it("reads the nested table of contents from nav, resolving hrefs relative to the nav document", async () => {
		const { book } = await parseEpub(await buildEpub(epub3Files()));
		expect(book.tocSource).toBe("nav");
		expect(book.navPath).toBe("OEBPS/toc/nav.xhtml");
		expect(book.ncxPath).toBe("OEBPS/toc.ncx");
		expect(book.toc).toEqual([
			{
				label: "Part One",
				href: null,
				path: null,
				fragment: null,
				children: [
					{
						label: "Chapter 1",
						href: "../text/ch1.xhtml",
						path: "OEBPS/text/ch1.xhtml",
						fragment: null,
						children: [],
					},
					{
						label: "Chapter 1, Section 2",
						href: "../text/ch1.xhtml#sec%202",
						path: "OEBPS/text/ch1.xhtml",
						fragment: "sec 2",
						children: [
							{
								label: "Deep",
								href: "../text/ch1.xhtml#deep",
								path: "OEBPS/text/ch1.xhtml",
								fragment: "deep",
								children: [],
							},
						],
					},
				],
			},
			{
				label: "Chapter 2",
				href: "../text/ch2.xhtml#start",
				path: "OEBPS/text/ch2.xhtml",
				fragment: "start",
				children: [],
			},
		]);
	});

	it("reads landmarks and the page list from nav", async () => {
		const { book } = await parseEpub(await buildEpub(epub3Files()));
		expect(book.landmarks).toEqual([
			{
				type: "toc",
				label: "Table of Contents",
				href: "nav.xhtml#toc",
				path: "OEBPS/toc/nav.xhtml",
				fragment: "toc",
			},
			{
				type: "bodymatter",
				label: "Start Reading",
				href: "../text/ch1.xhtml",
				path: "OEBPS/text/ch1.xhtml",
				fragment: null,
			},
		]);
		expect(book.pageList).toEqual([
			{
				label: "1",
				href: "../text/ch1.xhtml#page1",
				path: "OEBPS/text/ch1.xhtml",
				fragment: "page1",
			},
			{
				label: "2",
				href: "../text/ch2.xhtml#page2",
				path: "OEBPS/text/ch2.xhtml",
				fragment: "page2",
			},
		]);
	});

	it("finds the cover image by the cover-image property", async () => {
		const { book } = await parseEpub(await buildEpub(epub3Files()));
		expect(book.cover?.id).toBe("cover");
		expect(book.cover?.path).toBe("OEBPS/images/cover art.jpg");
	});

	it("is reflowable with no encrypted resources by default", async () => {
		const { book } = await parseEpub(await buildEpub(epub3Files()));
		expect(book.layout).toBe("reflowable");
		expect(book.obfuscatedResources).toEqual([]);
	});

	it("lists every zip entry and reads them through the archive", async () => {
		const { book, archive } = await parseEpub(
			await buildEpub(epub3Files()),
		);
		expect(book.files).toContain("mimetype");
		expect(book.files).toContain("OEBPS/images/cover art.jpg");
		expect(book.files).not.toContain("OEBPS/");
		expect(archive.paths).toEqual(book.files);
		expect(archive.has(book.spine[0].path)).toBe(true);
		expect(await archive.readText(book.spine[0].path)).toContain(
			"<p>One</p>",
		);
		expect(
			new TextDecoder().decode(await archive.readBytes(book.cover!.path)),
		).toBe("jpeg-bytes");
		expect(archive.has("OEBPS/nope.xhtml")).toBe(false);
		await expectEpubError(
			archive.readText("OEBPS/nope.xhtml"),
			"missing-resource",
		);
	});

	it("produces plain, serializable data", async () => {
		const { book } = await parseEpub(await buildEpub(epub3Files()));
		expect(structuredClone(book)).toEqual(book);
		expect(JSON.parse(JSON.stringify(book))).toEqual(book);
	});

	it("falls back to HTML parsing for a nav document that is not well-formed XML", async () => {
		const files = minimalEpub3({
			manifest:
				'<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
		});
		files["nav.xhtml"] =
			`<html xmlns:epub="http://www.idpf.org/2007/ops"><body>
			<nav epub:type="toc"><ol><li><a href="p1.xhtml">Page&nbsp;1</a><li><a href="p2.xhtml">Page 2</a></ol></nav>
		</body></html>`;
		const { book } = await parseEpub(await buildEpub(files));
		expect(book.tocSource).toBe("nav");
		expect(book.toc.map((t) => [t.label, t.path])).toEqual([
			["Page 1", "p1.xhtml"],
			["Page 2", "p2.xhtml"],
		]);
	});
});

describe("parseEpub (EPUB 2)", () => {
	it("reads metadata and the spine from a prefixed OPF at the zip root", async () => {
		const { book } = await parseEpub(await buildEpub(epub2Files()));
		expect(book.version).toBe("2.0");
		expect(book.packagePath).toBe("content.opf");
		expect(book.packageDirectory).toBe("");
		expect(book.metadata).toMatchObject({
			title: "Old Book",
			creators: ["Carl Classic"],
			language: "fr",
			identifier: "123456789X",
			modified: null,
		});
		expect(book.spine.map((s) => s.path)).toEqual([
			"chapter1.html",
			"chapter2.html",
		]);
		expect(book.pageProgressionDirection).toBeNull();
	});

	it("reads the nested table of contents and page list from the NCX", async () => {
		const { book } = await parseEpub(await buildEpub(epub2Files()));
		expect(book.tocSource).toBe("ncx");
		expect(book.navPath).toBeNull();
		expect(book.ncxPath).toBe("toc.ncx");
		expect(book.toc).toEqual([
			{
				label: "Chapter 1",
				href: "chapter1.html",
				path: "chapter1.html",
				fragment: null,
				children: [
					{
						label: "Section 1.1",
						href: "chapter1.html#s1",
						path: "chapter1.html",
						fragment: "s1",
						children: [],
					},
				],
			},
			{
				label: "Chapter 2",
				href: "chapter2.html",
				path: "chapter2.html",
				fragment: null,
				children: [],
			},
		]);
		expect(book.pageList.map((p) => [p.label, p.fragment])).toEqual([
			["1", "pg1"],
			["2", "pg2"],
		]);
	});

	it("reads landmarks from the guide", async () => {
		const { book } = await parseEpub(await buildEpub(epub2Files()));
		expect(book.landmarks).toEqual([
			{
				type: "toc",
				label: "Contents",
				href: "chapter1.html#contents",
				path: "chapter1.html",
				fragment: "contents",
			},
			{
				type: "text",
				label: "Begin",
				href: "chapter2.html",
				path: "chapter2.html",
				fragment: null,
			},
		]);
	});

	it('finds the cover image through <meta name="cover">', async () => {
		const { book } = await parseEpub(await buildEpub(epub2Files()));
		expect(book.cover).toMatchObject({
			id: "cover-img",
			path: "cover.png",
			mediaType: "image/png",
		});
	});
});

describe("parseEpub (edge cases)", () => {
	it("returns an empty contents list when the book has neither nav nor NCX", async () => {
		const { book } = await parseEpub(await buildEpub(minimalEpub3({})));
		expect(book.toc).toEqual([]);
		expect(book.tocSource).toBeNull();
		expect(book.landmarks).toEqual([]);
		expect(book.pageList).toEqual([]);
		expect(book.cover).toBeNull();
		expect(book.navPath).toBeNull();
		expect(book.ncxPath).toBeNull();
		expect(book.spine).toHaveLength(2);
	});

	it("detects fixed-layout books and per-item layout overrides", async () => {
		const files = minimalEpub3({
			metadata: '<meta property="rendition:layout">pre-paginated</meta>',
			spine: '<itemref idref="p1"/><itemref idref="p2" properties="rendition:layout-reflowable"/>',
		});
		const { book } = await parseEpub(await buildEpub(files));
		expect(book.layout).toBe("pre-paginated");
		expect(book.spine.map((s) => s.layout)).toEqual([
			"pre-paginated",
			"reflowable",
		]);
	});

	it("rejects DRM-encrypted books", async () => {
		const files = minimalEpub3({});
		files["META-INF/encryption.xml"] = encryptionXml([
			{
				algorithm: "http://www.w3.org/2001/04/xmlenc#aes128-cbc",
				uri: "p1.xhtml",
			},
		]);
		files["META-INF/rights.xml"] = "<rights/>";
		await expectEpubError(
			parseEpub(await buildEpub(files)),
			"drm-encrypted",
		);
	});

	it("accepts books whose encryption.xml only obfuscates fonts", async () => {
		const files = minimalEpub3({});
		files["META-INF/encryption.xml"] = encryptionXml([
			{
				algorithm: "http://www.idpf.org/2008/embedding",
				uri: "fonts/a.otf",
			},
			{
				algorithm: "http://ns.adobe.com/pdf/enc#RC",
				uri: "fonts/b%20c.ttf",
			},
		]);
		const { book } = await parseEpub(await buildEpub(files));
		expect(book.obfuscatedResources).toEqual([
			{ path: "fonts/a.otf", algorithm: "idpf" },
			{ path: "fonts/b c.ttf", algorithm: "adobe" },
		]);
	});

	it("rejects a file that is not a zip", async () => {
		await expectEpubError(
			parseEpub(new TextEncoder().encode("%PDF-1.7 not a zip")),
			"invalid-zip",
		);
	});

	it("rejects a zip without META-INF/container.xml", async () => {
		const files = minimalEpub3({});
		delete files["META-INF/container.xml"];
		await expectEpubError(
			parseEpub(await buildEpub(files)),
			"missing-container",
		);
	});

	it("rejects a container.xml without a rootfile", async () => {
		const files = minimalEpub3({});
		files["META-INF/container.xml"] =
			'<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles/></container>';
		await expectEpubError(
			parseEpub(await buildEpub(files)),
			"missing-container",
		);
	});

	it("rejects a container.xml pointing at a missing package document", async () => {
		const files = minimalEpub3({});
		files["META-INF/container.xml"] = container("OEBPS/content.opf");
		await expectEpubError(
			parseEpub(await buildEpub(files)),
			"missing-package",
		);
	});

	it("rejects a malformed package document", async () => {
		const files = minimalEpub3({});
		files["book.opf"] = "<package><metadata></package>";
		await expectEpubError(
			parseEpub(await buildEpub(files)),
			"invalid-package",
		);
	});

	it("rejects a package document with an empty spine", async () => {
		await expectEpubError(
			parseEpub(await buildEpub(minimalEpub3({ spine: "" }))),
			"invalid-package",
		);
	});
});

describe("resolveHref", () => {
	it("resolves relative to the referencing file's directory", () => {
		expect(resolveHref("OEBPS/content.opf", "text/a.xhtml")).toEqual({
			path: "OEBPS/text/a.xhtml",
			fragment: null,
		});
		expect(resolveHref("OEBPS/toc/nav.xhtml", "../text/a.xhtml#x")).toEqual(
			{ path: "OEBPS/text/a.xhtml", fragment: "x" },
		);
		expect(resolveHref("content.opf", "./a.xhtml")).toEqual({
			path: "a.xhtml",
			fragment: null,
		});
	});

	it("decodes percent-encoding and drops query strings", () => {
		expect(resolveHref("OEBPS/c.opf", "my%20file.xhtml?v=2#a%20b")).toEqual(
			{
				path: "OEBPS/my file.xhtml",
				fragment: "a b",
			},
		);
	});

	it("resolves a bare fragment to the referencing file", () => {
		expect(resolveHref("OEBPS/text/a.xhtml", "#note1")).toEqual({
			path: "OEBPS/text/a.xhtml",
			fragment: "note1",
		});
	});

	it("treats a leading slash as the zip root", () => {
		expect(resolveHref("OEBPS/text/a.xhtml", "/images/x.png")).toEqual({
			path: "images/x.png",
			fragment: null,
		});
	});

	it("returns null for external URLs", () => {
		expect(resolveHref("OEBPS/a.xhtml", "https://example.com/")).toBeNull();
		expect(resolveHref("OEBPS/a.xhtml", "mailto:a@b.c")).toBeNull();
	});
});
