import JSZip from "jszip";

/**
 * Why an EPUB could not be opened. Stable strings, so the UI can map each one
 * to its own message.
 *
 * - `invalid-zip`: the bytes are not a zip archive.
 * - `missing-container`: `META-INF/container.xml` is absent, malformed, or
 *   names no package document.
 * - `missing-package`: the package document named by the container is not in
 *   the zip.
 * - `invalid-package`: the package document is malformed or has no readable
 *   spine.
 * - `drm-encrypted`: `META-INF/encryption.xml` encrypts resources with
 *   something other than font obfuscation.
 * - `missing-resource`: `EpubArchive` was asked for a path not in the zip.
 */
export type EpubErrorCode =
	| "invalid-zip"
	| "missing-container"
	| "missing-package"
	| "invalid-package"
	| "drm-encrypted"
	| "missing-resource";

export class EpubError extends Error {
	readonly code: EpubErrorCode;

	constructor(code: EpubErrorCode, message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "EpubError";
		this.code = code;
	}
}

/** `pre-paginated` is fixed layout; everything else reflows. */
export type EpubLayout = "reflowable" | "pre-paginated";

/** A zip path plus the `#fragment` (percent-decoded) an href pointed at. */
export interface ResolvedHref {
	path: string;
	fragment: string | null;
}

export interface EpubMetadata {
	/** First `dc:title`, whitespace-collapsed. */
	title: string | null;
	/** Every `dc:creator`, in document order. */
	creators: string[];
	/** First `dc:language` (BCP 47 tag). */
	language: string | null;
	/** The `dc:identifier` named by the package's `unique-identifier`, else the first one. */
	identifier: string | null;
	publisher: string | null;
	description: string | null;
	/** First `dc:date`, as written. */
	date: string | null;
	/** EPUB 3 `dcterms:modified`; null in EPUB 2. */
	modified: string | null;
}

export interface EpubManifestItem {
	id: string;
	/** The href exactly as written in the package document. */
	href: string;
	/** Full zip path (percent-decoded). For remote resources, the URL itself. */
	path: string;
	mediaType: string;
	/** Space-separated `properties` split into tokens, e.g. `["nav"]`, `["cover-image"]`. */
	properties: string[];
	/** True when `href` is an absolute URL rather than a file in the zip. */
	remote: boolean;
}

export interface EpubSpineItem {
	/** Position in reading order (0-based), counting only items that resolved. */
	index: number;
	idref: string;
	/** The manifest item's original href. */
	href: string;
	/** Full zip path of the content document. */
	path: string;
	mediaType: string;
	/** False for `linear="no"` items (notes, pop-ups) that sit outside the main flow. */
	linear: boolean;
	/** The itemref's own `properties`, e.g. `page-spread-left`. */
	properties: string[];
	/** Book layout, overridden by `rendition:layout-*` on this itemref. */
	layout: EpubLayout;
}

/**
 * A link from a navigation structure. `href` is as written (relative to the
 * document it came from); `path` is the resolved zip path, null for headings
 * without a link or for external URLs.
 */
export interface EpubLink {
	label: string;
	href: string | null;
	path: string | null;
	fragment: string | null;
}

export interface EpubTocEntry extends EpubLink {
	children: EpubTocEntry[];
}

export interface EpubLandmark extends EpubLink {
	/** `epub:type` (EPUB 3, e.g. `bodymatter`) or guide `type` (EPUB 2, e.g. `text`). */
	type: string;
}

export type EpubPageTarget = EpubLink;

export interface EpubObfuscatedResource {
	/** Zip path of the obfuscated font. */
	path: string;
	/** IDPF obfuscation is keyed on `metadata.identifier`; Adobe's on the book's UUID. */
	algorithm: "idpf" | "adobe";
}

/**
 * Normalized, structured view of an EPUB. Plain data (survives
 * `structuredClone` and JSON). Every `path` is a full zip path that can be
 * passed to `EpubArchive`.
 */
export interface EpubBook {
	/** Package `version` attribute, e.g. `"3.0"` or `"2.0"`; empty when absent. */
	version: string;
	/** Zip path of the package document (OPF), e.g. `OEBPS/content.opf`. */
	packagePath: string;
	/** Directory of the package document with a trailing slash (`OEBPS/`), or `""` at the root. */
	packageDirectory: string;
	metadata: EpubMetadata;
	/** Manifest items in document order. */
	manifest: EpubManifestItem[];
	/** Spine in reading order. Never empty. */
	spine: EpubSpineItem[];
	/** Spine `page-progression-direction`; null when absent or `default`. */
	pageProgressionDirection: "ltr" | "rtl" | null;
	/** Nested table of contents. Empty when the book has none. */
	toc: EpubTocEntry[];
	/** Where `toc` came from: the EPUB 3 nav document, the EPUB 2 NCX, or nowhere. */
	tocSource: "nav" | "ncx" | null;
	/** From nav `landmarks`, falling back to the EPUB 2 `<guide>`. */
	landmarks: EpubLandmark[];
	/** From nav `page-list`, falling back to the NCX `pageList`. */
	pageList: EpubPageTarget[];
	/** The cover image's manifest item, if the book declares one. */
	cover: EpubManifestItem | null;
	/** Book-wide layout from `rendition:layout`. */
	layout: EpubLayout;
	/** Zip path of the EPUB 3 nav document, if any. */
	navPath: string | null;
	/** Zip path of the NCX, if any (reported even when nav was used). */
	ncxPath: string | null;
	/** Fonts listed in `encryption.xml` as obfuscated. They must be copied byte-for-byte and keep the same identifier. */
	obfuscatedResources: EpubObfuscatedResource[];
	/** Every file entry in the zip (no directory entries), in zip order. */
	files: string[];
}

/** Live handle on the unzipped EPUB, for reading any entry by its zip path. */
export interface EpubArchive {
	/** Every file entry in the zip, in zip order. */
	readonly paths: string[];
	has(path: string): boolean;
	/** Read an entry as UTF-8 text. Rejects with `missing-resource` if absent. */
	readText(path: string): Promise<string>;
	/** Read an entry's raw bytes. Rejects with `missing-resource` if absent. */
	readBytes(path: string): Promise<Uint8Array>;
}

export interface ParsedEpub {
	book: EpubBook;
	archive: EpubArchive;
}

const NS = {
	container: "urn:oasis:names:tc:opendocument:xmlns:container",
	opf: "http://www.idpf.org/2007/opf",
	dc: "http://purl.org/dc/elements/1.1/",
	ncx: "http://www.daisy.org/z3986/2005/ncx/",
	xhtml: "http://www.w3.org/1999/xhtml",
	ops: "http://www.idpf.org/2007/ops",
	xmlenc: "http://www.w3.org/2001/04/xmlenc#",
};

const CONTAINER_PATH = "META-INF/container.xml";
const ENCRYPTION_PATH = "META-INF/encryption.xml";
const PACKAGE_MEDIA_TYPE = "application/oebps-package+xml";
const NCX_MEDIA_TYPE = "application/x-dtbncx+xml";

/** Font obfuscation algorithms. Anything else in encryption.xml is DRM. */
const OBFUSCATION_ALGORITHMS: Record<
	string,
	EpubObfuscatedResource["algorithm"]
> = {
	"http://www.idpf.org/2008/embedding": "idpf",
	"http://ns.adobe.com/pdf/enc#RC": "adobe",
};

/**
 * Unzip an EPUB and build its normalized model.
 *
 * Steps: refuse DRM (`encryption.xml` with real encryption), find the package
 * document through `META-INF/container.xml`, then read metadata, manifest and
 * spine from it, and navigation from the EPUB 3 nav document (falling back to
 * the EPUB 2 NCX and `<guide>`). A missing or malformed nav/NCX is not fatal;
 * the book just has an empty contents list.
 *
 * @throws EpubError with a code from `EpubErrorCode`.
 */
export async function parseEpub(
	data: ArrayBuffer | Uint8Array | Blob,
): Promise<ParsedEpub> {
	let zip: JSZip;
	try {
		zip = await JSZip.loadAsync(data);
	} catch (cause) {
		throw new EpubError(
			"invalid-zip",
			"This file isn't an EPUB: it is not a zip archive.",
			{ cause },
		);
	}
	const archive = createArchive(zip);

	const obfuscatedResources = archive.has(ENCRYPTION_PATH)
		? readEncryption(await archive.readText(ENCRYPTION_PATH))
		: [];

	const packagePath = await findPackagePath(archive);
	const opf = parseXml(await archive.readText(packagePath));
	const packageEl = opf?.documentElement;
	if (!opf || !packageEl || packageEl.localName !== "package") {
		throw new EpubError(
			"invalid-package",
			`The package document ${packagePath} could not be read.`,
		);
	}

	const manifest = elements(opf, NS.opf, "item").map((item) =>
		readManifestItem(item, packagePath),
	);
	const manifestById = new Map(manifest.map((item) => [item.id, item]));
	const metas = elements(opf, NS.opf, "meta");
	const layout: EpubLayout =
		metaProperty(metas, "rendition:layout") === "pre-paginated"
			? "pre-paginated"
			: "reflowable";

	const spineEl = elements(opf, NS.opf, "spine")[0];
	const spine = spineEl ? readSpine(spineEl, manifestById, layout) : [];
	if (spine.length === 0) {
		throw new EpubError(
			"invalid-package",
			"The book has no readable content (its spine is empty).",
		);
	}
	const direction = spineEl.getAttribute("page-progression-direction");

	const navItem = manifest.find(
		(item) => !item.remote && item.properties.includes("nav"),
	);
	const ncxItem =
		manifestById.get(spineEl.getAttribute("toc") ?? "") ??
		manifest.find((item) => item.mediaType === NCX_MEDIA_TYPE);
	const navPath = navItem && archive.has(navItem.path) ? navItem.path : null;
	const ncxPath =
		ncxItem && !ncxItem.remote && archive.has(ncxItem.path)
			? ncxItem.path
			: null;

	const nav = navPath
		? readNav(await archive.readText(navPath), navPath)
		: null;
	const ncx =
		ncxPath && (!nav?.toc.length || !nav.pageList.length)
			? readNcx(await archive.readText(ncxPath), ncxPath)
			: null;

	let toc: EpubTocEntry[] = [];
	let tocSource: EpubBook["tocSource"] = null;
	if (nav?.toc.length) {
		toc = nav.toc;
		tocSource = "nav";
	} else if (ncx?.toc.length) {
		toc = ncx.toc;
		tocSource = "ncx";
	}

	return {
		archive,
		book: {
			version: packageEl.getAttribute("version") ?? "",
			packagePath,
			packageDirectory: directoryOf(packagePath),
			metadata: readMetadata(opf, packageEl, metas),
			manifest,
			spine,
			pageProgressionDirection:
				direction === "ltr" || direction === "rtl" ? direction : null,
			toc,
			tocSource,
			landmarks: nav?.landmarks.length
				? nav.landmarks
				: readGuide(opf, packagePath),
			pageList: nav?.pageList.length
				? nav.pageList
				: (ncx?.pageList ?? []),
			cover: findCover(manifest, manifestById, metas),
			layout,
			navPath,
			ncxPath,
			obfuscatedResources,
			files: archive.paths,
		},
	};
}

/**
 * Resolve an href found in the file at `fromPath` to a full zip path, the way
 * a browser resolves a relative URL: relative to that file's directory, with
 * `.`/`..` collapsed, percent-encoding decoded, and any query dropped. A bare
 * `#fragment` resolves to `fromPath` itself; a leading `/` means the zip root.
 *
 * @returns null for external URLs (`https:`, `mailto:`, `//host`, …).
 */
export function resolveHref(
	fromPath: string,
	href: string,
): ResolvedHref | null {
	if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) return null;

	const hashAt = href.indexOf("#");
	let rawPath = hashAt >= 0 ? href.slice(0, hashAt) : href;
	const rawFragment = hashAt >= 0 ? href.slice(hashAt + 1) : "";
	const queryAt = rawPath.indexOf("?");
	if (queryAt >= 0) rawPath = rawPath.slice(0, queryAt);
	const fragment = rawFragment ? decodePercent(rawFragment) : null;

	if (rawPath === "") return { path: fromPath, fragment };

	const decoded = decodePercent(rawPath);
	const joined = decoded.startsWith("/")
		? decoded
		: directoryOf(fromPath) + decoded;
	const segments: string[] = [];
	for (const segment of joined.split("/")) {
		if (segment === "" || segment === ".") continue;
		if (segment === "..") segments.pop();
		else segments.push(segment);
	}
	return { path: segments.join("/"), fragment };
}

function createArchive(zip: JSZip): EpubArchive {
	const paths = Object.values(zip.files)
		.filter((entry) => !entry.dir)
		.map((entry) => entry.name);
	const pathSet = new Set(paths);
	const entry = (path: string) => {
		const file = pathSet.has(path) ? zip.file(path) : null;
		if (!file) {
			throw new EpubError(
				"missing-resource",
				`${path} is not in the EPUB.`,
			);
		}
		return file;
	};
	return {
		paths,
		has: (path) => pathSet.has(path),
		readText: async (path) => entry(path).async("string"),
		readBytes: async (path) => entry(path).async("uint8array"),
	};
}

/**
 * Check `encryption.xml`. Font obfuscation (IDPF/Adobe) is allowed and
 * returned; any other algorithm means the content is DRM-encrypted. An
 * unreadable file is treated as DRM, since we can't prove it isn't.
 */
function readEncryption(xml: string): EpubObfuscatedResource[] {
	const doc = parseXml(xml);
	if (!doc) {
		throw new EpubError(
			"drm-encrypted",
			"This EPUB has an encryption manifest that couldn't be read, so it may be DRM-protected.",
		);
	}
	const resources: EpubObfuscatedResource[] = [];
	for (const data of elements(doc, NS.xmlenc, "EncryptedData")) {
		const algorithm =
			elements(data, NS.xmlenc, "EncryptionMethod")[0]?.getAttribute(
				"Algorithm",
			) ?? "";
		const obfuscation = OBFUSCATION_ALGORITHMS[algorithm];
		if (!obfuscation) {
			throw new EpubError(
				"drm-encrypted",
				"This EPUB is DRM-protected and can't be opened.",
			);
		}
		const uri =
			elements(data, NS.xmlenc, "CipherReference")[0]?.getAttribute(
				"URI",
			) ?? "";
		const resolved = resolveHref("", uri);
		if (resolved)
			resources.push({ path: resolved.path, algorithm: obfuscation });
	}
	return resources;
}

async function findPackagePath(archive: EpubArchive): Promise<string> {
	if (!archive.has(CONTAINER_PATH)) {
		throw new EpubError(
			"missing-container",
			"This file isn't an EPUB: META-INF/container.xml is missing.",
		);
	}
	const doc = parseXml(await archive.readText(CONTAINER_PATH));
	const rootfiles = doc ? elements(doc, NS.container, "rootfile") : [];
	const rootfile =
		rootfiles.find(
			(el) => el.getAttribute("media-type") === PACKAGE_MEDIA_TYPE,
		) ?? rootfiles[0];
	const fullPath = rootfile?.getAttribute("full-path");
	const resolved = fullPath ? resolveHref("", fullPath) : null;
	if (!resolved) {
		throw new EpubError(
			"missing-container",
			"This EPUB's container.xml doesn't name a package document.",
		);
	}
	if (!archive.has(resolved.path)) {
		throw new EpubError(
			"missing-package",
			`This EPUB's package document (${resolved.path}) is missing.`,
		);
	}
	return resolved.path;
}

function readMetadata(
	opf: Document,
	packageEl: Element,
	metas: Element[],
): EpubMetadata {
	const dc = (name: string) =>
		elements(opf, NS.dc, name)
			.map(textOf)
			.filter((value) => value !== "");
	const first = (name: string) => dc(name)[0] ?? null;

	const uniqueId = packageEl.getAttribute("unique-identifier");
	const identifiers = elements(opf, NS.dc, "identifier");
	const identifierEl =
		identifiers.find(
			(el) => uniqueId && el.getAttribute("id") === uniqueId,
		) ?? identifiers[0];

	return {
		title: first("title"),
		creators: dc("creator"),
		language: first("language"),
		identifier: identifierEl ? textOf(identifierEl) || null : null,
		publisher: first("publisher"),
		description: first("description"),
		date: first("date"),
		modified: metaProperty(metas, "dcterms:modified"),
	};
}

function readManifestItem(
	item: Element,
	packagePath: string,
): EpubManifestItem {
	const href = item.getAttribute("href") ?? "";
	const resolved = resolveHref(packagePath, href);
	return {
		id: item.getAttribute("id") ?? "",
		href,
		path: resolved ? resolved.path : href,
		mediaType: item.getAttribute("media-type") ?? "",
		properties: tokens(item.getAttribute("properties")),
		remote: resolved === null,
	};
}

/** Itemrefs in order; ones whose idref isn't in the manifest are skipped. */
function readSpine(
	spineEl: Element,
	manifestById: Map<string, EpubManifestItem>,
	bookLayout: EpubLayout,
): EpubSpineItem[] {
	const spine: EpubSpineItem[] = [];
	for (const itemref of childElements(spineEl, NS.opf, "itemref")) {
		const idref = itemref.getAttribute("idref") ?? "";
		const item = manifestById.get(idref);
		if (!item || item.remote) continue;
		const properties = tokens(itemref.getAttribute("properties"));
		let layout = bookLayout;
		if (properties.includes("rendition:layout-pre-paginated"))
			layout = "pre-paginated";
		if (properties.includes("rendition:layout-reflowable"))
			layout = "reflowable";
		spine.push({
			index: spine.length,
			idref,
			href: item.href,
			path: item.path,
			mediaType: item.mediaType,
			linear: itemref.getAttribute("linear") !== "no",
			properties,
			layout,
		});
	}
	return spine;
}

/** EPUB 3 `cover-image` property, else EPUB 2 `<meta name="cover" content="{id}">`. */
function findCover(
	manifest: EpubManifestItem[],
	manifestById: Map<string, EpubManifestItem>,
	metas: Element[],
): EpubManifestItem | null {
	const byProperty = manifest.find((item) =>
		item.properties.includes("cover-image"),
	);
	if (byProperty) return byProperty;

	const content = metas
		.find((meta) => meta.getAttribute("name") === "cover")
		?.getAttribute("content");
	if (!content) return null;
	// Some EPUB 2 books put the href in `content` instead of the id.
	const item =
		manifestById.get(content) ??
		manifest.find((candidate) => candidate.href === content);
	return item?.mediaType.startsWith("image/") ? item : null;
}

/** Contents, landmarks and page list from an EPUB 3 nav document. */
function readNav(
	text: string,
	navPath: string,
): {
	toc: EpubTocEntry[];
	landmarks: EpubLandmark[];
	pageList: EpubPageTarget[];
} {
	// Nav documents should be XHTML, but some use HTML entities (`&nbsp;`)
	// that break strict XML parsing, so fall back to the forgiving HTML parser.
	const doc =
		parseXml(text, "application/xhtml+xml") ??
		new DOMParser().parseFromString(text, "text/html");
	const navs = elements(doc, NS.xhtml, "nav");
	const navOfType = (type: string) =>
		navs.find((nav) => epubTypes(nav).includes(type));
	const listOf = (nav: Element | undefined) =>
		nav ? childElements(nav, NS.xhtml, "ol")[0] : undefined;

	const toc = readNavList(listOf(navOfType("toc")), navPath);
	const landmarks = flatten(
		readNavList(listOf(navOfType("landmarks")), navPath),
	).map(({ anchor, link }) => ({
		...link,
		type: anchor ? (epubTypes(anchor)[0] ?? "") : "",
	}));
	const pageList = flatten(
		readNavList(listOf(navOfType("page-list")), navPath),
	).map(({ link }) => link);
	return {
		toc: toc.map(({ entry }) => entry),
		landmarks,
		pageList,
	};
}

interface NavNode {
	entry: EpubTocEntry;
	/** The `<a>` the entry came from (null for `<span>` headings). */
	anchor: Element | null;
	children: NavNode[];
}

function readNavList(ol: Element | undefined, navPath: string): NavNode[] {
	if (!ol) return [];
	const nodes: NavNode[] = [];
	for (const li of childElements(ol, NS.xhtml, "li")) {
		const labelEl = Array.from(li.children).find(
			(el) =>
				inNamespace(el, NS.xhtml) &&
				(el.localName === "a" || el.localName === "span"),
		);
		if (!labelEl) continue;
		const anchor = labelEl.localName === "a" ? labelEl : null;
		const children = readNavList(
			childElements(li, NS.xhtml, "ol")[0],
			navPath,
		);
		nodes.push({
			anchor,
			children,
			entry: {
				...link(
					textOf(labelEl) || (labelEl.getAttribute("title") ?? ""),
					anchor?.getAttribute("href") ?? null,
					navPath,
				),
				children: children.map((child) => child.entry),
			},
		});
	}
	return nodes;
}

function flatten(
	nodes: NavNode[],
): { anchor: Element | null; link: EpubLink }[] {
	return nodes.flatMap((node) => {
		const { label, href, path, fragment } = node.entry;
		return [
			{ anchor: node.anchor, link: { label, href, path, fragment } },
			...flatten(node.children),
		];
	});
}

/** Contents and page list from an EPUB 2 NCX. Unreadable NCX → empty. */
function readNcx(
	text: string,
	ncxPath: string,
): { toc: EpubTocEntry[]; pageList: EpubPageTarget[] } {
	const doc = parseXml(text);
	if (!doc) return { toc: [], pageList: [] };

	const labelAndHref = (el: Element) =>
		link(
			textOf(
				childElements(
					childElements(el, NS.ncx, "navLabel")[0],
					NS.ncx,
					"text",
				)[0],
			),
			childElements(el, NS.ncx, "content")[0]?.getAttribute("src") ??
				null,
			ncxPath,
		);
	const readPoints = (parent: Element | undefined): EpubTocEntry[] =>
		childElements(parent, NS.ncx, "navPoint").map((point) => ({
			...labelAndHref(point),
			children: readPoints(point),
		}));

	return {
		toc: readPoints(elements(doc, NS.ncx, "navMap")[0]),
		pageList: elements(doc, NS.ncx, "pageTarget").map(labelAndHref),
	};
}

/** EPUB 2 `<guide>` references, used when there are no nav landmarks. */
function readGuide(opf: Document, packagePath: string): EpubLandmark[] {
	return elements(opf, NS.opf, "reference").map((reference) => ({
		...link(
			reference.getAttribute("title") ?? "",
			reference.getAttribute("href"),
			packagePath,
		),
		type: reference.getAttribute("type") ?? "",
	}));
}

function link(label: string, href: string | null, fromPath: string): EpubLink {
	const resolved = href ? resolveHref(fromPath, href) : null;
	return {
		label,
		href,
		path: resolved?.path ?? null,
		fragment: resolved?.fragment ?? null,
	};
}

/** Parse XML with the platform DOMParser; null when it isn't well-formed. */
function parseXml(
	text: string,
	type: DOMParserSupportedType = "application/xml",
): Document | null {
	const doc = new DOMParser().parseFromString(text, type);
	return doc.getElementsByTagName("parsererror").length > 0 ? null : doc;
}

/**
 * Descendants with this local name in namespace `ns`. Elements with no
 * namespace also match, since some real-world books omit the default
 * `xmlns` on their package or NCX.
 */
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

/**
 * `epub:type` tokens. `getAttributeNS` covers XML documents with any prefix
 * bound to the OPS namespace; the literal name covers HTML-parsed documents.
 */
function epubTypes(el: Element): string[] {
	return tokens(
		el.getAttributeNS(NS.ops, "type") ?? el.getAttribute("epub:type"),
	);
}

function metaProperty(metas: Element[], property: string): string | null {
	const meta = metas.find((el) => el.getAttribute("property") === property);
	return meta ? textOf(meta) || null : null;
}

function textOf(el: Element | undefined): string {
	return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function tokens(value: string | null): string[] {
	return value ? value.trim().split(/\s+/).filter(Boolean) : [];
}

function directoryOf(path: string): string {
	return path.slice(0, path.lastIndexOf("/") + 1);
}

function decodePercent(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}
