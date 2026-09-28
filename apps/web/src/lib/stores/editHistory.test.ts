import { describe, expect, it } from "vitest";
import { createEditHistory } from "./editHistory";

describe("createEditHistory", () => {
	it("starts empty", () => {
		const h = createEditHistory<number>();
		expect(h.canUndo).toBe(false);
		expect(h.canRedo).toBe(false);
		expect(h.undo(0)).toBeNull();
		expect(h.redo(0)).toBeNull();
	});

	it("undo returns the recorded snapshot and redo returns the undone state", () => {
		const h = createEditHistory<number>();
		h.record(0); // before 0 → 1
		h.record(1); // before 1 → 2

		expect(h.undo(2)).toBe(1);
		expect(h.undo(1)).toBe(0);
		expect(h.undo(0)).toBeNull();

		expect(h.redo(0)).toBe(1);
		expect(h.redo(1)).toBe(2);
		expect(h.redo(2)).toBeNull();
	});

	it("recording a new action invalidates the redo branch", () => {
		const h = createEditHistory<number>();
		h.record(0); // 0 → 1
		expect(h.undo(1)).toBe(0);
		expect(h.canRedo).toBe(true);

		h.record(0); // 0 → 5
		expect(h.canRedo).toBe(false);
		expect(h.redo(5)).toBeNull();
		expect(h.undo(5)).toBe(0);
	});

	it("clear drops both stacks", () => {
		const h = createEditHistory<number>();
		h.record(0);
		h.record(1);
		h.undo(2);
		h.clear();
		expect(h.canUndo).toBe(false);
		expect(h.canRedo).toBe(false);
	});
});
