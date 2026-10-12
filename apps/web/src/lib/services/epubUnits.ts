import type {
	EpubBook,
	EpubLayout,
	EpubSpineItem,
	EpubTocEntry,
	ParsedEpub,
} from "./epub";

/**
 * Most characters of a unit's text kept in `EpubSplitUnit.text`. Enough to
 * recognise a heading or the start of a paragraph, and short enough that many
 * units fit in an LLM prompt. `textLength` still counts the whole text.
 */
export const LEADING_TEXT_LIMIT = 200;

/**
 * Text patterns (`Chapter 3`, `IV`, `* * *`) are only looked for in units this
 * short, so a paragraph that merely starts with "Part two of the treaty…"
 * isn't mistaken for a title.
 */
const PATTERN_TEXT_LIMIT = 100;

export type EpubSignalKind =
	| "toc-target"
	| "semantic"
	| "spine-start"
	| "heading"
	| "page-break"
	| "text-pattern";

/** Signal kinds from strongest to weakest evidence of a real boundary. */
export const SIGNAL_STRENGTH: readonly EpubSignalKind[] = [
	"toc-target",
	"semantic",
	"spine-start",
	"heading",
	"page-break",
	"text-pattern",
];

/**
 * Evidence that a split before a unit falls on a real boundary.
 *
 * - `toc-target`: a contents entry points here. `depth` is 0 for top-level
 *   entries. An entry without a link (a `<span>` heading such as "Part One")
 *   counts for its first linked descendant, so one unit can carry several.
 * - `semantic`: a structural `epub:type` (chapter, part, appendix, …), the
 *   matching DPUB-ARIA `role` (`doc-chapter` → `chapter`), or a nav landmark /
 *   EPUB 2 guide reference (`type` as the book declares it, e.g. `bodymatter`).
 * - `spine-start`: the first unit of a spine file.
 * - `heading`: the unit is, or starts with, an `h1`–`h3`.
 * - `page-break`: a print page break (`epub:type="pagebreak"`,
 *   `role="doc-pagebreak"` or a page-list target), or a forced page break in
 *   an inline `style` (`break-before: page`, `page-break-before: always`, or
 *   `break-after`/`page-break-after` on the element before). Stylesheet rules
 *   are not read.
 * - `text-pattern`: the unit's text looks like a title (`Chapter 3`,
 *   `Part II`, `第3章`, a bare roman numeral), or the unit follows a scene
 *   break (`<hr>` or a paragraph of only `* * *`-style symbols).
 */
export type EpubBoundarySignal =
	| { kind: "toc-target"; label: string; depth: number }
	| {
			kind: "semantic";
			source: "landmark" | "epub-type" | "role";
			type: string;
	  }
	| { kind: "spine-start" }
	| { kind: "heading"; level: 1 | 2 | 3 }
	| { kind: "page-break"; source: "pagebreak" | "style" }
	| {
			kind: "text-pattern";
			pattern: "chapter" | "part" | "roman-numeral" | "scene-break";
	  };

/**
 * Where a unit's element lives. Resolve it with `resolveUnitAddress` against
 * `parseContentDocument(await archive.readText(address.path))`.
 */
export interface EpubUnitAddress {
	/** Position of the spine item in `book.spine`. */
	spineIndex: number;
	/** Zip path of the spine file (`book.spine[spineIndex].path`). */
	path: string;
	/**
	 * Indexes into `Element.children` (elements only; text and comments are
	 * not counted), starting at `<body>`. `[]` is `<body>` itself, i.e. the
	 * whole file (the document element when there is no body, as in SVG).
	 */
	elementPath: number[];
	/** The element's `id`, used to find it again if the path no longer leads to it. */
	id: string | null;
}

/**
 * A place where a split may go: the split falls immediately before this unit.
 * Plain data (survives `structuredClone` and JSON).
 */
export interface EpubSplitUnit {
	/** Position in reading order across the whole book (0-based). */
	index: number;
	address: EpubUnitAddress;
	/** Lower-case local name, e.g. `p`, `h2`, `div`; `body` for a whole file. */
	tag: string;
	/** 1–6 for `h1`–`h6` (an `hgroup` takes its first heading's level), else null. */
	headingLevel: number | null;
	/**
	 * Leading text, whitespace-collapsed, cut to `LEADING_TEXT_LIMIT`
	 * characters without an ellipsis. Ruby annotations, scripts and page-break
	 * markers are left out. Empty for image-only units.
	 */
	text: string;
	/** Length of the whole whitespace-collapsed text, in UTF-16 code units. */
	textLength: number;
	/** False for units of a `linear="no"` spine item (notes, pop-ups): back matter, not main flow. */
	linear: boolean;
	/** The spine item's layout. Pre-paginated items are always one unit. */
	layout: EpubLayout;
	/** Distinct signals, strongest first (see `SIGNAL_STRENGTH`). */
	signals: EpubBoundarySignal[];
}

const NS = {
	ops: "http://www.idpf.org/2007/ops",
};

/** Block elements that are always one unit; never looked inside. */
const ATOMIC_BLOCKS = new Set([
	"p",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"hgroup",
	"ul",
	"ol",
	"dl",
	"menu",
	"table",
	"pre",
	"blockquote",
	"figure",
	"address",
	"details",
	"hr",
]);

/** Block wrappers: looked inside when they hold blocks, else one unit. */
const CONTAINER_BLOCKS = new Set([
	"body",
	"div",
	"section",
	"article",
	"aside",
	"header",
	"footer",
	"main",
	"nav",
	"center",
	"fieldset",
	"form",
	"search",
]);

/** Embedded content: a unit of its own when it sits directly in a wrapper. */
const REPLACED_ELEMENTS = new Set([
	"img",
	"svg",
	"video",
	"audio",
	"object",
	"embed",
	"iframe",
	"canvas",
	"picture",
	"math",
]);

/** Never text, never units. `rt`/`rp` are ruby readings, not the text itself. */
const IGNORED_ELEMENTS = new Set([
	"script",
	"style",
	"template",
	"noscript",
	"rt",
	"rp",
]);

/** Elements whose text is kept apart from its neighbours' by a space. */
const SPACED_ELEMENTS = new Set([
	...ATOMIC_BLOCKS,
	...CONTAINER_BLOCKS,
	...REPLACED_ELEMENTS,
	"li",
	"dt",
	"dd",
	"tr",
	"td",
	"th",
	"caption",
	"figcaption",
	"summary",
	"legend",
	"br",
]);

/** `epub:type` values (and `doc-*` roles) that mark a structural division. */
const DIVISION_TYPES = new Set([
	"part",
	"chapter",
	"appendix",
	"volume",
	"division",
	"prologue",
	"epilogue",
	"preface",
	"foreword",
	"introduction",
	"afterword",
	"conclusion",
	"frontmatter",
	"bodymatter",
	"backmatter",
	"cover",
	"titlepage",
	"halftitlepage",
	"toc",
	"dedication",
	"acknowledgments",
	"bibliography",
	"glossary",
	"index",
	"colophon",
	"copyright-page",
	"endnotes",
]);

const NUMBER = String.raw`(?:\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last)\b`;
const KANJI_NUMBER = "[0-9０-９一二三四五六七八九十百千〇零]+";
const CHAPTER_PATTERN = new RegExp(
	String.raw`^(?:(?:chapter\s+|chap\.\s*|ch\.\s*)${NUMBER}|第\s*${KANJI_NUMBER}\s*[章話])`,
	"i",
);
const PART_PATTERN = new RegExp(
	String.raw`^(?:(?:part\s+|book\s+|volume\s+|vol\.\s*)${NUMBER}|第\s*${KANJI_NUMBER}\s*[部編巻])`,
	"i",
);
/** A whole text that is one upper-case roman numeral, e.g. `IV` or `XII.`. */
const ROMAN_PATTERN =
	/^(?=[MDCLXVI])M{0,3}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})\.?$/;
/** A whole text of ornament symbols, e.g. `* * *`, `#`, `⁂`. */
const SCENE_BREAK_PATTERN = /^[*#~•·∙⁂❦❧☙§†‡◆◇○●♦❖✦✧✶=_\-–—\s]+$/;

const BREAK_BEFORE_PATTERN =
	/(?:^|;)\s*(?:page-break-before|break-before)\s*:\s*(?:always|page|left|right|recto|verso)\b/i;
const BREAK_AFTER_PATTERN =
	/(?:^|;)\s*(?:page-break-after|break-after)\s*:\s*(?:always|page|left|right|recto|verso)\b/i;

/** A contents/landmark/page-list link into a spine file, with its signal. */
interface Target {
	fragment: string | null;
	signal: EpubBoundarySignal;
}

/**
 * List every place in reading order where an EPUB may be split, with the
 * evidence that each one is a real boundary.
 *
 * A unit is a block-level element of a spine file, chosen so that a person
 * can sensibly put a split marker before it:
 *
 * - Atomic blocks (`p`, `h1`–`h6`, `hgroup`, lists, `table`, `pre`,
 *   `blockquote`, `figure`, `address`, `details`) are one unit each; a split
 *   never goes inside them.
 * - Wrappers (`body`, `div`, `section`, `article`, `aside`, `header`,
 *   `footer`, `main`, `nav`, …) are containers when every child with content
 *   is a block: they aren't units, their children are. A wrapper that also
 *   holds inline content (text, `<span>`s) next to its blocks, or holds no
 *   blocks at all, is one unit.
 * - Embedded content (`img`, `svg`, `video`, …) directly inside a container
 *   is a unit. Inline elements (`span`, `a`, `em`, …) never are.
 * - Blocks with no text and no embedded content (`<p></p>`, `<hr>`, empty
 *   page-break markers, spacer divs) are not units.
 * - A file with no units, and every pre-paginated (fixed-layout) spine item,
 *   is a single unit for its whole `<body>` (`elementPath: []`), so every
 *   spine file contributes at least one unit and its start can be split.
 *
 * Non-linear spine items keep their units, marked `linear: false`.
 *
 * Signals found on an element that isn't a unit are moved to the unit where a
 * split would honour them: a container's signals go to its first unit; an
 * inline target at the very start of a unit goes to that unit, one after text
 * in a unit goes to the next unit; a "break after" or scene break goes to the
 * next unit. A contents link whose `#fragment` matches no element is dropped.
 *
 * @throws EpubError (`missing-resource`) when a spine file isn't in the zip.
 */
export async function extractSplitUnits({
	book,
	archive,
}: ParsedEpub): Promise<EpubSplitUnit[]> {
	const targets = collectTargets(book);
	const units: EpubSplitUnit[] = [];
	for (const item of book.spine) {
		const doc = parseContentDocument(await archive.readText(item.path));
		for (const unit of readSpineItem(
			doc,
			item,
			targets.get(item.path) ?? [],
		)) {
			units.push({ index: units.length, ...unit });
		}
	}
	return units;
}

/**
 * Parse a spine file the way `extractSplitUnits` does: as XHTML, falling back
 * to the HTML parser when it isn't well-formed XML (e.g. it uses `&nbsp;`).
 * Unit addresses are only valid against a document parsed by this function.
 */
export function parseContentDocument(text: string): Document {
	const xml = new DOMParser().parseFromString(text, "application/xhtml+xml");
	return xml.getElementsByTagName("parsererror").length === 0
		? xml
		: new DOMParser().parseFromString(text, "text/html");
}

/**
 * Find a unit's element in a document from `parseContentDocument`: follow
 * `elementPath` through `children` from `<body>`. If that leads nowhere, or
 * to an element whose `id` differs from `address.id`, fall back to the
 * element with that `id`.
 *
 * @returns null when neither the path nor the id finds the element.
 */
export function resolveUnitAddress(
	doc: Document,
	address: Pick<EpubUnitAddress, "elementPath" | "id">,
): Element | null {
	let el: Element | null = contentRoot(doc);
	for (const index of address.elementPath) {
		el = el ? (el.children.item(index) ?? null) : null;
	}
	if (el && (address.id === null || el.getAttribute("id") === address.id)) {
		return el;
	}
	if (address.id === null) return null;
	return (
		Array.from(doc.getElementsByTagName("*")).find(
			(candidate) => candidate.getAttribute("id") === address.id,
		) ?? null
	);
}

/** Contents entries, landmarks and page-list entries, grouped by zip path. */
function collectTargets(book: EpubBook): Map<string, Target[]> {
	const byPath = new Map<string, Target[]>();
	const add = (
		path: string | null,
		fragment: string | null,
		signal: EpubBoundarySignal,
	) => {
		if (path === null) return;
		const list = byPath.get(path) ?? [];
		list.push({ fragment, signal });
		byPath.set(path, list);
	};

	const visit = (entries: EpubTocEntry[], depth: number) => {
		for (const entry of entries) {
			const target =
				entry.href === null ? firstLinked(entry.children) : entry;
			if (target) {
				add(target.path, target.fragment, {
					kind: "toc-target",
					label: entry.label,
					depth,
				});
			}
			visit(entry.children, depth + 1);
		}
	};
	visit(book.toc, 0);

	for (const landmark of book.landmarks) {
		add(landmark.path, landmark.fragment, {
			kind: "semantic",
			source: "landmark",
			type: landmark.type,
		});
	}
	for (const pageTarget of book.pageList) {
		add(pageTarget.path, pageTarget.fragment, {
			kind: "page-break",
			source: "pagebreak",
		});
	}
	return byPath;
}

/** The first entry, depth-first, that links into the zip. */
function firstLinked(entries: EpubTocEntry[]): EpubTocEntry | null {
	for (const entry of entries) {
		if (entry.path !== null) return entry;
		const found = firstLinked(entry.children);
		if (found) return found;
	}
	return null;
}

/** Units of one spine file, without their book-wide `index`. */
function readSpineItem(
	doc: Document,
	item: EpubSpineItem,
	targets: Target[],
): Omit<EpubSplitUnit, "index">[] {
	const root = contentRoot(doc);
	const whole = item.layout === "pre-paginated";
	const found: Element[] = [];
	if (!whole && holdsBlocks(root)) collectUnits(root, found);
	const unitEls = found.length > 0 ? found : [root];

	const position = new Map(unitEls.map((el, i) => [el, i]));
	const signals: EpubBoundarySignal[][] = unitEls.map(() => []);
	const add = (i: number | null, signal: EpubBoundarySignal) => {
		if (i !== null && i < unitEls.length) signals[i].push(signal);
	};
	/** First unit after the start of `el`, optionally counting ones inside it. */
	const firstFollowing = (el: Element, inside: boolean): number | null => {
		const i = unitEls.findIndex((unit) => {
			const pos = el.compareDocumentPosition(unit);
			return (
				(pos & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 &&
				(inside || (pos & Node.DOCUMENT_POSITION_CONTAINED_BY) === 0)
			);
		});
		return i >= 0 ? i : null;
	};
	/** The unit a boundary at the start of `el` falls on. */
	const unitAt = (el: Element): number | null => {
		if (whole) return 0;
		for (let node: Element | null = el; node; node = node.parentElement) {
			const i = position.get(node);
			if (i !== undefined) {
				return node === el || !hasTextBefore(node, el) ? i : i + 1;
			}
		}
		return firstFollowing(el, true);
	};
	/** The unit a boundary at the end of `el` falls on. */
	const unitAfter = (el: Element): number | null =>
		whole ? null : firstFollowing(el, false);

	add(0, { kind: "spine-start" });

	const all = [
		...(doc.documentElement === root ? [] : [doc.documentElement]),
		root,
		...Array.from(root.getElementsByTagName("*")),
	];
	const byId = new Map<string, Element>();
	for (const el of all) {
		const id =
			el.getAttribute("id") ??
			(localName(el) === "a" ? el.getAttribute("name") : null);
		if (id && !byId.has(id)) byId.set(id, el);
	}
	for (const { fragment, signal } of targets) {
		const el = fragment === null ? root : byId.get(fragment);
		if (el) add(unitAt(el), signal);
	}

	for (const el of all) {
		const name = localName(el);
		if (blockKind(el) !== null || el === doc.documentElement) {
			for (const type of epubTypes(el)) {
				if (DIVISION_TYPES.has(type)) {
					add(unitAt(el), {
						kind: "semantic",
						source: "epub-type",
						type,
					});
				}
			}
			for (const role of tokens(el.getAttribute("role"))) {
				const type = role.replace(/^doc-/, "");
				if (role.startsWith("doc-") && DIVISION_TYPES.has(type)) {
					add(unitAt(el), { kind: "semantic", source: "role", type });
				}
			}
		}
		if (name === "h1" || name === "h2" || name === "h3") {
			add(unitAt(el), {
				kind: "heading",
				level: Number(name[1]) as 1 | 2 | 3,
			});
		}
		if (isPageBreakMarker(el)) {
			add(unitAt(el), { kind: "page-break", source: "pagebreak" });
		}
		if (name === "hr") {
			add(unitAfter(el), {
				kind: "text-pattern",
				pattern: "scene-break",
			});
		}
		const style = el.getAttribute("style");
		if (style && BREAK_BEFORE_PATTERN.test(style)) {
			add(unitAt(el), { kind: "page-break", source: "style" });
		}
		if (style && BREAK_AFTER_PATTERN.test(style)) {
			add(unitAfter(el), { kind: "page-break", source: "style" });
		}
	}

	const texts = unitEls.map(textOf);
	texts.forEach((text, i) => {
		const pattern = titlePattern(text);
		if (pattern === "scene-break")
			add(i + 1, { kind: "text-pattern", pattern });
		else if (pattern) add(i, { kind: "text-pattern", pattern });
	});

	return unitEls.map((el, i) => ({
		address: {
			spineIndex: item.index,
			path: item.path,
			elementPath: elementPath(root, el),
			id: el.getAttribute("id") || null,
		},
		tag: localName(el),
		headingLevel: headingLevel(el),
		text: leadingText(texts[i]),
		textLength: texts[i].length,
		linear: item.linear,
		layout: item.layout,
		signals: rank(signals[i]),
	}));
}

/** Add `el`'s units to `out` in document order. `el` holds blocks. */
function collectUnits(el: Element, out: Element[]): void {
	for (const child of Array.from(el.children)) {
		const kind = blockKind(child);
		if (kind === null) continue;
		if (kind === "container" && holdsBlocks(child))
			collectUnits(child, out);
		else if (hasContent(child)) out.push(child);
	}
}

function blockKind(el: Element): "atomic" | "container" | "replaced" | null {
	if (isPageBreakMarker(el)) return null;
	const name = localName(el);
	if (ATOMIC_BLOCKS.has(name)) return "atomic";
	if (CONTAINER_BLOCKS.has(name)) return "container";
	if (REPLACED_ELEMENTS.has(name)) return "replaced";
	return null;
}

/**
 * True for a wrapper whose content is all blocks: at least one block child,
 * and no text or inline element with content beside them.
 */
function holdsBlocks(el: Element): boolean {
	if (!CONTAINER_BLOCKS.has(localName(el))) return false;
	let blocks = false;
	for (const child of Array.from(el.childNodes)) {
		if (isText(child)) {
			if (child.nodeValue?.trim()) return false;
		} else if (child instanceof Element) {
			if (blockKind(child) !== null) blocks = true;
			else if (!isIgnored(child) && hasContent(child)) return false;
		}
	}
	return blocks;
}

function hasContent(el: Element): boolean {
	if (REPLACED_ELEMENTS.has(localName(el)) || textOf(el) !== "") return true;
	return Array.from(el.getElementsByTagName("*")).some((child) =>
		REPLACED_ELEMENTS.has(localName(child)),
	);
}

/** Whether `unit` has non-blank text before `el` (a descendant of it). */
function hasTextBefore(unit: Element, el: Element): boolean {
	const walker = unit.ownerDocument.createTreeWalker(
		unit,
		NodeFilter.SHOW_TEXT,
	);
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		const pos = el.compareDocumentPosition(node);
		if ((pos & Node.DOCUMENT_POSITION_PRECEDING) === 0) return false;
		if (node.nodeValue?.trim()) return true;
	}
	return false;
}

/** Whitespace-collapsed text, with blocks kept apart by spaces. */
function textOf(el: Element): string {
	const parts: string[] = [];
	const walk = (node: Node) => {
		for (const child of Array.from(node.childNodes)) {
			if (isText(child)) {
				parts.push(child.nodeValue ?? "");
			} else if (child instanceof Element && !isIgnored(child)) {
				const spaced = SPACED_ELEMENTS.has(localName(child));
				if (spaced) parts.push(" ");
				walk(child);
				if (spaced) parts.push(" ");
			}
		}
	};
	walk(el);
	return parts.join("").replace(/\s+/g, " ").trim();
}

function titlePattern(
	text: string,
): Extract<EpubBoundarySignal, { kind: "text-pattern" }>["pattern"] | null {
	if (text === "" || text.length > PATTERN_TEXT_LIMIT) return null;
	if (CHAPTER_PATTERN.test(text)) return "chapter";
	if (PART_PATTERN.test(text)) return "part";
	if (ROMAN_PATTERN.test(text)) return "roman-numeral";
	if (SCENE_BREAK_PATTERN.test(text)) return "scene-break";
	return null;
}

/** Drop duplicate signals and order them strongest first (stable). */
function rank(signals: EpubBoundarySignal[]): EpubBoundarySignal[] {
	const seen = new Set<string>();
	return signals
		.filter((signal) => {
			const key = JSON.stringify(signal);
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		})
		.sort(
			(a, b) =>
				SIGNAL_STRENGTH.indexOf(a.kind) -
				SIGNAL_STRENGTH.indexOf(b.kind),
		);
}

function leadingText(text: string): string {
	if (text.length <= LEADING_TEXT_LIMIT) return text;
	let cut = text.slice(0, LEADING_TEXT_LIMIT);
	// Don't leave half of a surrogate pair (an emoji, a rare kanji) behind.
	if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1);
	return cut.trimEnd();
}

function headingLevel(el: Element): number | null {
	const match = /^h([1-6])$/.exec(localName(el));
	if (match) return Number(match[1]);
	if (localName(el) !== "hgroup") return null;
	for (const child of Array.from(el.children)) {
		const level = headingLevel(child);
		if (level !== null) return level;
	}
	return null;
}

/** `children` indexes from `root` down to `el`. */
function elementPath(root: Element, el: Element): number[] {
	const path: number[] = [];
	for (
		let node = el, parent = node.parentElement;
		node !== root && parent;
		node = parent, parent = node.parentElement
	) {
		path.unshift(Array.from(parent.children).indexOf(node));
	}
	return path;
}

/** `<body>`, or the document element when there is none (e.g. an SVG spine item). */
function contentRoot(doc: Document): Element {
	const root = doc.documentElement;
	return (
		Array.from(root.children).find((el) => localName(el) === "body") ?? root
	);
}

function isPageBreakMarker(el: Element): boolean {
	return (
		epubTypes(el).includes("pagebreak") ||
		tokens(el.getAttribute("role")).includes("doc-pagebreak")
	);
}

function isIgnored(el: Element): boolean {
	return IGNORED_ELEMENTS.has(localName(el)) || isPageBreakMarker(el);
}

function isText(node: Node): boolean {
	return (
		node.nodeType === Node.TEXT_NODE ||
		node.nodeType === Node.CDATA_SECTION_NODE
	);
}

function localName(el: Element): string {
	return el.localName.toLowerCase();
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

function tokens(value: string | null): string[] {
	return value ? value.trim().split(/\s+/).filter(Boolean) : [];
}
