import { describe, expect, it } from "vitest";
import { toRenderSpace, type PageBox } from "./charBoxes";

// MediaBox [0 0 612 792] trimmed by CropBox [54 63 558 729] — the shape that
// broke highlighting on print-ready book PDFs. Rendered size is 504×666 at
// /Rotate 0 or 180, and 666×504 at /Rotate 90 or 270.
const CROPPED: PageBox = { left: 54, top: 729, right: 558, bottom: 63 };
const box = { char: "K", left: 100, right: 120, bottom: 700, top: 715 };

// Expected values below were cross-checked against PDFium's own
// FPDF_PageToDevice for each rotation on a PDF with exactly this crop box.
describe("toRenderSpace", () => {
	it("is the identity when the crop box matches the media box", () => {
		const full: PageBox = { left: 0, top: 792, right: 612, bottom: 0 };
		expect(toRenderSpace(box, full, 0)).toEqual(box);
	});

	it("subtracts the crop origin on an unrotated page", () => {
		expect(toRenderSpace(box, CROPPED, 0)).toEqual({
			char: "K",
			left: 46,
			right: 66,
			bottom: 637,
			top: 652,
		});
	});

	it("maps a 90° rotated page", () => {
		expect(toRenderSpace(box, CROPPED, 1)).toEqual({
			char: "K",
			left: 637,
			right: 652,
			bottom: 438,
			top: 458,
		});
	});

	it("maps a 180° rotated page", () => {
		expect(toRenderSpace(box, CROPPED, 2)).toEqual({
			char: "K",
			left: 438,
			right: 458,
			bottom: 14,
			top: 29,
		});
	});

	it("maps a 270° rotated page", () => {
		expect(toRenderSpace(box, CROPPED, 3)).toEqual({
			char: "K",
			left: 14,
			right: 29,
			bottom: 46,
			top: 66,
		});
	});

	it("keeps every box inside the rendered page", () => {
		const renderSizes = [
			[504, 666],
			[666, 504],
			[504, 666],
			[666, 504],
		];
		for (let rotation = 0; rotation < 4; rotation++) {
			const r = toRenderSpace(box, CROPPED, rotation);
			const [w, h] = renderSizes[rotation];
			expect(r.left).toBeGreaterThanOrEqual(0);
			expect(r.bottom).toBeGreaterThanOrEqual(0);
			expect(r.right).toBeLessThanOrEqual(w);
			expect(r.top).toBeLessThanOrEqual(h);
			expect(r.right).toBeGreaterThan(r.left);
			expect(r.top).toBeGreaterThan(r.bottom);
		}
	});
});
