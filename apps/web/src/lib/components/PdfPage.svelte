<script lang="ts">
	import type { PDFiumDocument } from "@hyzyla/pdfium";
	import { extractCharBoxes, RENDER_SCALE } from "$lib/services/charBoxes";
	import type { PageData, SearchMatch } from "$lib/types";

	interface Props {
		page: PageData;
		matches: SearchMatch[];
		activeCharIndex: number;
		doc: PDFiumDocument;
	}

	let { page, matches, activeCharIndex, doc }: Props = $props();

	let renderCanvas: HTMLCanvasElement = $state(undefined!);
	let overlayCanvas: HTMLCanvasElement = $state(undefined!);
	let rendering = $state(false);
	let localImageData: ImageData | null = $state(null);
	let lastRendered: PageData | null = $state(null);
	// Bumped when the bitmap is released so an in-flight render drops its result.
	let bitmapGeneration = 0;

	// A page must stay near the viewport this long before rendering starts, so
	// pages merely swept past during a long scroll don't queue PDFium renders
	// (single-threaded, and not cancellable once started) ahead of the target.
	const RENDER_DELAY_MS = 100;
	// Bitmaps are ~width×height×4 bytes each; drop them once the page is this
	// far outside the scroll viewport so long documents don't hoard memory.
	const RELEASE_MARGIN = "3000px";

	function pdfToCanvas(
		left: number,
		right: number,
		bottom: number,
		top: number,
		pageHeightPt: number,
		scale: number,
	) {
		return {
			x: left * scale,
			y: (pageHeightPt - top) * scale,
			w: (right - left) * scale,
			h: (top - bottom) * scale,
		};
	}

	async function renderPage() {
		if (rendering || lastRendered === page) return;
		const target = page;
		const generation = bitmapGeneration;
		rendering = true;
		try {
			const pdfPage = doc.getPage(target.index);
			// Extract chars if not yet populated (visible pages get priority)
			if (target.chars.length === 0) {
				target.chars = extractCharBoxes(pdfPage);
			}
			const rendered = await pdfPage.render({
				scale: RENDER_SCALE,
				render: "bitmap",
			});
			if (page !== target) return; // superseded by a prop change mid-render
			if (generation !== bitmapGeneration) return; // released mid-render
			localImageData = new ImageData(
				new Uint8ClampedArray(rendered.data.buffer as ArrayBuffer),
				rendered.width,
				rendered.height,
			);
			lastRendered = target;
		} finally {
			rendering = false;
		}
	}

	// Re-render when `page` prop changes (e.g. after insert reuses the DOM node).
	// First render is still driven by the IntersectionObserver in `observe`.
	$effect(() => {
		page;
		if (lastRendered && lastRendered !== page) {
			void renderPage();
		}
	});

	function releaseBitmap() {
		if (!localImageData && !rendering) return;
		bitmapGeneration++;
		localImageData = null;
		lastRendered = null;
	}

	function observe(node: HTMLDivElement) {
		// The app scrolls inside <main>, not the window; rootMargin only
		// extends the root, so observe against the real scroll container.
		const root = node.closest("main");
		let renderTimer: ReturnType<typeof setTimeout> | undefined;
		const nearObserver = new IntersectionObserver(
			(entries) => {
				clearTimeout(renderTimer);
				if (entries[0]?.isIntersecting) {
					renderTimer = setTimeout(
						() => void renderPage(),
						RENDER_DELAY_MS,
					);
				}
			},
			{ root, rootMargin: "200px" },
		);
		const farObserver = new IntersectionObserver(
			(entries) => {
				if (entries[0] && !entries[0].isIntersecting) releaseBitmap();
			},
			{ root, rootMargin: RELEASE_MARGIN },
		);
		nearObserver.observe(node);
		farObserver.observe(node);
		return {
			destroy() {
				clearTimeout(renderTimer);
				nearObserver.disconnect();
				farObserver.disconnect();
			},
		};
	}

	// Paint rendered bitmap
	$effect(() => {
		if (!renderCanvas || !localImageData) return;
		const ctx = renderCanvas.getContext("2d");
		if (!ctx) return;
		renderCanvas.width = page.width;
		renderCanvas.height = page.height;
		ctx.putImageData(localImageData, 0, 0);
	});

	// Draw search highlights
	$effect(() => {
		if (!overlayCanvas) return;
		const ctx = overlayCanvas.getContext("2d");
		if (!ctx) return;
		overlayCanvas.width = page.width;
		overlayCanvas.height = page.height;
		ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

		if (matches.length === 0) return;

		function drawMatch(match: SearchMatch, color: string) {
			ctx!.fillStyle = color;

			// Collect all valid chars in the match
			const chars: {
				left: number;
				right: number;
				bottom: number;
				top: number;
			}[] = [];
			for (
				let i = match.charIndex;
				i < match.charIndex + match.charCount;
				i++
			) {
				const c = page.chars[i];
				if (c) chars.push(c);
			}
			if (chars.length === 0) return;

			// Group characters into lines: a new line starts when top diverges
			// by more than half the previous char's height
			const lines: (typeof chars)[] = [[chars[0]]];
			for (let i = 1; i < chars.length; i++) {
				const prev = chars[i - 1];
				const cur = chars[i];
				const charHeight = prev.top - prev.bottom;
				if (Math.abs(cur.top - prev.top) > charHeight * 0.5) {
					lines.push([cur]); // new line
				} else {
					lines[lines.length - 1].push(cur);
				}
			}

			// Draw one merged rect per line
			for (const line of lines) {
				let minLeft = Infinity,
					maxRight = -Infinity;
				let minBottom = Infinity,
					maxTop = -Infinity;
				for (const c of line) {
					if (c.left < minLeft) minLeft = c.left;
					if (c.right > maxRight) maxRight = c.right;
					if (c.bottom < minBottom) minBottom = c.bottom;
					if (c.top > maxTop) maxTop = c.top;
				}
				const { x, y, w, h } = pdfToCanvas(
					minLeft,
					maxRight,
					minBottom,
					maxTop,
					page.originalHeight,
					page.scale,
				);
				if (w > 0 && h > 0) ctx!.fillRect(x, y, w, h);
			}
		}

		for (const match of matches) {
			if (match.charIndex !== activeCharIndex) {
				drawMatch(match, "rgba(255, 220, 0, 0.45)");
			}
		}
		if (activeCharIndex >= 0) {
			const active = matches.find((m) => m.charIndex === activeCharIndex);
			if (active) drawMatch(active, "rgba(255, 140, 0, 0.75)");
		}
	});
</script>

<div
	class="page-wrapper relative shadow-[0_2px_8px_rgba(0,0,0,0.25)]"
	style="width: {page.width}px; height: {page.height}px;"
	use:observe
>
	{#if localImageData}
		<canvas bind:this={renderCanvas} class="absolute top-0 left-0"></canvas>
		<canvas bind:this={overlayCanvas} class="absolute top-0 left-0"
		></canvas>
	{:else}
		<div
			class="w-full h-full bg-surface-100 flex items-center justify-center"
		>
			{#if rendering}
				<span
					class="spinner size-8 border-3 border-surface-200 border-t-primary-500 rounded-full"
				></span>
			{/if}
		</div>
	{/if}
</div>

<style>
	/* @keyframes can't be expressed as Tailwind utilities */

	.spinner {
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
