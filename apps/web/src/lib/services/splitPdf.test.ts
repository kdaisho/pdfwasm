import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
	computeSegmentPositions,
	splitPdf,
	type SequenceEntry,
} from "./splitPdf";

/**
 * Encode raw RGBA pixels into a valid PNG (no external image deps). Uses an
 * incompressible random-noise payload so the embedded image stays large after
 * pdf-lib's object-stream compression — that's what makes resource duplication
 * across pages measurable.
 */
function makeNoisePng(width: number, height: number): Uint8Array {
	const crcTable = (() => {
		const t = new Uint32Array(256);
		for (let n = 0; n < 256; n++) {
			let c = n;
			for (let k = 0; k < 8; k++)
				c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
			t[n] = c >>> 0;
		}
		return t;
	})();
	const crc32 = (buf: Uint8Array) => {
		let c = 0xffffffff;
		for (let i = 0; i < buf.length; i++)
			c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
		return (c ^ 0xffffffff) >>> 0;
	};

	// Filter byte (0) + 4 bytes/pixel per row, filled with deterministic noise.
	const raw = new Uint8Array(height * (1 + width * 4));
	let seed = 1234567;
	const rand = () => {
		seed = (seed * 1103515245 + 12345) & 0x7fffffff;
		return seed & 0xff;
	};
	let p = 0;
	for (let y = 0; y < height; y++) {
		raw[p++] = 0;
		for (let x = 0; x < width * 4; x++) raw[p++] = rand();
	}
	const idatData = deflateSync(raw);

	const chunk = (type: string, data: Uint8Array) => {
		const typeBytes = new TextEncoder().encode(type);
		const body = new Uint8Array(typeBytes.length + data.length);
		body.set(typeBytes, 0);
		body.set(data, typeBytes.length);
		const out = new Uint8Array(4 + body.length + 4);
		const dv = new DataView(out.buffer);
		dv.setUint32(0, data.length);
		out.set(body, 4);
		dv.setUint32(4 + body.length, crc32(body));
		return out;
	};

	const ihdr = new Uint8Array(13);
	const dv = new DataView(ihdr.buffer);
	dv.setUint32(0, width);
	dv.setUint32(4, height);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 6; // color type RGBA
	// ihdr[10..12] = 0 (deflate, no filter, no interlace)

	const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
	const parts = [
		sig,
		chunk("IHDR", ihdr),
		chunk("IDAT", idatData),
		chunk("IEND", new Uint8Array(0)),
	];
	const total = parts.reduce((n, a) => n + a.length, 0);
	const png = new Uint8Array(total);
	let off = 0;
	for (const part of parts) {
		png.set(part, off);
		off += part.length;
	}
	return png;
}

/** Build a source PDF whose every page draws the SAME embedded image. */
async function makeSourceWithSharedImage(
	pageCount: number,
): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	const png = await doc.embedPng(makeNoisePng(160, 160));
	for (let i = 0; i < pageCount; i++) {
		const page = doc.addPage([200, 200]);
		page.drawImage(png, { x: 0, y: 0, width: 200, height: 200 });
	}
	return doc.save();
}

const seq = (sourceId: string, n: number): SequenceEntry[] =>
	Array.from({ length: n }, (_, i) => ({ sourceId, pageIndex: i }));

describe("splitPdf", () => {
	it("does not bloat output past the source (shared resources are deduplicated)", async () => {
		const PAGES = 8;
		const source = await makeSourceWithSharedImage(PAGES);

		const segments = await splitPdf({
			sources: new Map([["src", source]]),
			sequence: seq("src", PAGES),
			splitPoints: [3], // → parts of 4 pages and 4 pages
		});

		expect(segments).toHaveLength(2);
		// Each part shares one image; before the fix it embedded the image once
		// per page, blowing each part well past the single-image source.
		for (const part of segments) {
			expect(part.byteLength).toBeLessThanOrEqual(source.byteLength);
		}
	});

	it("preserves page order and count across a split", async () => {
		const source = await makeSourceWithSharedImage(5);
		const segments = await splitPdf({
			sources: new Map([["src", source]]),
			sequence: seq("src", 5),
			splitPoints: [1], // parts of [0,1] and [2,3,4]
		});

		const counts = await Promise.all(
			segments.map(async (s) =>
				(await PDFDocument.load(s)).getPageCount(),
			),
		);
		expect(counts).toEqual([2, 3]);
	});
});

describe("computeSegmentPositions", () => {
	it("splits after each split point and drops excluded positions", () => {
		expect(computeSegmentPositions(6, [2])).toEqual([
			[0, 1, 2],
			[3, 4, 5],
		]);
		expect(computeSegmentPositions(6, [2], [1, 4])).toEqual([
			[0, 2],
			[3, 5],
		]);
	});

	it("drops segments that become empty after exclusion", () => {
		expect(computeSegmentPositions(4, [1], [0, 1])).toEqual([[2, 3]]);
	});
});
