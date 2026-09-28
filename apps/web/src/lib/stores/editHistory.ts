// Snapshot (memento) undo/redo history for Edit Mode (KDA-56).
//
// Callers `record` a snapshot of the state *before* each mutating action;
// `undo`/`redo` take the current state and return the one to restore.
// Snapshots are stored as-is, so callers must pass copies, not live state.
// Plain TS (no runes): nothing renders history state, and it keeps the store
// unit-testable without the Svelte compiler.
export function createEditHistory<T>() {
	let past: T[] = [];
	let future: T[] = [];

	return {
		get canUndo() {
			return past.length > 0;
		},
		get canRedo() {
			return future.length > 0;
		},
		// Push first, then invalidate the redo branch.
		record(snapshot: T) {
			past.push(snapshot);
			future = [];
		},
		undo(current: T): T | null {
			const prev = past.pop();
			if (prev === undefined) return null;
			future.push(current);
			return prev;
		},
		redo(current: T): T | null {
			const next = future.pop();
			if (next === undefined) return null;
			past.push(current);
			return next;
		},
		clear() {
			past = [];
			future = [];
		},
	};
}
