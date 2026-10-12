import JSZip from "jszip";
import {
	EpubError,
	resolveHref,
	type EpubArchive,
	type EpubBook,
	type EpubLink,
	type EpubManifestItem,
	type EpubObfuscatedResource,
	type EpubSpineItem,
	type EpubTocEntry,
	type ParsedEpub,
} from "./epub";
import { downloadSplitZip, sanitizeBasename } from "./splitDownload";

/**
 * A position in reading order: the point just before spine item
 * `spineIndex`. `spineIndex === book.spine.length` is the end of the book.
 *
 * Only whole spine files can be cut for now. KDA-96 adds a second variant to
 * `EpubBoundary` that cuts inside a file at a block.
 */
export interface EpubSpineBoundary {
	kind: "spine";
	spineIndex: number;
}

export type EpubBoundary = EpubSpineBoundary;

/** The part of the book between two boundaries: `start` inclusive, `end` exclusive. */
export interface EpubSegment {
	start: EpubBoundary;
	end: EpubBoundary;
}

export interface SplitEpubOutput {
	/** The book title with a part suffix, e.g. `"Book — Part 2"`. */
	title: string;
	/** Download name, e.g. `"book-part-2.epub"`. */
	fileName: string;
	/** The complete `.epub` file. */
	bytes: Uint8Array;
}

const NS = {
	opf: "http://www.idpf.org/2007/opf",
	dc: "http://purl.org/dc/elements/1.1/",
	ncx: "http://www.daisy.org/z3986/2005/ncx/",
	xhtml: "http://www.w3.org/1999/xhtml",
	svg: "http://www.w3.org/2000/svg",
	xlink: "http://www.w3.org/1999/xlink",
	ops: "http://www.idpf.org/2007/ops",
	xml: "http://www.w3.org/XML/1998/namespace",
};

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>\n';
const ENCRYPTION_PATH = "META-INF/encryption.xml";
/** Invalid once the content changes (signatures) or meaningless without DRM (rights). */
const DROPPED_META_INF = new Set([
	ENCRYPTION_PATH,
	"META-INF/signatures.xml",
	"META-INF/rights.xml",
]);
const MARKUP_TYPES = new Set([
	"application/xhtml+xml",
	"image/svg+xml",
	"text/html",
]);

const OBFUSCATION = {
	idpf: { uri: "http://www.idpf.org/2008/embedding", length: 1040 },
	adobe: { uri: "http://ns.adobe.com/pdf/enc#RC", length: 1024 },
} satisfies Record<
	EpubObfuscatedResource["algorithm"],
	{ uri: string; length: number }
>;

/**
 * Build one EPUB per segment, entirely in the browser.
 *
 * Each output keeps the source's package path and file layout, and contains:
 * the segment's spine files; the stylesheets, fonts, images and other
 * resources they reference, followed transitively (`src`, `href`,
 * `<link>`, SVG `href`/`xlink:href`, CSS `url()` and `@import`); a rewritten
 * package document (manifest, spine, guide) with copied metadata, a new
 * `urn:uuid` unique identifier and a `— Part N` title suffix; a nav document
 * (EPUB 3) and/or NCX (EPUB 2, or EPUB 3 when the source had one) listing
 * only the segment's contents; and a matching `encryption.xml` when an
 * obfuscated font comes along. Links into files that aren't in the output
 * are unwrapped to plain text. The cover image stays on the first output.
 *
 * Content documents are copied byte-for-byte unless a link had to be
 * unwrapped; rewritten ones are serialized with `XMLSerializer`.
 *
 * @param epub - The parsed source book (`parseEpub`).
 * @param segments - The parts to write, in output order. They may leave gaps
 *                   or overlap; each output is built independently.
 * @param sourceFilename - Used for output file names; falls back to the title.
 * @returns One output per segment, in the same order.
 * @throws RangeError if `segments` is empty or a segment is not a non-empty
 *         range of the spine.
 */
export async function splitEpub(args: {
	epub: ParsedEpub;
	segments: EpubSegment[];
	sourceFilename?: string | null;
}): Promise<SplitEpubOutput[]> {
	const { epub, segments, sourceFilename } = args;
	const { book } = epub;
	if (segments.length === 0) {
		throw new RangeError("Splitting an EPUB needs at least one segment.");
	}
	const ranges = segments.map((segment) =>
		spineRange(segment, book.spine.length),
	);

	const source = await loadSource(epub);
	const baseTitle = book.metadata.title ?? sanitizeBasename(sourceFilename);
	const basename = sanitizeBasename(sourceFilename ?? book.metadata.title);

	const outputs: SplitEpubOutput[] = [];
	for (const [i, [start, end]] of ranges.entries()) {
		const title = `${baseTitle} — Part ${i + 1}`;
		const bytes = await writeSegment(source, {
			spine: book.spine.slice(start, end),
			title,
			identifier: `urn:uuid:${crypto.randomUUID()}`,
			keepCover: i === 0,
		});
		outputs.push({
			title,
			fileName: `${basename}-part-${i + 1}.epub`,
			bytes,
		});
	}
	return outputs;
}

/**
 * Download split EPUBs as one zip, `{basename}-split.zip`, the same way the
 * PDF bulk split does.
 */
export async function downloadSplitEpubs(
	outputs: SplitEpubOutput[],
	sourceFilename: string | null | undefined,
): Promise<void> {
	await downloadSplitZip(
		outputs.map(({ fileName, bytes }) => ({ name: fileName, data: bytes })),
		sanitizeBasename(sourceFilename),
	);
}

/** `[start, end)` spine indices of a segment, validated. */
function spineRange(
	segment: EpubSegment,
	spineLength: number,
): [number, number] {
	const start = segment.start.spineIndex;
	const end = segment.end.spineIndex;
	if (
		!Number.isInteger(start) ||
		!Number.isInteger(end) ||
		start < 0 ||
		end > spineLength ||
		start >= end
	) {
		throw new RangeError(
			`Segment [${start}, ${end}) is not a non-empty range of the ${spineLength}-item spine.`,
		);
	}
	return [start, end];
}

/** What every segment reads from the source book; built once per split. */
interface Source {
	book: EpubBook;
	archive: EpubArchive;
	opfText: string;
	epub3: boolean;
	manifestByPath: Map<string, EpubManifestItem>;
	manifestById: Map<string, EpubManifestItem>;
	/** Manifest `fallback` attributes, id → id. */
	fallbacks: Map<string, string>;
	spinePaths: Set<string>;
	/** Where each output's generated nav goes (EPUB 3 only), and its manifest id. */
	nav: { path: string; id: string } | null;
	/** Where each output's generated NCX goes, if it gets one, and its manifest id. */
	ncx: { path: string; id: string } | null;
	obfuscation: Map<string, EpubObfuscatedResource["algorithm"]>;
	/** Keys the source fonts were obfuscated with; null when underivable. */
	sourceKeys: Record<EpubObfuscatedResource["algorithm"], Uint8Array | null>;
	readText(path: string): Promise<string>;
}

interface SegmentPlan {
	spine: EpubSpineItem[];
	title: string;
	identifier: string;
	keepCover: boolean;
}

/** A parsed XHTML or SVG document; `html` when it only parsed as HTML. */
interface MarkupDoc {
	doc: Document;
	html: boolean;
}

async function loadSource({ book, archive }: ParsedEpub): Promise<Source> {
	const opfText = await archive.readText(book.packagePath);
	const opf = parseXml(opfText);
	if (!opf) {
		throw new EpubError(
			"invalid-package",
			`The package document ${book.packagePath} could not be read.`,
		);
	}
	const epub3 = parseFloat(book.version) >= 3;
	const manifestByPath = new Map(
		book.manifest
			.filter((item) => !item.remote)
			.map((item) => [item.path, item]),
	);
	const usedPaths = new Set([...book.files, ...manifestByPath.keys()]);
	const usedIds = new Set(book.manifest.map((item) => item.id));
	const generated = (existing: string | null, name: string, id: string) => {
		const path =
			existing ?? freePath(book.packageDirectory, name, usedPaths);
		return {
			path,
			id: manifestByPath.get(path)?.id ?? freeId(id, usedIds),
		};
	};

	const fallbacks = new Map<string, string>();
	for (const item of elements(opf, NS.opf, "item")) {
		const fallback = item.getAttribute("fallback");
		if (fallback) fallbacks.set(item.getAttribute("id") ?? "", fallback);
	}

	const identifiers = [
		book.metadata.identifier ?? "",
		...elements(opf, NS.dc, "identifier").map((el) => el.textContent ?? ""),
	];
	const texts = new Map<string, Promise<string>>();

	return {
		book,
		archive,
		opfText,
		epub3,
		manifestByPath,
		manifestById: new Map(book.manifest.map((item) => [item.id, item])),
		fallbacks,
		spinePaths: new Set(book.spine.map((item) => item.path)),
		nav: epub3 ? generated(book.navPath, "nav.xhtml", "nav") : null,
		ncx:
			!epub3 || book.ncxPath
				? generated(book.ncxPath, "toc.ncx", "ncx")
				: null,
		obfuscation: new Map(
			book.obfuscatedResources.map((r) => [r.path, r.algorithm]),
		),
		sourceKeys: {
			idpf: await idpfKey(book.metadata.identifier ?? ""),
			adobe:
				identifiers.map(adobeKey).find((key) => key !== null) ?? null,
		},
		readText(path) {
			let text = texts.get(path);
			if (!text) {
				text = archive.readText(path);
				texts.set(path, text);
			}
			return text;
		},
	};
}

async function writeSegment(
	source: Source,
	plan: SegmentPlan,
): Promise<Uint8Array> {
	const { book, archive } = source;
	const { included, docs, remoteRefs } = await collectResources(source, plan);

	const outputPaths = new Set(included);
	if (source.nav) outputPaths.add(source.nav.path);
	if (source.ncx) outputPaths.add(source.ncx.path);

	const rewritten = new Map<string, string>();
	for (const [path, markup] of docs) {
		if (unwrapForeignLinks(markup.doc, path, outputPaths)) {
			rewritten.set(path, serializeMarkup(markup));
		}
	}

	const segmentPaths = new Set(plan.spine.map((item) => item.path));
	const titles = new Map(
		plan.spine.map((item) => [
			item.path,
			documentTitle(docs.get(item.path)?.doc),
		]),
	);
	let toc = filterToc(book.toc, segmentPaths);
	if (toc.length === 0) {
		// Nothing in the contents falls in this segment: list its files instead.
		toc = plan.spine.map((item) => ({
			label: titles.get(item.path) || basenameOf(item.path),
			href: null,
			path: item.path,
			fragment: null,
			children: [],
		}));
	}

	const newKey = {
		idpf: await idpfKey(plan.identifier),
		adobe: adobeKey(plan.identifier),
	};
	const obfuscated: EpubObfuscatedResource[] = [];

	const zip = new JSZip();
	zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
	for (const path of book.files) {
		if (path === "mimetype") continue;
		if (path.startsWith("META-INF/")) {
			if (!DROPPED_META_INF.has(path)) {
				zip.file(path, await archive.readBytes(path));
			}
			continue;
		}
		if (path === book.packagePath) {
			zip.file(
				path,
				rewritePackage(source, plan, outputPaths, remoteRefs),
			);
			continue;
		}
		if (!included.has(path)) continue;

		const algorithm = source.obfuscation.get(path);
		if (algorithm) {
			obfuscated.push({ path, algorithm });
			zip.file(
				path,
				reobfuscate(
					await archive.readBytes(path),
					OBFUSCATION[algorithm].length,
					source.sourceKeys[algorithm],
					newKey[algorithm],
				),
			);
			continue;
		}
		zip.file(path, rewritten.get(path) ?? (await archive.readBytes(path)));
	}
	if (source.nav) {
		zip.file(
			source.nav.path,
			buildNav(book, source.nav.path, plan, toc, segmentPaths),
		);
	}
	if (source.ncx) {
		zip.file(source.ncx.path, buildNcx(source.ncx.path, plan, toc));
	}
	if (obfuscated.length > 0) {
		zip.file(ENCRYPTION_PATH, buildEncryption(obfuscated));
	}

	return zip.generateAsync({
		type: "uint8array",
		compression: "DEFLATE",
		mimeType: "application/epub+zip",
	});
}

/**
 * Walk from the segment's spine files (plus the cover image on the first
 * output) through everything they reference. Spine files are never pulled in
 * by reference: links to them stay links, handled by `unwrapForeignLinks`.
 * The source nav is skipped; each output gets a generated one.
 */
async function collectResources(
	source: Source,
	plan: SegmentPlan,
): Promise<{
	included: Set<string>;
	docs: Map<string, MarkupDoc>;
	remoteRefs: Set<string>;
}> {
	const { book, archive, manifestByPath, manifestById, spinePaths } = source;
	const included = new Set<string>();
	const docs = new Map<string, MarkupDoc>();
	const remoteRefs = new Set<string>();

	const queue = plan.spine.map((item) => item.path);
	if (plan.keepCover && book.cover && !book.cover.remote) {
		queue.push(book.cover.path);
	}
	const follow = (fromPath: string, href: string) => {
		const resolved = resolveHref(fromPath, href);
		if (!resolved) remoteRefs.add(href);
		else if (!spinePaths.has(resolved.path)) queue.push(resolved.path);
	};

	for (let path = queue.shift(); path !== undefined; path = queue.shift()) {
		const item = manifestByPath.get(path);
		if (
			included.has(path) ||
			!item ||
			!archive.has(path) ||
			path === source.nav?.path ||
			path === source.ncx?.path
		)
			continue;
		included.add(path);

		const fallback = manifestById.get(source.fallbacks.get(item.id) ?? "");
		if (fallback && !fallback.remote) queue.push(fallback.path);

		if (MARKUP_TYPES.has(item.mediaType)) {
			const markup = parseMarkup(
				await source.readText(path),
				item.mediaType,
			);
			docs.set(path, markup);
			for (const href of markupReferences(markup.doc)) follow(path, href);
		} else if (item.mediaType === "text/css") {
			for (const href of cssReferences(await source.readText(path))) {
				follow(path, href);
			}
		}
	}
	return { included, docs, remoteRefs };
}

/** Every href/src in an XHTML or SVG document, including CSS in `style`. */
function markupReferences(doc: Document): string[] {
	const refs: string[] = [];
	for (const el of Array.from(doc.getElementsByTagName("*"))) {
		const name = el.localName;
		for (const attr of ["src", "poster"]) {
			const value = el.getAttribute(attr);
			if (value) refs.push(value);
		}
		const srcset = el.getAttribute("srcset");
		if (srcset) {
			for (const candidate of srcset.split(",")) {
				const url = candidate.trim().split(/\s+/)[0];
				if (url) refs.push(url);
			}
		}
		if (name === "object") {
			const data = el.getAttribute("data");
			if (data) refs.push(data);
		}
		// Hyperlinks too: a link to a spine file is dropped by `follow`, but
		// one to a non-spine resource (a full-size image, say) brings it along.
		if (
			name === "a" ||
			name === "area" ||
			name === "link" ||
			el.namespaceURI === NS.svg
		) {
			const href = linkHref(el);
			if (href) refs.push(href);
		}
		const style = el.getAttribute("style");
		if (style) refs.push(...cssReferences(style));
		if (name === "style") refs.push(...cssReferences(el.textContent ?? ""));
	}
	return refs;
}

const CSS_COMMENT = /\/\*[\s\S]*?\*\//g;
const CSS_REFERENCE = /@import\s+(["'])(.*?)\1|url\(\s*(["']?)(.*?)\3\s*\)/g;

/** `url()` and `@import` targets in a stylesheet, comments ignored. */
function cssReferences(css: string): string[] {
	return Array.from(
		css.replace(CSS_COMMENT, "").matchAll(CSS_REFERENCE),
		(match) => (match[2] ?? match[4]).trim(),
	).filter(Boolean);
}

function linkHref(el: Element): string | null {
	return el.getAttribute("href") ?? el.getAttributeNS(NS.xlink, "href");
}

/**
 * Turn links to files outside the output into plain text: `<a>` is replaced
 * by its content (an empty `<span>` keeps its `id`, so fragments pointing at
 * it still resolve); `<link>` and `<area>` are removed.
 *
 * @returns Whether the document changed.
 */
function unwrapForeignLinks(
	doc: Document,
	path: string,
	outputPaths: Set<string>,
): boolean {
	let changed = false;
	const links = Array.from(doc.getElementsByTagName("*")).filter((el) =>
		["a", "area", "link"].includes(el.localName),
	);
	for (const el of links) {
		const href = linkHref(el);
		const resolved = href ? resolveHref(path, href) : null;
		if (!resolved || outputPaths.has(resolved.path)) continue;
		changed = true;
		if (el.localName !== "a") {
			removeElement(el);
			continue;
		}
		const parent = el.parentNode;
		if (!parent) continue;
		const id = el.getAttribute("id");
		if (id && el.namespaceURI === NS.xhtml) {
			const span = doc.createElementNS(NS.xhtml, "span");
			span.setAttribute("id", id);
			parent.insertBefore(span, el);
		}
		while (el.firstChild) parent.insertBefore(el.firstChild, el);
		el.remove();
	}
	return changed;
}

function parseMarkup(text: string, mediaType: string): MarkupDoc {
	const doc = parseXml(
		text,
		mediaType === "image/svg+xml"
			? "image/svg+xml"
			: "application/xhtml+xml",
	);
	if (doc) return { doc, html: false };
	// Not well-formed (often HTML entities like `&nbsp;`): read it as HTML.
	// Serializing it back with XMLSerializer then yields well-formed XHTML.
	return {
		doc: new DOMParser().parseFromString(text, "text/html"),
		html: true,
	};
}

function serializeMarkup({ doc, html }: MarkupDoc): string {
	if (html) {
		// The HTML parser keeps a literal `xmlns` attribute, which the
		// serializer would emit next to the one it adds itself, and turns the
		// XML declaration into a `<!--?xml … ?-->` comment.
		for (const el of Array.from(doc.getElementsByTagName("*"))) {
			el.removeAttribute("xmlns");
		}
		for (const node of Array.from(doc.childNodes)) {
			if (
				node.nodeType === Node.COMMENT_NODE &&
				node.textContent?.startsWith("?xml")
			) {
				node.remove();
			}
		}
	}
	return XML_DECLARATION + new XMLSerializer().serializeToString(doc);
}

/**
 * Keep entries that point into `paths`. An entry pointing elsewhere is
 * dropped and its surviving children take its place; a heading without a
 * link stays only when something under it survives.
 */
function filterToc(
	entries: EpubTocEntry[],
	paths: Set<string>,
): EpubTocEntry[] {
	return entries.flatMap((entry) => {
		const children = filterToc(entry.children, paths);
		if (entry.path !== null && paths.has(entry.path)) {
			return [{ ...entry, children }];
		}
		if (entry.href === null && children.length > 0) {
			return [{ ...entry, children }];
		}
		return children;
	});
}

function rewritePackage(
	source: Source,
	plan: SegmentPlan,
	outputPaths: Set<string>,
	remoteRefs: Set<string>,
): string {
	const { book } = source;
	const opf = parseXml(source.opfText)!;
	const pkg = opf.documentElement;
	const create = (name: string) =>
		opf.createElementNS(
			pkg.namespaceURI,
			pkg.prefix ? `${pkg.prefix}:${name}` : name,
		);
	const metadata =
		elements(opf, NS.opf, "metadata")[0] ??
		pkg.insertBefore(create("metadata"), pkg.firstChild);
	const manifest = elements(opf, NS.opf, "manifest")[0];
	const spine = elements(opf, NS.opf, "spine")[0];
	const metas = elements(opf, NS.opf, "meta");

	// Identifier: replace the unique one, whose refinements no longer apply.
	const uniqueId = pkg.getAttribute("unique-identifier");
	let identifier =
		elements(opf, NS.dc, "identifier").find(
			(el) => uniqueId && el.getAttribute("id") === uniqueId,
		) ?? elements(opf, NS.dc, "identifier")[0];
	if (!identifier) {
		identifier = opf.createElementNS(NS.dc, "dc:identifier");
		metadata.insertBefore(identifier, metadata.firstChild);
	}
	if (!identifier.getAttribute("id")) {
		identifier.setAttribute("id", uniqueId || "uid");
	}
	pkg.setAttribute("unique-identifier", identifier.getAttribute("id")!);
	identifier.textContent = plan.identifier;
	const scheme = identifier.getAttributeNodeNS(NS.opf, "scheme");
	if (scheme) scheme.value = "UUID";
	for (const meta of metas) {
		if (
			meta.getAttribute("refines") === `#${identifier.getAttribute("id")}`
		) {
			removeElement(meta);
		}
	}

	const title =
		elements(opf, NS.dc, "title")[0] ??
		metadata.appendChild(opf.createElementNS(NS.dc, "dc:title"));
	title.textContent = plan.title;

	if (source.epub3) {
		const modified =
			metas.find(
				(meta) => meta.getAttribute("property") === "dcterms:modified",
			) ?? metadata.appendChild(create("meta"));
		modified.setAttribute("property", "dcterms:modified");
		modified.textContent = new Date()
			.toISOString()
			.replace(/\.\d{3}Z$/, "Z");
	}

	// Manifest: keep what the output contains; add generated nav/NCX items.
	const keptIds = new Set<string>();
	for (const item of childElements(manifest, NS.opf, "item")) {
		const href = item.getAttribute("href") ?? "";
		const resolved = resolveHref(book.packagePath, href);
		const keep = resolved
			? outputPaths.has(resolved.path)
			: remoteRefs.has(href);
		if (!keep) {
			removeElement(item);
			continue;
		}
		keptIds.add(item.getAttribute("id") ?? "");
		// The generated nav has no scripts, SVG or remote resources, so it
		// carries `nav` alone.
		const properties =
			resolved && resolved.path === source.nav?.path
				? ["nav"]
				: tokens(item.getAttribute("properties")).filter(
						(property) =>
							property !== "nav" &&
							(plan.keepCover || property !== "cover-image"),
					);
		if (properties.length > 0) {
			item.setAttribute("properties", properties.join(" "));
		} else {
			item.removeAttribute("properties");
		}
	}
	for (const [generated, mediaType] of [
		[source.nav, "application/xhtml+xml"],
		[source.ncx, "application/x-dtbncx+xml"],
	] as const) {
		if (!generated || keptIds.has(generated.id)) continue;
		const item = create("item");
		item.setAttribute("id", generated.id);
		item.setAttribute(
			"href",
			relativeHref(book.packagePath, generated.path),
		);
		item.setAttribute("media-type", mediaType);
		if (generated === source.nav) item.setAttribute("properties", "nav");
		manifest.appendChild(item);
		keptIds.add(generated.id);
	}
	for (const item of childElements(manifest, NS.opf, "item")) {
		const overlay = item.getAttribute("media-overlay");
		if (overlay && !keptIds.has(overlay)) {
			item.removeAttribute("media-overlay");
		}
	}

	// Spine: only this segment's itemrefs. A spine needs a linear item, so a
	// segment made only of `linear="no"` files reads them in the main flow.
	const idrefs = new Set(plan.spine.map((item) => item.idref));
	const anyLinear = plan.spine.some((item) => item.linear);
	for (const itemref of childElements(spine, NS.opf, "itemref")) {
		const idref = itemref.getAttribute("idref") ?? "";
		if (!idrefs.has(idref) || !keptIds.has(idref)) {
			removeElement(itemref);
		} else if (!anyLinear) {
			itemref.removeAttribute("linear");
		}
	}
	if (source.ncx) spine.setAttribute("toc", source.ncx.id);
	else spine.removeAttribute("toc");

	// EPUB 2 cover meta, guide and metadata links into dropped files.
	const keepCoverMeta =
		plan.keepCover && book.cover && outputPaths.has(book.cover.path);
	for (const meta of metas) {
		if (meta.getAttribute("name") === "cover" && !keepCoverMeta) {
			removeElement(meta);
		}
	}
	const guide = elements(opf, NS.opf, "guide")[0];
	if (guide) {
		for (const reference of childElements(guide, NS.opf, "reference")) {
			const resolved = resolveHref(
				book.packagePath,
				reference.getAttribute("href") ?? "",
			);
			if (resolved && !outputPaths.has(resolved.path)) {
				removeElement(reference);
			}
		}
		if (childElements(guide, NS.opf, "reference").length === 0) {
			removeElement(guide);
		}
	}
	for (const link of childElements(metadata, NS.opf, "link")) {
		const resolved = resolveHref(
			book.packagePath,
			link.getAttribute("href") ?? "",
		);
		if (resolved && !outputPaths.has(resolved.path)) removeElement(link);
	}

	return XML_DECLARATION + new XMLSerializer().serializeToString(opf);
}

/**
 * EPUB 3 nav document: the segment's contents, plus its landmarks and page
 * list when any fall in the segment.
 */
function buildNav(
	book: EpubBook,
	navPath: string,
	plan: SegmentPlan,
	toc: EpubTocEntry[],
	segmentPaths: Set<string>,
): string {
	const doc = new DOMParser().parseFromString(
		`<html xmlns="${NS.xhtml}" xmlns:epub="${NS.ops}"><head><title/></head><body/></html>`,
		"application/xhtml+xml",
	);
	const el = (name: string, text?: string) => {
		const element = doc.createElementNS(NS.xhtml, name);
		if (text !== undefined) element.textContent = text;
		return element;
	};
	const link = (entry: EpubLink, type?: string) => {
		const a = el("a", labelOf(entry));
		if (type) a.setAttributeNS(NS.ops, "epub:type", type);
		a.setAttribute("href", hrefTo(navPath, entry));
		return a;
	};
	const list = (entries: EpubTocEntry[]): Element => {
		const ol = el("ol");
		for (const entry of entries) {
			const li = ol.appendChild(el("li"));
			li.appendChild(
				entry.path !== null ? link(entry) : el("span", labelOf(entry)),
			);
			if (entry.children.length > 0) li.appendChild(list(entry.children));
		}
		return ol;
	};
	const flatList = (links: Element[]) => {
		const ol = el("ol");
		for (const a of links) ol.appendChild(el("li")).appendChild(a);
		return ol;
	};
	const body = doc.getElementsByTagName("body")[0];
	const nav = (type: string, heading: string, ol: Element) => {
		const element = body.appendChild(el("nav"));
		element.setAttributeNS(NS.ops, "epub:type", type);
		element.setAttribute("id", type);
		if (type !== "toc") element.setAttribute("hidden", "");
		element.append(el("h1", heading), ol);
	};

	const { language } = book.metadata;
	if (language) {
		doc.documentElement.setAttribute("lang", language);
		doc.documentElement.setAttributeNS(NS.xml, "xml:lang", language);
	}
	doc.getElementsByTagName("title")[0].textContent = plan.title;

	nav("toc", "Contents", list(toc));
	const inSegment = (entry: EpubLink) =>
		entry.path !== null && segmentPaths.has(entry.path);
	const landmarks = book.landmarks.filter(inSegment);
	if (landmarks.length > 0) {
		nav(
			"landmarks",
			"Landmarks",
			flatList(landmarks.map((entry) => link(entry, entry.type))),
		);
	}
	const pageList = book.pageList.filter(inSegment);
	if (pageList.length > 0) {
		nav(
			"page-list",
			"Pages",
			flatList(pageList.map((entry) => link(entry))),
		);
	}

	return (
		XML_DECLARATION +
		"<!DOCTYPE html>\n" +
		new XMLSerializer().serializeToString(doc)
	);
}

/**
 * NCX for the segment. A heading without a link points at its first linked
 * descendant, since every navPoint needs a target. Entries sharing a target
 * share a playOrder, as EPUBCheck requires.
 */
function buildNcx(
	ncxPath: string,
	plan: SegmentPlan,
	toc: EpubTocEntry[],
): string {
	const doc = new DOMParser().parseFromString(
		`<ncx xmlns="${NS.ncx}" version="2005-1"><head/><docTitle><text/></docTitle><navMap/></ncx>`,
		"application/xml",
	);
	const el = (name: string) => doc.createElementNS(NS.ncx, name);
	const head = doc.getElementsByTagName("head")[0];
	const meta = (name: string, content: string) => {
		const element = head.appendChild(el("meta"));
		element.setAttribute("name", name);
		element.setAttribute("content", content);
	};
	const depth = (entries: EpubTocEntry[]): number =>
		entries.length === 0
			? 0
			: 1 + Math.max(...entries.map((entry) => depth(entry.children)));
	meta("dtb:uid", plan.identifier);
	meta("dtb:depth", String(depth(toc)));
	meta("dtb:totalPageCount", "0");
	meta("dtb:maxPageNumber", "0");
	doc.getElementsByTagName("text")[0].textContent = plan.title;

	const firstLinked = (entry: EpubTocEntry): EpubTocEntry | undefined =>
		entry.path !== null
			? entry
			: entry.children.map(firstLinked).find(Boolean);
	const playOrders = new Map<string, number>();
	let pointCount = 0;
	const points = (entries: EpubTocEntry[], parent: Element) => {
		for (const entry of entries) {
			const target = firstLinked(entry);
			if (!target) continue;
			const src = hrefTo(ncxPath, target);
			if (!playOrders.has(src)) playOrders.set(src, playOrders.size + 1);
			const point = parent.appendChild(el("navPoint"));
			point.setAttribute("id", `navPoint-${++pointCount}`);
			point.setAttribute("playOrder", String(playOrders.get(src)));
			const label = point.appendChild(el("navLabel"));
			label.appendChild(el("text")).textContent = labelOf(entry);
			point.appendChild(el("content")).setAttribute("src", src);
			points(entry.children, point);
		}
	};
	points(toc, doc.getElementsByTagName("navMap")[0]);

	return XML_DECLARATION + new XMLSerializer().serializeToString(doc);
}

function buildEncryption(resources: EpubObfuscatedResource[]): string {
	const entries = resources.map(
		({ path, algorithm }) => `	<enc:EncryptedData>
		<enc:EncryptionMethod Algorithm="${OBFUSCATION[algorithm].uri}"/>
		<enc:CipherData><enc:CipherReference URI="${encodePath(path)}"/></enc:CipherData>
	</enc:EncryptedData>`,
	);
	return `${XML_DECLARATION}<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#">
${entries.join("\n")}
</encryption>
`;
}

/**
 * IDPF font obfuscation key: SHA-1 of the unique identifier with all XML
 * whitespace removed.
 */
async function idpfKey(identifier: string): Promise<Uint8Array> {
	const stripped = identifier.replace(/[ \t\r\n]/g, "");
	return new Uint8Array(
		await crypto.subtle.digest("SHA-1", new TextEncoder().encode(stripped)),
	);
}

/** Adobe font obfuscation key: the 16 bytes of a UUID identifier; null if it isn't one. */
function adobeKey(identifier: string): Uint8Array | null {
	const hex = identifier
		.trim()
		.replace(/^urn:uuid:/i, "")
		.replace(/[-:]/g, "");
	if (!/^[0-9a-f]{32}$/i.test(hex)) return null;
	return Uint8Array.from(hex.match(/../g)!, (byte) => parseInt(byte, 16));
}

/**
 * Swap a font's obfuscation key: XOR the first `length` bytes with the old
 * key (undoing it) and then the new one. Without an old key the source's
 * obfuscation can't be undone, so the bytes only get the new key.
 */
function reobfuscate(
	bytes: Uint8Array,
	length: number,
	oldKey: Uint8Array | null,
	newKey: Uint8Array | null,
): Uint8Array {
	const out = bytes.slice();
	for (let i = 0; i < Math.min(length, out.length); i++) {
		if (oldKey) out[i] ^= oldKey[i % oldKey.length];
		if (newKey) out[i] ^= newKey[i % newKey.length];
	}
	return out;
}

/** Href from the file at `fromPath` to a link's target, keeping its fragment as written. */
function hrefTo(fromPath: string, link: EpubLink): string {
	const hashAt = link.href?.indexOf("#") ?? -1;
	let fragment = "";
	if (link.href && hashAt >= 0) fragment = link.href.slice(hashAt);
	else if (link.fragment) fragment = `#${encodeURIComponent(link.fragment)}`;
	return relativeHref(fromPath, link.path ?? fromPath) + fragment;
}

/** Relative, percent-encoded href from the file at `fromPath` to `toPath`. */
function relativeHref(fromPath: string, toPath: string): string {
	const from = fromPath.split("/").slice(0, -1);
	const to = toPath.split("/");
	let common = 0;
	while (
		common < from.length &&
		common < to.length - 1 &&
		from[common] === to[common]
	) {
		common++;
	}
	return [
		...from.slice(common).map(() => ".."),
		...to.slice(common).map(encodeURIComponent),
	].join("/");
}

function encodePath(path: string): string {
	return path.split("/").map(encodeURIComponent).join("/");
}

function labelOf(link: EpubLink): string {
	return link.label || basenameOf(link.path ?? "") || "Untitled";
}

function documentTitle(doc: Document | undefined): string {
	const title = doc?.getElementsByTagNameNS("*", "title")[0];
	return (title?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function basenameOf(path: string): string {
	return path.slice(path.lastIndexOf("/") + 1);
}

/** `{directory}{name}`, numbered (`toc-2.ncx`) when that path is taken. */
function freePath(directory: string, name: string, used: Set<string>): string {
	const dot = name.lastIndexOf(".");
	for (let n = 1; ; n++) {
		const candidate =
			n === 1
				? directory + name
				: `${directory}${name.slice(0, dot)}-${n}${name.slice(dot)}`;
		if (!used.has(candidate)) return candidate;
	}
}

function freeId(base: string, used: Set<string>): string {
	for (let n = 1; ; n++) {
		const candidate = n === 1 ? base : `${base}-${n}`;
		if (!used.has(candidate)) return candidate;
	}
}

/** Remove `el` along with the indentation before it, so no blank line is left. */
function removeElement(el: Element): void {
	const before = el.previousSibling;
	if (before?.nodeType === Node.TEXT_NODE && !before.textContent?.trim()) {
		before.remove();
	}
	el.remove();
}

/** Parse XML with the platform DOMParser; null when it isn't well-formed. */
function parseXml(
	text: string,
	type: DOMParserSupportedType = "application/xml",
): Document | null {
	const doc = new DOMParser().parseFromString(text, type);
	return doc.getElementsByTagName("parsererror").length > 0 ? null : doc;
}

/** Descendants with this local name in `ns` (or no namespace), as in epub.ts. */
function elements(root: Document | Element, ns: string, localName: string) {
	return Array.from(root.getElementsByTagNameNS("*", localName)).filter(
		(el) => inNamespace(el, ns),
	);
}

/** Direct children of `parent` matching like `elements`. */
function childElements(
	parent: Element | undefined,
	ns: string,
	localName: string,
): Element[] {
	if (!parent) return [];
	return Array.from(parent.children).filter(
		(el) => el.localName === localName && inNamespace(el, ns),
	);
}

function inNamespace(el: Element, ns: string): boolean {
	return el.namespaceURI === ns || el.namespaceURI === null;
}

function tokens(value: string | null): string[] {
	return value ? value.trim().split(/\s+/).filter(Boolean) : [];
}
