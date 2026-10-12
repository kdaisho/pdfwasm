// @vitest-environment jsdom
// The writer parses and serializes XHTML with the browser's DOMParser and
// XMLSerializer. Vitest runs in Node, which has neither, so this file opts
// into jsdom, as epub.test.ts does.
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { parseEpub, resolveHref, type EpubTocEntry } from "./epub";
import {
	downloadSplitEpubs,
	splitEpub,
	type EpubSegment,
	type SplitEpubOutput,
} from "./splitEpub";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

async function buildEpub(
	files: Record<string, string | Uint8Array>,
): Promise<Uint8Array> {
	const zip = new JSZip();
	zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
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
	body: string,
	head = "",
) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xmlns:xlink="http://www.w3.org/1999/xlink" xml:lang="en">
<head><title>${title}</title>${head}</head>
<body>${body}</body>
</html>`;

const encryptionXml = (entries: { uri: string; algorithm: string }[]) =>
	`<?xml version="1.0" encoding="UTF-8"?>
<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#">
${entries
	.map(
		({ uri, algorithm }) => `	<enc:EncryptedData>
		<enc:EncryptionMethod Algorithm="${algorithm}"/>
		<enc:CipherData><enc:CipherReference URI="${uri}"/></enc:CipherData>
	</enc:EncryptedData>`,
	)
	.join("\n")}
</encryption>`;

const IDPF_ALGORITHM = "http://www.idpf.org/2008/embedding";
const ADOBE_ALGORITHM = "http://ns.adobe.com/pdf/enc#RC";

/** Independent reimplementation of the IDPF key (SHA-1 of the whitespace-stripped identifier). */
function idpfKey(identifier: string): Uint8Array {
	return new Uint8Array(
		createHash("sha1")
			.update(identifier.replace(/[ \t\r\n]/g, ""))
			.digest(),
	);
}

/** Independent reimplementation of the Adobe key (the UUID's 16 bytes). */
function adobeKey(identifier: string): Uint8Array {
	const hex = identifier
		.replace(/^urn:uuid:/i, "")
		.replace(/[^0-9a-f]/gi, "");
	return new Uint8Array(Buffer.from(hex, "hex"));
}

/** XOR is its own inverse, so this both obfuscates and de-obfuscates. */
function xorPrefix(
	bytes: Uint8Array,
	key: Uint8Array,
	length: number,
): Uint8Array {
	const out = bytes.slice();
	for (let i = 0; i < Math.min(length, out.length); i++) {
		out[i] ^= key[i % key.length];
	}
	return out;
}

/** Deterministic pseudo-random bytes standing in for a font file. */
function fontBytes(size: number, seed: number): Uint8Array {
	const out = new Uint8Array(size);
	let s = seed;
	for (let i = 0; i < size; i++) {
		s = (s * 1103515245 + 12345) & 0x7fffffff;
		out[i] = s & 0xff;
	}
	return out;
}

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0xff, 0xd9]);

// ---------------------------------------------------------------------------
// EPUB 3 fixture
//
// Spine: cover, ch1, ch2, ch3. Shared CSS (main.css @imports fonts.css, which
// pulls in an IDPF-obfuscated font; main.css also uses bg.png). ch1 alone uses
// only-ch1.png; ch3 alone uses bg3.png (inline style) and fig.svg (inline SVG
// <image>), which in turn uses fig-inner.png. unused.png is referenced by no
// one. ch1 links to ch2 (same output) and ch3 (other output); ch2 links to
// the id carried by ch1's link to ch3; ch3 links back to ch1.
// ---------------------------------------------------------------------------

const EPUB3_ID = "urn:uuid:11111111-2222-3333-4444-555555555555";
const EPUB3_FONT = fontBytes(2000, 7);

function epub3Files(): Record<string, string | Uint8Array> {
	return {
		"META-INF/container.xml": container("OEBPS/package.opf"),
		"META-INF/encryption.xml": encryptionXml([
			{ uri: "OEBPS/fonts/serif.otf", algorithm: IDPF_ALGORITHM },
		]),
		"OEBPS/package.opf": `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="en">
	<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
		<dc:identifier id="pub-id"> ${EPUB3_ID} </dc:identifier>
		<dc:identifier id="isbn">urn:isbn:9780000000000</dc:identifier>
		<dc:title id="title">The Book</dc:title>
		<dc:creator id="a1">Ada Author</dc:creator>
		<meta refines="#a1" property="role" scheme="marc:relators">aut</meta>
		<dc:language>en</dc:language>
		<dc:publisher>Example Press</dc:publisher>
		<dc:rights>All rights reserved</dc:rights>
		<meta property="dcterms:modified">2020-01-01T00:00:00Z</meta>
	</metadata>
	<manifest>
		<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
		<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
		<item id="cover-page" href="text/cover.xhtml" media-type="application/xhtml+xml"/>
		<item id="ch1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>
		<item id="ch2" href="text/ch2.xhtml" media-type="application/xhtml+xml"/>
		<item id="ch3" href="text/ch3.xhtml" media-type="application/xhtml+xml" properties="svg"/>
		<item id="css" href="css/main.css" media-type="text/css"/>
		<item id="font-css" href="css/fonts.css" media-type="text/css"/>
		<item id="font" href="fonts/serif.otf" media-type="font/otf"/>
		<item id="cover" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>
		<item id="bg" href="images/bg.png" media-type="image/png"/>
		<item id="only1" href="images/only-ch1.png" media-type="image/png"/>
		<item id="fig" href="images/fig.svg" media-type="image/svg+xml"/>
		<item id="fig-inner" href="images/fig-inner.png" media-type="image/png"/>
		<item id="bg3" href="images/bg3.png" media-type="image/png"/>
		<item id="unused" href="images/unused.png" media-type="image/png"/>
	</manifest>
	<spine toc="ncx">
		<itemref idref="cover-page" linear="no"/>
		<itemref idref="ch1"/>
		<itemref idref="ch2"/>
		<itemref idref="ch3"/>
	</spine>
</package>`,
		"OEBPS/nav.xhtml": xhtml(
			"Contents",
			`<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>
	<li><a href="text/cover.xhtml">Cover</a></li>
	<li><span>Part One</span><ol>
		<li><a href="text/ch1.xhtml">Chapter 1</a><ol>
			<li><a href="text/ch1.xhtml#s1">Section 1.1</a></li>
		</ol></li>
		<li><a href="text/ch2.xhtml">Chapter 2</a></li>
	</ol></li>
	<li><a href="text/ch3.xhtml">Part Two</a><ol>
		<li><a href="text/ch3.xhtml#s3">Chapter 3</a></li>
	</ol></li>
</ol></nav>
<nav epub:type="landmarks" hidden=""><ol>
	<li><a epub:type="cover" href="text/cover.xhtml">Cover</a></li>
	<li><a epub:type="bodymatter" href="text/ch1.xhtml">Start</a></li>
</ol></nav>`,
		),
		"OEBPS/toc.ncx": `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
	<head><meta name="dtb:uid" content="${EPUB3_ID}"/></head>
	<docTitle><text>The Book</text></docTitle>
	<navMap>
		<navPoint id="n1" playOrder="1"><navLabel><text>Chapter 1</text></navLabel><content src="text/ch1.xhtml"/></navPoint>
	</navMap>
</ncx>`,
		"OEBPS/text/cover.xhtml": xhtml(
			"Cover",
			`<p><img src="../images/cover.jpg" alt="Cover"/></p>`,
		),
		"OEBPS/text/ch1.xhtml": xhtml(
			"Chapter 1",
			`<h1 id="c1">Chapter 1</h1>
<section id="s1">
	<p><img src="../images/only-ch1.png" alt="Only in chapter 1"/></p>
	<p>See <a href="ch2.xhtml#s2">section two</a> and <a id="to3" href="ch3.xhtml"><em>chapter three</em></a>.</p>
	<p>Also <a href="https://example.com/">the web</a> and <a href="#c1">the top</a>.</p>
</section>`,
			`<link rel="stylesheet" type="text/css" href="../css/main.css"/>`,
		),
		"OEBPS/text/ch2.xhtml": xhtml(
			"Chapter 2",
			`<h1>Chapter 2</h1>
<section id="s2"><p>Back to <a href="ch1.xhtml#to3">the link</a>.</p></section>`,
			`<link rel="stylesheet" type="text/css" href="../css/main.css"/>`,
		),
		"OEBPS/text/ch3.xhtml": xhtml(
			"Chapter 3",
			`<h1>Chapter 3</h1>
<section id="s3">
	<p style="background-image: url('../images/bg3.png')">Back to <a href="ch1.xhtml">chapter one</a>.</p>
	<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><image width="10" height="10" xlink:href="../images/fig.svg"/></svg>
</section>`,
			`<link rel="stylesheet" type="text/css" href="../css/main.css"/>`,
		),
		"OEBPS/css/main.css": `@import url("fonts.css");
/* url(../images/unused.png) is commented out */
body { font-family: "Serif"; background: url(../images/bg.png); }`,
		"OEBPS/css/fonts.css": `@font-face { font-family: "Serif"; src: url('../fonts/serif.otf'); }`,
		"OEBPS/fonts/serif.otf": xorPrefix(EPUB3_FONT, idpfKey(EPUB3_ID), 1040),
		"OEBPS/images/cover.jpg": JPEG,
		"OEBPS/images/bg.png": PNG,
		"OEBPS/images/only-ch1.png": PNG,
		"OEBPS/images/fig.svg": `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1" height="1"><image width="1" height="1" xlink:href="fig-inner.png"/></svg>`,
		"OEBPS/images/fig-inner.png": PNG,
		"OEBPS/images/bg3.png": PNG,
		"OEBPS/images/unused.png": PNG,
	};
}

// ---------------------------------------------------------------------------
// EPUB 2 fixture
//
// Package at the zip root, NCX with nesting (Part I > B, C), a guide, a cover
// image declared with <meta name="cover"> but referenced by no content, and
// an Adobe-obfuscated font in shared CSS. a links to c#end; c links to a.
// ---------------------------------------------------------------------------

const EPUB2_ID = "urn:uuid:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const EPUB2_FONT = fontBytes(1500, 99);

function epub2Files(): Record<string, string | Uint8Array> {
	const page = (title: string, body: string) =>
		`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${title}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body>${body}</body></html>`;
	return {
		"META-INF/container.xml": container("content.opf"),
		"META-INF/encryption.xml": encryptionXml([
			{ uri: "font.ttf", algorithm: ADOBE_ALGORITHM },
		]),
		"content.opf": `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="BookId">
	<metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
		<dc:identifier id="BookId" opf:scheme="UUID">${EPUB2_ID}</dc:identifier>
		<dc:title>Old Book</dc:title>
		<dc:creator opf:role="aut">Old Author</dc:creator>
		<dc:language>en</dc:language>
		<meta name="cover" content="cover-img"/>
	</metadata>
	<manifest>
		<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
		<item id="a" href="a.xhtml" media-type="application/xhtml+xml"/>
		<item id="b" href="b.xhtml" media-type="application/xhtml+xml"/>
		<item id="c" href="c.xhtml" media-type="application/xhtml+xml"/>
		<item id="style" href="style.css" media-type="text/css"/>
		<item id="font" href="font.ttf" media-type="application/x-font-truetype"/>
		<item id="cover-img" href="cover.png" media-type="image/png"/>
	</manifest>
	<spine toc="ncx">
		<itemref idref="a"/>
		<itemref idref="b"/>
		<itemref idref="c"/>
	</spine>
	<guide>
		<reference type="cover" title="Cover" href="a.xhtml"/>
		<reference type="text" title="Text" href="b.xhtml"/>
	</guide>
</package>`,
		"toc.ncx": `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
	<head><meta name="dtb:uid" content="${EPUB2_ID}"/><meta name="dtb:depth" content="2"/></head>
	<docTitle><text>Old Book</text></docTitle>
	<navMap>
		<navPoint id="p1" playOrder="1"><navLabel><text>Part I</text></navLabel><content src="a.xhtml"/>
			<navPoint id="p2" playOrder="2"><navLabel><text>B</text></navLabel><content src="b.xhtml"/></navPoint>
			<navPoint id="p3" playOrder="3"><navLabel><text>C</text></navLabel><content src="c.xhtml#end"/></navPoint>
		</navPoint>
	</navMap>
</ncx>`,
		"a.xhtml": page(
			"A",
			`<p>Jump to <a href="c.xhtml#end">the end</a>.</p>`,
		),
		"b.xhtml": page("B", `<p>Middle.</p>`),
		"c.xhtml": page(
			"C",
			`<p id="end">The end. Back to <a href="a.xhtml">the start</a>.</p>`,
		),
		"style.css": `@font-face { font-family: "Old"; src: url(font.ttf); }`,
		"font.ttf": xorPrefix(EPUB2_FONT, adobeKey(EPUB2_ID), 1024),
		"cover.png": PNG,
	};
}

/** `[start, end)` over spine indices. */
const range = (start: number, end: number): EpubSegment => ({
	start: { kind: "spine", spineIndex: start },
	end: { kind: "spine", spineIndex: end },
});

async function split(
	files: Record<string, string | Uint8Array>,
	segments: EpubSegment[],
	sourceFilename: string | null = "my book.epub",
): Promise<SplitEpubOutput[]> {
	const epub = await parseEpub(await buildEpub(files));
	return splitEpub({ epub, segments, sourceFilename });
}

async function textOf(bytes: Uint8Array, path: string): Promise<string> {
	const file = (await JSZip.loadAsync(bytes)).file(path);
	if (!file) throw new Error(`${path} is not in the output`);
	return file.async("string");
}

async function bytesOf(bytes: Uint8Array, path: string): Promise<Uint8Array> {
	const file = (await JSZip.loadAsync(bytes)).file(path);
	if (!file) throw new Error(`${path} is not in the output`);
	return file.async("uint8array");
}

function parseXhtml(text: string): Document {
	const doc = new DOMParser().parseFromString(text, "application/xhtml+xml");
	expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
	return doc;
}

/** The unique identifier written into an output's package document. */
async function uniqueIdentifierOf(bytes: Uint8Array): Promise<string> {
	const { book } = await parseEpub(bytes);
	return book.metadata.identifier ?? "";
}

/** Labels and paths of a TOC, nested, for compact assertions. */
type TocShape = { label: string; path: string | null; children?: TocShape[] };
function tocShape(entries: EpubTocEntry[]): TocShape[] {
	return entries.map((entry) => ({
		label: entry.label,
		path: entry.fragment ? `${entry.path}#${entry.fragment}` : entry.path,
		...(entry.children.length
			? { children: tocShape(entry.children) }
			: {}),
	}));
}

// ---------------------------------------------------------------------------
// Structural validation (stands in for EPUBCheck, which isn't run in CI)
// ---------------------------------------------------------------------------

const CSS_REF =
	/@import\s+(?:url\(\s*)?(["']?)([^"')\s;]+)\1|url\(\s*(["']?)([^"')]*?)\3\s*\)/g;

/**
 * Assert the OCF / package / link invariants EPUBCheck would check for our
 * fixtures: mimetype first and stored, manifest ⇔ zip consistency, spine
 * idrefs in the manifest, a nav (EPUB 3) or NCX (EPUB 2), well-formed XML,
 * and no dangling internal reference or fragment anywhere.
 */
async function expectStructurallyValid(bytes: Uint8Array): Promise<void> {
	// mimetype: first local file header, method 0 (stored), exact content.
	const view = new DataView(bytes.buffer, bytes.byteOffset);
	expect(view.getUint32(0, true)).toBe(0x04034b50);
	expect(view.getUint16(8, true)).toBe(0);
	const nameLength = view.getUint16(26, true);
	const extraLength = view.getUint16(28, true);
	expect(extraLength).toBe(0);
	const decoder = new TextDecoder();
	expect(decoder.decode(bytes.subarray(30, 30 + nameLength))).toBe(
		"mimetype",
	);
	const dataStart = 30 + nameLength;
	expect(decoder.decode(bytes.subarray(dataStart, dataStart + 20))).toBe(
		"application/epub+zip",
	);

	const { book, archive } = await parseEpub(bytes);
	const opf = parseXhtml(await archive.readText(book.packagePath));

	// Manifest ⇔ zip.
	const ids = book.manifest.map((item) => item.id);
	expect(new Set(ids).size).toBe(ids.length);
	const manifestPaths = new Set(book.manifest.map((item) => item.path));
	for (const item of book.manifest) {
		if (!item.remote) expect(archive.has(item.path), item.path).toBe(true);
	}
	for (const path of book.files) {
		if (
			path === "mimetype" ||
			path.startsWith("META-INF/") ||
			path === book.packagePath
		)
			continue;
		expect(manifestPaths.has(path), `${path} in manifest`).toBe(true);
	}

	// Every itemref resolved (the parser silently drops unknown idrefs).
	expect(opf.getElementsByTagNameNS("*", "itemref")).toHaveLength(
		book.spine.length,
	);

	if (book.version.startsWith("3")) {
		expect(
			book.manifest.filter((item) => item.properties.includes("nav")),
		).toHaveLength(1);
		expect(book.metadata.modified).toMatch(
			/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/,
		);
		expect(book.tocSource).toBe("nav");
	} else {
		const spineEl = opf.getElementsByTagNameNS("*", "spine")[0];
		const ncx = book.manifest.find(
			(item) => item.id === spineEl.getAttribute("toc"),
		);
		expect(ncx?.mediaType).toBe("application/x-dtbncx+xml");
		expect(book.tocSource).toBe("ncx");
	}
	expect(book.toc.length).toBeGreaterThan(0);

	// Every TOC entry points at a spine item.
	const spinePaths = new Set(book.spine.map((item) => item.path));
	const walk = (entries: EpubTocEntry[]): EpubTocEntry[] =>
		entries.flatMap((entry) => [entry, ...walk(entry.children)]);
	for (const entry of walk(book.toc)) {
		if (entry.path) expect(spinePaths.has(entry.path)).toBe(true);
	}

	// Every encrypted resource is in the zip.
	for (const resource of book.obfuscatedResources) {
		expect(archive.has(resource.path)).toBe(true);
	}

	// No dangling references from XHTML, SVG, NCX or CSS.
	const docs = new Map<string, Document>();
	const docOf = async (path: string) => {
		let doc = docs.get(path);
		if (!doc) {
			doc = parseXhtml(await archive.readText(path));
			docs.set(path, doc);
		}
		return doc;
	};
	const expectTarget = async (from: string, href: string) => {
		const resolved = resolveHref(from, href);
		if (!resolved) return;
		expect(archive.has(resolved.path), `${from} → ${href}`).toBe(true);
		expect(manifestPaths.has(resolved.path), `${href} in manifest`).toBe(
			true,
		);
		if (resolved.fragment && /\.(xhtml|svg)$/.test(resolved.path)) {
			const target = await docOf(resolved.path);
			const found = Array.from(target.getElementsByTagName("*")).some(
				(el) => el.getAttribute("id") === resolved.fragment,
			);
			expect(found, `${from} → ${href}`).toBe(true);
		}
	};
	for (const item of book.manifest) {
		if (item.remote) continue;
		if (item.mediaType === "text/css") {
			const css = (await archive.readText(item.path)).replace(
				/\/\*[\s\S]*?\*\//g,
				"",
			);
			for (const match of css.matchAll(CSS_REF)) {
				await expectTarget(item.path, match[2] ?? match[4]);
			}
			continue;
		}
		if (
			![
				"application/xhtml+xml",
				"image/svg+xml",
				"application/x-dtbncx+xml",
			].includes(item.mediaType)
		)
			continue;
		const doc = await docOf(item.path);
		for (const el of Array.from(doc.getElementsByTagName("*"))) {
			for (const attr of Array.from(el.attributes)) {
				if (["href", "src", "poster"].includes(attr.localName)) {
					await expectTarget(item.path, attr.value);
				}
			}
			const style = el.getAttribute("style");
			if (style) {
				for (const match of style.matchAll(CSS_REF)) {
					await expectTarget(item.path, match[2] ?? match[4]);
				}
			}
		}
	}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("splitEpub (EPUB 3)", () => {
	const segments = [range(0, 3), range(3, 4)];

	it("writes one EPUB per segment with a part title and file name", async () => {
		const outputs = await split(epub3Files(), segments);
		expect(
			outputs.map(({ title, fileName }) => ({ title, fileName })),
		).toEqual([
			{ title: "The Book — Part 1", fileName: "my-book-part-1.epub" },
			{ title: "The Book — Part 2", fileName: "my-book-part-2.epub" },
		]);
		for (const output of outputs) {
			expect(output.bytes).toBeInstanceOf(Uint8Array);
		}
	});

	it("produces structurally valid EPUBs", async () => {
		const outputs = await split(epub3Files(), segments);
		for (const output of outputs)
			await expectStructurallyValid(output.bytes);
	});

	it("puts each segment's spine files, in order, into its output", async () => {
		const outputs = await split(epub3Files(), segments);
		const spines = await Promise.all(
			outputs.map(async (output) =>
				(await parseEpub(output.bytes)).book.spine.map(
					(item) =>
						`${item.path}${item.linear ? "" : " (non-linear)"}`,
				),
			),
		);
		expect(spines).toEqual([
			[
				"OEBPS/text/cover.xhtml (non-linear)",
				"OEBPS/text/ch1.xhtml",
				"OEBPS/text/ch2.xhtml",
			],
			["OEBPS/text/ch3.xhtml"],
		]);
	});

	it("copies only the CSS, fonts and images each segment references, transitively", async () => {
		const outputs = await split(epub3Files(), segments);
		const [first, second] = await Promise.all(
			outputs.map(async (output) => (await parseEpub(output.bytes)).book),
		);
		const resources = (book: typeof first) =>
			book.manifest
				.map((item) => item.path)
				.filter((path) => !path.includes("/text/"))
				.sort();

		expect(resources(first)).toEqual([
			"OEBPS/css/fonts.css",
			"OEBPS/css/main.css",
			"OEBPS/fonts/serif.otf",
			"OEBPS/images/bg.png",
			"OEBPS/images/cover.jpg",
			"OEBPS/images/only-ch1.png",
			"OEBPS/nav.xhtml",
			"OEBPS/toc.ncx",
		]);
		expect(resources(second)).toEqual([
			"OEBPS/css/fonts.css",
			"OEBPS/css/main.css",
			"OEBPS/fonts/serif.otf",
			"OEBPS/images/bg.png",
			"OEBPS/images/bg3.png",
			"OEBPS/images/fig-inner.png",
			"OEBPS/images/fig.svg",
			"OEBPS/nav.xhtml",
			"OEBPS/toc.ncx",
		]);
		expect(first.files).not.toContain("OEBPS/images/unused.png");
		expect(second.files).not.toContain("OEBPS/images/unused.png");
	});

	it("keeps the cover image on the first output only", async () => {
		const outputs = await split(epub3Files(), [range(1, 2), range(2, 4)]);
		const [first, second] = await Promise.all(
			outputs.map(async (output) => (await parseEpub(output.bytes)).book),
		);
		expect(first.cover?.path).toBe("OEBPS/images/cover.jpg");
		expect(second.cover).toBeNull();
		expect(second.files).not.toContain("OEBPS/images/cover.jpg");
	});

	it("copies metadata, suffixes the title and gives each output a new unique identifier", async () => {
		const outputs = await split(epub3Files(), segments);
		const books = await Promise.all(
			outputs.map(async (output) => (await parseEpub(output.bytes)).book),
		);
		for (const [i, book] of books.entries()) {
			expect(book.version).toBe("3.0");
			expect(book.metadata.title).toBe(`The Book — Part ${i + 1}`);
			expect(book.metadata.creators).toEqual(["Ada Author"]);
			expect(book.metadata.language).toBe("en");
			expect(book.metadata.publisher).toBe("Example Press");
			expect(book.metadata.identifier).toMatch(
				/^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
			);
			expect(book.metadata.identifier).not.toBe(EPUB3_ID);
			expect(book.metadata.modified).not.toBe("2020-01-01T00:00:00Z");
		}
		expect(books[0].metadata.identifier).not.toBe(
			books[1].metadata.identifier,
		);

		const opf = await textOf(outputs[0].bytes, "OEBPS/package.opf");
		expect(opf).toContain("urn:isbn:9780000000000");
		expect(opf).toContain("All rights reserved");
		expect(opf).toContain('refines="#a1"');
		// Dropped entries leave no blank lines behind.
		expect(opf).not.toMatch(/\n[ \t]*\n/);
	});

	it("writes a nav covering only the segment's entries, keeping nesting", async () => {
		const outputs = await split(epub3Files(), segments);
		const [first, second] = await Promise.all(
			outputs.map(async (output) => (await parseEpub(output.bytes)).book),
		);
		expect(first.tocSource).toBe("nav");
		expect(tocShape(first.toc)).toEqual([
			{ label: "Cover", path: "OEBPS/text/cover.xhtml" },
			{
				label: "Part One",
				path: null,
				children: [
					{
						label: "Chapter 1",
						path: "OEBPS/text/ch1.xhtml",
						children: [
							{
								label: "Section 1.1",
								path: "OEBPS/text/ch1.xhtml#s1",
							},
						],
					},
					{ label: "Chapter 2", path: "OEBPS/text/ch2.xhtml" },
				],
			},
		]);
		expect(tocShape(second.toc)).toEqual([
			{
				label: "Part Two",
				path: "OEBPS/text/ch3.xhtml",
				children: [
					{ label: "Chapter 3", path: "OEBPS/text/ch3.xhtml#s3" },
				],
			},
		]);
		expect(first.landmarks.map((l) => l.type)).toEqual([
			"cover",
			"bodymatter",
		]);
		expect(second.landmarks).toEqual([]);
	});

	it("also rewrites the NCX the source carried, with the new identifier", async () => {
		const outputs = await split(epub3Files(), segments);
		const id = await uniqueIdentifierOf(outputs[1].bytes);
		const ncx = parseXhtml(await textOf(outputs[1].bytes, "OEBPS/toc.ncx"));
		const uid = Array.from(ncx.getElementsByTagNameNS("*", "meta")).find(
			(meta) => meta.getAttribute("name") === "dtb:uid",
		);
		expect(uid?.getAttribute("content")).toBe(id);
		const srcs = Array.from(ncx.getElementsByTagNameNS("*", "content")).map(
			(el) => el.getAttribute("src"),
		);
		expect(srcs).toEqual(["text/ch3.xhtml", "text/ch3.xhtml#s3"]);
	});

	it("turns links to other outputs into plain text and keeps links within the output", async () => {
		const outputs = await split(epub3Files(), segments);
		const ch1 = parseXhtml(
			await textOf(outputs[0].bytes, "OEBPS/text/ch1.xhtml"),
		);
		const hrefs = Array.from(ch1.getElementsByTagName("a")).map((a) =>
			a.getAttribute("href"),
		);
		expect(hrefs).toEqual(["ch2.xhtml#s2", "https://example.com/", "#c1"]);
		const paragraph = ch1.getElementsByTagName("p")[1];
		expect(paragraph.textContent).toBe(
			"See section two and chapter three.",
		);
		// The unwrapped link's content (markup included) stays in place.
		expect(paragraph.getElementsByTagName("em")[0]?.textContent).toBe(
			"chapter three",
		);
		// Its id survives, so ch2's link to ch1.xhtml#to3 still resolves.
		expect(ch1.getElementById("to3")).not.toBeNull();

		const ch3 = parseXhtml(
			await textOf(outputs[1].bytes, "OEBPS/text/ch3.xhtml"),
		);
		expect(ch3.getElementsByTagName("a")).toHaveLength(0);
		expect(ch3.getElementsByTagName("p")[0].textContent).toBe(
			"Back to chapter one.",
		);
	});

	it("writes rewritten XHTML as well-formed XML and copies untouched files verbatim", async () => {
		const files = epub3Files();
		const outputs = await split(files, segments);
		const ch1 = await textOf(outputs[0].bytes, "OEBPS/text/ch1.xhtml");
		expect(ch1.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(
			true,
		);
		parseXhtml(ch1);
		expect(await textOf(outputs[0].bytes, "OEBPS/text/ch2.xhtml")).toBe(
			files["OEBPS/text/ch2.xhtml"],
		);
		expect(await textOf(outputs[1].bytes, "OEBPS/css/main.css")).toBe(
			files["OEBPS/css/main.css"],
		);
	});

	it("re-obfuscates fonts with each output's identifier and writes a matching encryption.xml", async () => {
		const outputs = await split(epub3Files(), segments);
		for (const output of outputs) {
			const { book } = await parseEpub(output.bytes);
			expect(book.obfuscatedResources).toEqual([
				{ path: "OEBPS/fonts/serif.otf", algorithm: "idpf" },
			]);
			const stored = await bytesOf(output.bytes, "OEBPS/fonts/serif.otf");
			const key = idpfKey(book.metadata.identifier ?? "");
			expect(xorPrefix(stored, key, 1040)).toEqual(EPUB3_FONT);
		}
	});

	it("writes mimetype as the first, uncompressed zip entry", async () => {
		const outputs = await split(epub3Files(), segments);
		const zip = await JSZip.loadAsync(outputs[0].bytes);
		expect(Object.keys(zip.files)[0]).toBe("mimetype");
		expect(await zip.file("mimetype")!.async("string")).toBe(
			"application/epub+zip",
		);
	});

	it("keeps headings whose children survive and promotes children of dropped entries", async () => {
		const outputs = await split(epub3Files(), [range(2, 3)]);
		const { book } = await parseEpub(outputs[0].bytes);
		expect(tocShape(book.toc)).toEqual([
			{
				label: "Part One",
				path: null,
				children: [
					{ label: "Chapter 2", path: "OEBPS/text/ch2.xhtml" },
				],
			},
		]);
		await expectStructurallyValid(outputs[0].bytes);
	});

	it("falls back to the documents' titles when no contents entry falls in the segment", async () => {
		const files = epub3Files();
		files["OEBPS/nav.xhtml"] = xhtml(
			"Contents",
			`<nav epub:type="toc"><ol><li><a href="text/ch1.xhtml">Chapter 1</a></li></ol></nav>`,
		);
		const outputs = await split(files, [range(1, 2), range(2, 4)]);
		const { book } = await parseEpub(outputs[1].bytes);
		expect(tocShape(book.toc)).toEqual([
			{ label: "Chapter 2", path: "OEBPS/text/ch2.xhtml" },
			{ label: "Chapter 3", path: "OEBPS/text/ch3.xhtml" },
		]);
		await expectStructurallyValid(outputs[1].bytes);
	});

	it("rewrites a document that only parses as HTML into well-formed XHTML", async () => {
		const files = epub3Files();
		files["OEBPS/text/ch3.xhtml"] = xhtml(
			"Chapter 3",
			`<h1 id="s3">Chapter&nbsp;3</h1><p>Back to <a href="ch1.xhtml">chapter one</a>.<br></p>`,
		);
		const outputs = await split(files, [range(0, 3), range(3, 4)]);
		const text = await textOf(outputs[1].bytes, "OEBPS/text/ch3.xhtml");
		const ch3 = parseXhtml(text);
		expect(ch3.getElementsByTagName("a")).toHaveLength(0);
		expect(ch3.getElementsByTagName("h1")[0].textContent).toBe("Chapter 3");
		expect(text.match(/\?xml/g)).toHaveLength(1);
		await expectStructurallyValid(outputs[1].bytes);
	});

	it("reads a segment of only non-linear files in the main flow", async () => {
		const outputs = await split(epub3Files(), [range(0, 1), range(1, 4)]);
		const { book } = await parseEpub(outputs[0].bytes);
		expect(book.spine.map((item) => [item.path, item.linear])).toEqual([
			["OEBPS/text/cover.xhtml", true],
		]);
		await expectStructurallyValid(outputs[0].bytes);
	});

	it("replaces a nav document that sits in the spine with the generated one", async () => {
		const files = epub3Files();
		files["OEBPS/package.opf"] = (
			files["OEBPS/package.opf"] as string
		).replace(
			'<itemref idref="cover-page" linear="no"/>',
			'<itemref idref="nav"/><itemref idref="cover-page" linear="no"/>',
		);
		const outputs = await split(files, [range(0, 2), range(2, 5)]);
		const [first, second] = await Promise.all(
			outputs.map(async (output) => (await parseEpub(output.bytes)).book),
		);
		expect(first.spine.map((item) => item.path)).toEqual([
			"OEBPS/nav.xhtml",
			"OEBPS/text/cover.xhtml",
		]);
		expect(second.spine.map((item) => item.path)).not.toContain(
			"OEBPS/nav.xhtml",
		);
		expect(second.navPath).toBe("OEBPS/nav.xhtml");
		for (const output of outputs)
			await expectStructurallyValid(output.bytes);
	});

	it("uses the book title for file names when the source file name is unknown", async () => {
		const outputs = await split(epub3Files(), segments, null);
		expect(outputs.map((output) => output.fileName)).toEqual([
			"The-Book-part-1.epub",
			"The-Book-part-2.epub",
		]);
	});
});

describe("splitEpub (EPUB 2)", () => {
	const segments = [range(0, 1), range(1, 3)];

	it("produces structurally valid EPUB 2 outputs with an NCX and no nav", async () => {
		const outputs = await split(epub2Files(), segments, "old.epub");
		expect(outputs.map((output) => output.fileName)).toEqual([
			"old-part-1.epub",
			"old-part-2.epub",
		]);
		for (const output of outputs) {
			await expectStructurallyValid(output.bytes);
			const { book } = await parseEpub(output.bytes);
			expect(book.version).toBe("2.0");
			expect(book.navPath).toBeNull();
			expect(book.ncxPath).toBe("toc.ncx");
		}
	});

	it("filters the NCX, promoting children whose parent is in another output", async () => {
		const outputs = await split(epub2Files(), segments);
		const [first, second] = await Promise.all(
			outputs.map(async (output) => (await parseEpub(output.bytes)).book),
		);
		expect(tocShape(first.toc)).toEqual([
			{ label: "Part I", path: "a.xhtml" },
		]);
		expect(tocShape(second.toc)).toEqual([
			{ label: "B", path: "b.xhtml" },
			{ label: "C", path: "c.xhtml#end" },
		]);
		const ncx = parseXhtml(await textOf(outputs[1].bytes, "toc.ncx"));
		const uid = Array.from(ncx.getElementsByTagNameNS("*", "meta")).find(
			(meta) => meta.getAttribute("name") === "dtb:uid",
		);
		expect(uid?.getAttribute("content")).toBe(second.metadata.identifier);
		expect(ncx.getElementsByTagNameNS("*", "docTitle")[0].textContent).toBe(
			"Old Book — Part 2",
		);
	});

	it("keeps the cover image (declared only in metadata) and its meta on the first output", async () => {
		const outputs = await split(epub2Files(), segments);
		const [first, second] = await Promise.all(
			outputs.map(async (output) => (await parseEpub(output.bytes)).book),
		);
		expect(first.cover?.path).toBe("cover.png");
		expect(second.cover).toBeNull();
		expect(await textOf(outputs[1].bytes, "content.opf")).not.toContain(
			'name="cover"',
		);
	});

	it("keeps only guide references into the output", async () => {
		const outputs = await split(epub2Files(), segments);
		const [first, second] = await Promise.all(
			outputs.map(async (output) => (await parseEpub(output.bytes)).book),
		);
		expect(first.landmarks.map((l) => [l.type, l.path])).toEqual([
			["cover", "a.xhtml"],
		]);
		expect(second.landmarks.map((l) => [l.type, l.path])).toEqual([
			["text", "b.xhtml"],
		]);
	});

	it("unwraps cross-output links in both directions", async () => {
		const outputs = await split(epub2Files(), segments);
		const a = parseXhtml(await textOf(outputs[0].bytes, "a.xhtml"));
		expect(a.getElementsByTagName("a")).toHaveLength(0);
		expect(a.body.textContent).toBe("Jump to the end.");
		const c = parseXhtml(await textOf(outputs[1].bytes, "c.xhtml"));
		expect(c.getElementsByTagName("a")).toHaveLength(0);
		expect(c.getElementById("end")).not.toBeNull();
	});

	it("re-obfuscates Adobe-obfuscated fonts with the new UUID", async () => {
		const outputs = await split(epub2Files(), segments);
		for (const output of outputs) {
			const { book } = await parseEpub(output.bytes);
			expect(book.obfuscatedResources).toEqual([
				{ path: "font.ttf", algorithm: "adobe" },
			]);
			const stored = await bytesOf(output.bytes, "font.ttf");
			const key = adobeKey(book.metadata.identifier ?? "");
			expect(xorPrefix(stored, key, 1024)).toEqual(EPUB2_FONT);
		}
	});

	it("drops the obfuscation scheme of the replaced identifier", async () => {
		const outputs = await split(epub2Files(), segments);
		const opf = parseXhtml(await textOf(outputs[0].bytes, "content.opf"));
		const identifier = opf.getElementsByTagNameNS("*", "identifier")[0];
		expect(identifier.getAttribute("id")).toBe("BookId");
		expect(
			identifier.getAttributeNS("http://www.idpf.org/2007/opf", "scheme"),
		).toBe("UUID");
	});
});

describe("splitEpub (input validation)", () => {
	it.each([
		["an empty segment", range(1, 1)],
		["a reversed segment", range(2, 1)],
		["a segment past the end", range(0, 5)],
		["a negative start", range(-1, 2)],
	])("rejects %s", async (_name, segment) => {
		await expect(split(epub3Files(), [segment])).rejects.toThrow(
			RangeError,
		);
	});

	it("rejects an empty segment list", async () => {
		await expect(split(epub3Files(), [])).rejects.toThrow(RangeError);
	});
});

/**
 * EPUBCheck isn't run in CI. To validate the fixtures' outputs by hand:
 *   SPLIT_EPUB_OUT_DIR=/some/dir pnpm --filter @web exec vitest run splitEpub
 *   java -jar epubcheck.jar /some/dir/<name>.epub   (for each file)
 */
describe.skipIf(!process.env.SPLIT_EPUB_OUT_DIR)("fixture outputs", () => {
	it("writes every fixture output to SPLIT_EPUB_OUT_DIR", async () => {
		const { mkdir, writeFile } = await import("node:fs/promises");
		const dir = process.env.SPLIT_EPUB_OUT_DIR!;
		await mkdir(dir, { recursive: true });
		const outputs = [
			...(await split(epub3Files(), [range(0, 3), range(3, 4)], "epub3")),
			...(await split(epub2Files(), [range(0, 1), range(1, 3)], "epub2")),
		];
		for (const output of outputs) {
			await writeFile(`${dir}/${output.fileName}`, output.bytes);
		}
	});
});

describe("downloadSplitEpubs", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("bundles every output into one zip named after the source", async () => {
		const outputs = await split(epub3Files(), [range(0, 3), range(3, 4)]);
		let blob: Blob | null = null;
		const createObjectURL = vi.fn((value: Blob) => {
			blob = value;
			return "blob:fake";
		});
		Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
		let downloadName = "";
		vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
			function (this: HTMLAnchorElement) {
				downloadName = this.download;
			},
		);

		await downloadSplitEpubs(outputs, "my book.epub");

		expect(downloadName).toBe("my-book-split.zip");
		const zip = await JSZip.loadAsync(
			new Uint8Array(await (blob as unknown as Blob).arrayBuffer()),
		);
		expect(Object.keys(zip.files)).toEqual([
			"my-book-part-1.epub",
			"my-book-part-2.epub",
		]);
		expect(
			await zip.file("my-book-part-2.epub")!.async("uint8array"),
		).toEqual(outputs[1].bytes);
	});
});
