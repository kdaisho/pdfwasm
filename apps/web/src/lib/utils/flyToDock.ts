// Animate a clone of `source` onto `target`, shrinking into place — the picker's
// "the cover you clicked flies up to the Now-viewing dock" motion. The clone is
// appended to <body> (not the page subtree) so it survives the /library → viewer
// route change that happens mid-flight. Honors prefers-reduced-motion.
export function flyToDock(source: HTMLElement, target: HTMLElement): void {
	if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

	const s = source.getBoundingClientRect();
	const t = target.getBoundingClientRect();
	if (s.width === 0 || t.width === 0) return;

	const clone = source.cloneNode(true) as HTMLElement;
	Object.assign(clone.style, {
		position: "fixed",
		left: `${s.left}px`,
		top: `${s.top}px`,
		width: `${s.width}px`,
		height: `${s.height}px`,
		margin: "0",
		zIndex: "1000",
		transformOrigin: "top left",
		pointerEvents: "none",
		willChange: "transform",
		transition:
			"transform 0.58s cubic-bezier(0.5,0.05,0.2,1), box-shadow 0.58s ease",
		// Elevation shadows for the in-flight card — functional animation values,
		// not theme surfaces.
		boxShadow: "0 12px 40px rgba(0,0,0,0.28)",
	});
	document.body.appendChild(clone);

	// Hide the real dock cover until the clone lands on top of it.
	const previousVisibility = target.style.visibility;
	target.style.visibility = "hidden";

	const dx = t.left - s.left;
	const dy = t.top - s.top;
	const scale = t.width / s.width;

	// Force a reflow so the browser registers the start state before we change
	// transform — otherwise the transition never runs.
	void clone.offsetWidth;
	clone.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
	clone.style.boxShadow = "0 1px 4px rgba(0,0,0,0.18)";

	let settled = false;
	const settle = () => {
		if (settled) return;
		settled = true;
		target.style.visibility = previousVisibility;
		clone.remove();
	};

	clone.addEventListener("transitionend", (e) => {
		if (e.propertyName === "transform") settle();
	});
	// Safety net in case transitionend doesn't fire.
	setTimeout(settle, 700);
}
