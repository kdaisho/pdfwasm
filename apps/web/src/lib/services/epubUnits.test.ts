// @vitest-environment jsdom
// Content documents are parsed with the browser's DOMParser, which Node lacks,
// so this file opts into jsdom like epub.test.ts does.
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { EpubError, parseEpub, type ParsedEpub } from "./epub";
import {
	LEADING_TEXT_LIMIT,
	extractSplitUnits,
	parseContentDocument,
	resolveUnitAddress,
	type EpubSplitUnit,
} from "./epubUnits";

/** Zip `files` into an EPUB, `mimetype` first and uncompressed. */
async function buildEpub(files: Record<string, string>): Promise<Uint8Array> {
	const zip = new JSZip();
	zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
	for (const [path, content] of Object.entries(files)) {
		zip.file(path, content);
	}
	return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

/** An XHTML content document; `body` is the whole `<body>` element. */
const page = (body: string) => `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Page</title></head>${body}</html>`;

interface ContentFile {
	/** Path relative to `OEBPS/`, e.g. `text/ch1.xhtml`. */
	href: string;
	/** The `<body>` element. Omit to leave the file out of the zip. */
	body?: string;
	linear?: boolean;
	/** Itemref `properties`. */
	properties?: string;
}

/**
 * EPUB 3 with its package in `OEBPS/`. `nav` is the nav document's body
 * (hrefs relative to `OEBPS/nav.xhtml`); the nav is not in the spine.
 */
function bookFiles(opts: {
	content: ContentFile[];
	nav?: string;
	fixedLayout?: boolean;
}): Record<string, string> {
	const files: Record<string, string> = {
		"META-INF/container.xml": `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
	<rootfiles><rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
		"OEBPS/package.opf": `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
	<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
		<dc:identifier id="id">urn:uuid:units</dc:identifier>
		<dc:title>Units</dc:title>
		<dc:language>en</dc:language>
		${opts.fixedLayout ? '<meta property="rendition:layout">pre-paginated</meta>' : ""}
	</metadata>
	<manifest>
		${opts.nav ? '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' : ""}
		${opts.content
			.map(
				(file, i) =>
					`<item id="c${i}" href="${file.href}" media-type="application/xhtml+xml"/>`,
			)
			.join("\n\t\t")}
	</manifest>
	<spine>
		${opts.content
			.map(
				(file, i) =>
					`<itemref idref="c${i}"${file.linear === false ? ' linear="no"' : ""}${file.properties ? ` properties="${file.properties}"` : ""}/>`,
			)
			.join("\n\t\t")}
	</spine>
</package>`,
	};
	if (opts.nav) files["OEBPS/nav.xhtml"] = page(`<body>${opts.nav}</body>`);
	for (const file of opts.content) {
		if (file.body !== undefined)
			files[`OEBPS/${file.href}`] = page(file.body);
	}
	return files;
}

async function unitsOf(
	files: Record<string, string>,
): Promise<{ parsed: ParsedEpub; units: EpubSplitUnit[] }> {
	const parsed = await parseEpub(await buildEpub(files));
	return { parsed, units: await extractSplitUnits(parsed) };
}

/** The fields worth comparing in bulk, with `OEBPS/text/` trimmed off paths. */
const summary = (units: EpubSplitUnit[]) =>
	units.map((unit) => ({
		file: unit.address.path.replace("OEBPS/text/", ""),
		at: unit.address.elementPath,
		tag: unit.tag,
		text: unit.text,
		signals: unit.signals,
	}));

/** `textContent` doesn't space out blocks, so compare without whitespace. */
const squash = (value: string | null) => (value ?? "").replace(/\s+/g, "");

/** Every unit's address must lead back to its element in a fresh parse. */
async function expectAddressesResolve(
	{ archive }: ParsedEpub,
	units: EpubSplitUnit[],
): Promise<void> {
	for (const unit of units) {
		const doc = parseContentDocument(
			await archive.readText(unit.address.path),
		);
		const el = resolveUnitAddress(doc, unit.address);
		expect(el?.localName).toBe(unit.tag);
		expect(squash(el?.textContent ?? null)).toContain(squash(unit.text));
		expect(el?.getAttribute("id") ?? null).toBe(unit.address.id);
	}
}

const fullContentsBook = () =>
	bookFiles({
		nav: `
	<nav epub:type="toc"><ol>
		<li><span>Part One</span><ol>
			<li><a href="text/ch1.xhtml">Chapter 1</a></li>
			<li><a href="text/ch1.xhtml#s2">Section 2</a></li>
		</ol></li>
		<li><a href="text/ch2.xhtml#start">Chapter 2</a></li>
	</ol></nav>
	<nav epub:type="landmarks"><ol>
		<li><a epub:type="bodymatter" href="text/ch1.xhtml">Start</a></li>
	</ol></nav>
	<nav epub:type="page-list"><ol>
		<li><a href="text/ch1.xhtml#page2">2</a></li>
	</ol></nav>`,
		content: [
			{
				href: "text/ch1.xhtml",
				body: `<body epub:type="bodymatter">
	<section epub:type="chapter" id="c1">
		<h1>Chapter 1</h1>
		<p>It was a dark night. <span epub:type="pagebreak" id="page2" title="2"/>The rain fell.</p>
		<div class="wrapper"><div class="inner"><p id="s2">Section two begins here.</p></div></div>
		<hr/>
		<p>After the break.</p>
	</section>
</body>`,
			},
			{
				href: "text/ch2.xhtml",
				body: `<body>
	<section epub:type="chapter" id="start">
		<header><h2>Chapter 2</h2><p>The Return</p></header>
		<p>Text of chapter two.</p>
		<p style="color: red; page-break-before: always">A new page.</p>
	</section>
</body>`,
			},
			{
				href: "text/notes.xhtml",
				linear: false,
				body: `<body><aside epub:type="endnotes"><h2>Notes</h2><ol><li>One note.</li><li>Two.</li></ol></aside></body>`,
			},
		],
	});

describe("extractSplitUnits: a book with a full contents list", () => {
	it("lists block units in reading order with signals, strongest first", async () => {
		const { units } = await unitsOf(fullContentsBook());
		expect(summary(units)).toEqual([
			{
				file: "ch1.xhtml",
				at: [0, 0],
				tag: "h1",
				text: "Chapter 1",
				signals: [
					{ kind: "toc-target", label: "Part One", depth: 0 },
					{ kind: "toc-target", label: "Chapter 1", depth: 1 },
					{
						kind: "semantic",
						source: "landmark",
						type: "bodymatter",
					},
					{
						kind: "semantic",
						source: "epub-type",
						type: "bodymatter",
					},
					{ kind: "semantic", source: "epub-type", type: "chapter" },
					{ kind: "spine-start" },
					{ kind: "heading", level: 1 },
					{ kind: "text-pattern", pattern: "chapter" },
				],
			},
			{
				file: "ch1.xhtml",
				at: [0, 1],
				tag: "p",
				text: "It was a dark night. The rain fell.",
				signals: [],
			},
			{
				file: "ch1.xhtml",
				at: [0, 2, 0, 0],
				tag: "p",
				text: "Section two begins here.",
				signals: [
					{ kind: "toc-target", label: "Section 2", depth: 1 },
					// The page break sits mid-paragraph in the unit before,
					// so the nearest place to split is this unit.
					{ kind: "page-break", source: "pagebreak" },
				],
			},
			{
				file: "ch1.xhtml",
				at: [0, 4],
				tag: "p",
				text: "After the break.",
				signals: [{ kind: "text-pattern", pattern: "scene-break" }],
			},
			{
				file: "ch2.xhtml",
				at: [0, 0, 0],
				tag: "h2",
				text: "Chapter 2",
				signals: [
					{ kind: "toc-target", label: "Chapter 2", depth: 0 },
					{ kind: "semantic", source: "epub-type", type: "chapter" },
					{ kind: "spine-start" },
					{ kind: "heading", level: 2 },
					{ kind: "text-pattern", pattern: "chapter" },
				],
			},
			{
				file: "ch2.xhtml",
				at: [0, 0, 1],
				tag: "p",
				text: "The Return",
				signals: [],
			},
			{
				file: "ch2.xhtml",
				at: [0, 1],
				tag: "p",
				text: "Text of chapter two.",
				signals: [],
			},
			{
				file: "ch2.xhtml",
				at: [0, 2],
				tag: "p",
				text: "A new page.",
				signals: [{ kind: "page-break", source: "style" }],
			},
			{
				file: "notes.xhtml",
				at: [0, 0],
				tag: "h2",
				text: "Notes",
				signals: [
					{ kind: "semantic", source: "epub-type", type: "endnotes" },
					{ kind: "spine-start" },
					{ kind: "heading", level: 2 },
				],
			},
			{
				file: "notes.xhtml",
				at: [0, 1],
				tag: "ol",
				text: "One note. Two.",
				signals: [],
			},
		]);
	});

	it("numbers units, records ids, lengths and layout, and marks non-linear files", async () => {
		const { units } = await unitsOf(fullContentsBook());
		expect(units.map((unit) => unit.index)).toEqual(units.map((_, i) => i));
		expect(units[2].address).toEqual({
			spineIndex: 0,
			path: "OEBPS/text/ch1.xhtml",
			elementPath: [0, 2, 0, 0],
			id: "s2",
		});
		expect(units[0].address.id).toBeNull();
		expect(units[4].address.spineIndex).toBe(1);
		expect(units.map((unit) => unit.textLength)).toEqual(
			units.map((unit) => unit.text.length),
		);
		expect(units.map((unit) => unit.headingLevel)).toEqual([
			1,
			null,
			null,
			null,
			2,
			null,
			null,
			null,
			2,
			null,
		]);
		expect(units.every((unit) => unit.layout === "reflowable")).toBe(true);
		expect(units.map((unit) => unit.linear)).toEqual([
			...Array(8).fill(true),
			false,
			false,
		]);
	});

	it("gives addresses that resolve to the same element in a fresh parse", async () => {
		const { parsed, units } = await unitsOf(fullContentsBook());
		await expectAddressesResolve(parsed, units);
	});

	it("returns plain data", async () => {
		const { units } = await unitsOf(fullContentsBook());
		expect(structuredClone(units)).toEqual(units);
		expect(JSON.parse(JSON.stringify(units))).toEqual(units);
	});
});

describe("extractSplitUnits: a book with no contents list", () => {
	const longParagraph =
		"Part Two of the treaty states that " +
		"the parties agree to everything. ".repeat(4).trim();

	const files = () =>
		bookFiles({
			content: [
				{
					href: "text/a.xhtml",
					body: `<body>
	<div class="titlepage"><p class="title">CHAPTER I</p></div>
	<p>First paragraph &amp; more.</p>
	<p class="center">* * *</p>
	<p>After the stars.</p>
	<h3>IV</h3>
	<p>Body.</p>
	<h4>Minor</h4>
	<div style="break-after: page"><p>Before</p></div>
	<p>${longParagraph}</p>
</body>`,
				},
				{
					href: "text/b.xhtml",
					body: `<body><h1>Part II</h1><p>Opening.</p></body>`,
				},
			],
		});

	it("falls back to file starts, headings, page breaks and text patterns", async () => {
		const { parsed, units } = await unitsOf(files());
		expect(parsed.book.toc).toEqual([]);
		expect(summary(units)).toEqual([
			{
				file: "a.xhtml",
				at: [0, 0],
				tag: "p",
				text: "CHAPTER I",
				signals: [
					{ kind: "spine-start" },
					{ kind: "text-pattern", pattern: "chapter" },
				],
			},
			{
				file: "a.xhtml",
				at: [1],
				tag: "p",
				text: "First paragraph & more.",
				signals: [],
			},
			{
				file: "a.xhtml",
				at: [2],
				tag: "p",
				text: "* * *",
				signals: [],
			},
			{
				file: "a.xhtml",
				at: [3],
				tag: "p",
				text: "After the stars.",
				signals: [{ kind: "text-pattern", pattern: "scene-break" }],
			},
			{
				file: "a.xhtml",
				at: [4],
				tag: "h3",
				text: "IV",
				signals: [
					{ kind: "heading", level: 3 },
					{ kind: "text-pattern", pattern: "roman-numeral" },
				],
			},
			{
				file: "a.xhtml",
				at: [5],
				tag: "p",
				text: "Body.",
				signals: [],
			},
			{
				file: "a.xhtml",
				at: [6],
				tag: "h4",
				text: "Minor",
				signals: [],
			},
			{
				file: "a.xhtml",
				at: [7, 0],
				tag: "p",
				text: "Before",
				signals: [],
			},
			{
				file: "a.xhtml",
				at: [8],
				tag: "p",
				text: longParagraph,
				// Too long to be a title, so "Part Two" is not a pattern.
				signals: [{ kind: "page-break", source: "style" }],
			},
			{
				file: "b.xhtml",
				at: [0],
				tag: "h1",
				text: "Part II",
				signals: [
					{ kind: "spine-start" },
					{ kind: "heading", level: 1 },
					{ kind: "text-pattern", pattern: "part" },
				],
			},
			{
				file: "b.xhtml",
				at: [1],
				tag: "p",
				text: "Opening.",
				signals: [],
			},
		]);
		await expectAddressesResolve(parsed, units);
	});
});

describe("extractSplitUnits: a single-file book", () => {
	const long = "word ".repeat(80).trim();

	const files = () =>
		bookFiles({
			nav: `<nav epub:type="toc"><ol>
		<li><a href="text/book.xhtml#ch1">One</a></li>
		<li><a href="text/book.xhtml#ch2">Two</a></li>
		<li><a href="text/book.xhtml#anchor">Anchor</a></li>
		<li><a href="text/book.xhtml#missing">Broken</a></li>
		<li><a href="https://example.com/">Website</a></li>
	</ol></nav>`,
			content: [
				{
					href: "text/book.xhtml",
					body: `<body>
	<div class="outer"><div class="inner">
		<section id="ch1"><h1>One</h1><p>Short <span>with a span</span> text.</p></section>
		<section id="ch2"><div><h1 id="h-two">Two</h1></div><p>Mid <a id="anchor"></a>paragraph anchor.</p><p>Following.</p></section>
		<div><span>Mixed</span><p>block</p></div>
		<p></p>
		<p>   </p>
		<p>${long}</p>
	</div></div>
</body>`,
				},
			],
		});

	it("descends through wrappers, skips empty blocks, and maps targets onto units", async () => {
		const { parsed, units } = await unitsOf(files());
		expect(summary(units)).toEqual([
			{
				file: "book.xhtml",
				at: [0, 0, 0, 0],
				tag: "h1",
				text: "One",
				signals: [
					// #ch1 is a <section> container: its first unit gets it.
					{ kind: "toc-target", label: "One", depth: 0 },
					{ kind: "spine-start" },
					{ kind: "heading", level: 1 },
				],
			},
			{
				file: "book.xhtml",
				at: [0, 0, 0, 1],
				tag: "p",
				text: "Short with a span text.",
				signals: [],
			},
			{
				file: "book.xhtml",
				at: [0, 0, 1, 0, 0],
				tag: "h1",
				text: "Two",
				signals: [
					{ kind: "toc-target", label: "Two", depth: 0 },
					{ kind: "heading", level: 1 },
				],
			},
			{
				file: "book.xhtml",
				at: [0, 0, 1, 1],
				tag: "p",
				text: "Mid paragraph anchor.",
				signals: [],
			},
			{
				file: "book.xhtml",
				at: [0, 0, 1, 2],
				tag: "p",
				text: "Following.",
				// #anchor is mid-paragraph in the unit before.
				signals: [{ kind: "toc-target", label: "Anchor", depth: 0 }],
			},
			{
				file: "book.xhtml",
				at: [0, 0, 2],
				tag: "div",
				// Inline text next to a block: the wrapper is one unit.
				text: "Mixed block",
				signals: [],
			},
			{
				file: "book.xhtml",
				at: [0, 0, 5],
				tag: "p",
				text: long.slice(0, LEADING_TEXT_LIMIT).trimEnd(),
				signals: [],
			},
		]);
		expect(units[2].address.id).toBe("h-two");
		expect(units[6].textLength).toBe(long.length);
		await expectAddressesResolve(parsed, units);
	});
});

describe("extractSplitUnits: a fixed-layout book", () => {
	const files = () =>
		bookFiles({
			fixedLayout: true,
			nav: `<nav epub:type="toc"><ol>
		<li><a href="text/p1.xhtml">Cover</a></li>
		<li><a href="text/p2.xhtml#x">Chapter 1</a></li>
	</ol></nav>`,
			content: [
				{
					href: "text/p1.xhtml",
					body: `<body><div class="page"><img src="../images/p1.jpg" alt="Cover"/></div></body>`,
				},
				{
					href: "text/p2.xhtml",
					body: `<body><div class="page"><h1 id="x">Chapter 1</h1><p>Panel one.</p><p>Panel two.</p></div></body>`,
				},
				{
					href: "text/p3.xhtml",
					properties: "rendition:layout-reflowable",
					body: `<body><p>Afterword one.</p><p>Afterword two.</p></body>`,
				},
			],
		});

	it("makes each pre-paginated spine item one unit, and splits reflowable items", async () => {
		const { parsed, units } = await unitsOf(files());
		expect(summary(units)).toEqual([
			{
				file: "p1.xhtml",
				at: [],
				tag: "body",
				text: "",
				signals: [
					{ kind: "toc-target", label: "Cover", depth: 0 },
					{ kind: "spine-start" },
				],
			},
			{
				file: "p2.xhtml",
				at: [],
				tag: "body",
				text: "Chapter 1 Panel one. Panel two.",
				signals: [
					{ kind: "toc-target", label: "Chapter 1", depth: 0 },
					{ kind: "spine-start" },
					{ kind: "heading", level: 1 },
					{ kind: "text-pattern", pattern: "chapter" },
				],
			},
			{
				file: "p3.xhtml",
				at: [0],
				tag: "p",
				text: "Afterword one.",
				signals: [{ kind: "spine-start" }],
			},
			{
				file: "p3.xhtml",
				at: [1],
				tag: "p",
				text: "Afterword two.",
				signals: [],
			},
		]);
		expect(units.map((unit) => unit.layout)).toEqual([
			"pre-paginated",
			"pre-paginated",
			"reflowable",
			"reflowable",
		]);
		expect(units[0].textLength).toBe(0);
		await expectAddressesResolve(parsed, units);
	});
});

describe("extractSplitUnits: content documents", () => {
	it("reads a document that isn't well-formed XML with the HTML parser", async () => {
		const { parsed, units } = await unitsOf(
			bookFiles({
				content: [
					{
						href: "text/a.xhtml",
						body: `<body><h1>Title</h1><p>Hello&nbsp;world</p></body>`,
					},
				],
			}),
		);
		expect(summary(units).map(({ tag, text }) => [tag, text])).toEqual([
			["h1", "Title"],
			["p", "Hello world"],
		]);
		await expectAddressesResolve(parsed, units);
	});

	it("emits one unit for a file with no blocks, so its start can still be split", async () => {
		const { units } = await unitsOf(
			bookFiles({
				content: [
					{
						href: "text/a.xhtml",
						body: "<body><p>Before</p></body>",
					},
					{ href: "text/b.xhtml", body: "<body></body>" },
				],
			}),
		);
		expect(summary(units)[1]).toEqual({
			file: "b.xhtml",
			at: [],
			tag: "body",
			text: "",
			signals: [{ kind: "spine-start" }],
		});
	});

	it("rejects with missing-resource when a spine file is not in the zip", async () => {
		const parsed = await parseEpub(
			await buildEpub(
				bookFiles({ content: [{ href: "text/gone.xhtml" }] }),
			),
		);
		const error = await extractSplitUnits(parsed).then(
			() => null,
			(e: unknown) => e,
		);
		expect(error).toBeInstanceOf(EpubError);
		expect((error as EpubError).code).toBe("missing-resource");
	});
});

describe("resolveUnitAddress", () => {
	it("follows the element path from <body>; [] is the body itself", () => {
		const doc = parseContentDocument(
			page(`<body><div><p>a</p><p id="b">b</p></div></body>`),
		);
		expect(
			resolveUnitAddress(doc, { elementPath: [0, 1], id: "b" })
				?.textContent,
		).toBe("b");
		expect(
			resolveUnitAddress(doc, { elementPath: [], id: null })?.localName,
		).toBe("body");
		expect(resolveUnitAddress(doc, { elementPath: [0, 5], id: null })).toBe(
			null,
		);
	});

	it("falls back to the id when the path no longer leads to it", () => {
		const doc = parseContentDocument(
			page(`<body><div><p>new</p><p>a</p><p id="b">b</p></div></body>`),
		);
		expect(
			resolveUnitAddress(doc, { elementPath: [0, 1], id: "b" })
				?.textContent,
		).toBe("b");
		expect(resolveUnitAddress(doc, { elementPath: [0, 1], id: "zz" })).toBe(
			null,
		);
	});
});
