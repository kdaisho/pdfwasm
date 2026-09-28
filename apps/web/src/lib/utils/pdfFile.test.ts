import { describe, expect, it } from "vitest";
import { MAX_FILE_SIZE } from "@pdfwasm/shared/constants";
import { createDragDepth, hasExternalFiles, pickPdf } from "./pdfFile";

function pdf(name = "doc.pdf", size = 10) {
	return new File([new Uint8Array(size)], name, { type: "application/pdf" });
}

describe("pickPdf", () => {
	it("accepts a single PDF", () => {
		const file = pdf();
		expect(pickPdf([file])).toEqual({ ok: true, file, ignored: 0 });
	});

	it("recognizes a PDF by extension when the browser reports no MIME type", () => {
		const file = new File(["x"], "Scan.PDF", { type: "" });
		expect(pickPdf([file])).toEqual({ ok: true, file, ignored: 0 });
	});

	it("rejects a non-PDF file", () => {
		const result = pickPdf([
			new File(["x"], "notes.txt", { type: "text/plain" }),
		]);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toMatch(/notes\.txt.*isn't a PDF/);
	});

	it("rejects an empty drop", () => {
		expect(pickPdf([]).ok).toBe(false);
	});

	it("accepts a PDF at exactly the size limit", () => {
		expect(pickPdf([pdf("max.pdf", MAX_FILE_SIZE)]).ok).toBe(true);
	});

	it("rejects a PDF over the size limit", () => {
		const result = pickPdf([pdf("big.pdf", MAX_FILE_SIZE + 1)]);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toMatch(/big\.pdf.*10 MB/);
	});

	it("opens the first PDF and counts every other file as ignored", () => {
		const first = pdf("first.pdf");
		const result = pickPdf([
			new File(["x"], "photo.png", { type: "image/png" }),
			first,
			pdf("second.pdf"),
		]);
		expect(result).toEqual({ ok: true, file: first, ignored: 2 });
	});
});

describe("hasExternalFiles", () => {
	const dt = (types: string[]) => ({ types }) as unknown as DataTransfer;

	it("is true for drags from the OS that carry files", () => {
		expect(hasExternalFiles(dt(["Files"]))).toBe(true);
	});

	it("is false for in-app drags such as text selections", () => {
		expect(hasExternalFiles(dt(["text/plain", "text/html"]))).toBe(false);
	});

	it("is false without a dataTransfer", () => {
		expect(hasExternalFiles(null)).toBe(false);
	});
});

describe("createDragDepth", () => {
	it("stays active while the cursor moves between nested elements", () => {
		const depth = createDragDepth();
		expect(depth.enter()).toBe(true); // window → main
		// Entering a child fires before leaving its parent.
		expect(depth.enter()).toBe(true); // main → child
		expect(depth.leave()).toBe(true); // leave main
		expect(depth.leave()).toBe(false); // leave child → out of window
	});

	it("never goes negative on a stray dragleave", () => {
		const depth = createDragDepth();
		expect(depth.leave()).toBe(false);
		expect(depth.enter()).toBe(true);
		expect(depth.leave()).toBe(false);
	});

	it("reset clears the depth after a drop", () => {
		const depth = createDragDepth();
		depth.enter();
		depth.enter();
		depth.reset();
		expect(depth.leave()).toBe(false);
	});
});
