<script lang="ts">
	import type { PageData, SearchMatch } from "$lib/types";

	interface Props {
		page: PageData;
		matches: SearchMatch[];
		activeCharIndex: number;
	}

	let { page, matches, activeCharIndex }: Props = $props();

	let renderCanvas: HTMLCanvasElement;
	let overlayCanvas: HTMLCanvasElement;

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

	// Paint rendered bitmap
	$effect(() => {
		if (!renderCanvas) return;
		const ctx = renderCanvas.getContext("2d");
		if (!ctx) return;
		renderCanvas.width = page.width;
		renderCanvas.height = page.height;
		ctx.putImageData(page.imageData, 0, 0);
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
			for (
				let i = match.charIndex;
				i < match.charIndex + match.charCount;
				i++
			) {
				const c = page.chars[i];
				if (!c) continue;
				const { x, y, w, h } = pdfToCanvas(
					c.left,
					c.right,
					c.bottom,
					c.top,
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
>
	<canvas bind:this={renderCanvas} class="layer"></canvas>
	<canvas bind:this={overlayCanvas} class="layer"></canvas>
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
</style>
