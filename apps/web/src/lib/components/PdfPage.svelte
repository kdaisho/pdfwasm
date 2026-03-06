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
		if (localImageData || rendering) return;
		rendering = true;
		try {
			const pdfPage = doc.getPage(page.index);
			// Extract chars if not yet populated (visible pages get priority)
			if (page.chars.length === 0) {
				page.chars = extractCharBoxes(pdfPage);
			}
			const rendered = await pdfPage.render({
				scale: RENDER_SCALE,
				render: "bitmap",
			});
			localImageData = new ImageData(
				new Uint8ClampedArray(rendered.data.buffer),
				rendered.width,
				rendered.height,
			);
		} finally {
			rendering = false;
		}
	}

	function observe(node: HTMLDivElement) {
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) {
					void renderPage();
				}
			},
			{ rootMargin: "200px" },
		);
		observer.observe(node);
		return {
			destroy() {
				observer.disconnect();
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
	class="page-wrapper"
	style="width: {page.width}px; height: {page.height}px;"
	use:observe
>
	{#if localImageData}
		<canvas bind:this={renderCanvas} class="layer"></canvas>
		<canvas bind:this={overlayCanvas} class="layer"></canvas>
	{:else}
		<div class="placeholder">
			{#if rendering}
				<span class="spinner"></span>
			{/if}
		</div>
	{/if}
</div>

<style>
	.page-wrapper {
		position: relative;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
	}
	.layer {
		position: absolute;
		top: 0;
		left: 0;
	}
	.placeholder {
		width: 100%;
		height: 100%;
		background: #f0f0f0;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.spinner {
		width: 32px;
		height: 32px;
		border: 3px solid #ddd;
		border-top-color: #4f6ef7;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
