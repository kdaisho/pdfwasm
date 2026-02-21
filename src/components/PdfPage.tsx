import { useRef, useEffect } from 'react';
import type { PageData, SearchMatch } from '../types';

interface PdfPageProps {
  page: PageData;
  matches: SearchMatch[];
  /** charIndex of the currently active match on this page, or -1 */
  activeCharIndex: number;
}

/**
 * Convert a character bounding box from PDF space to canvas pixel space.
 *
 * PDF space:    origin bottom-left, Y-up,   units = points
 * Canvas space: origin top-left,    Y-down,  units = pixels
 *
 * Anti-drift formula (same scale factor used for both rendering and highlight coords):
 *   x = left   * scale
 *   y = (pageHeightPt - top) * scale   ← Y-flip
 *   w = (right  - left) * scale
 *   h = (top    - bottom) * scale
 */
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

export function PdfPage({ page, matches, activeCharIndex }: PdfPageProps) {
  const renderCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

  // Paint the rendered bitmap onto the bottom canvas
  useEffect(() => {
    const canvas = renderCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = page.width;
    canvas.height = page.height;
    ctx.putImageData(page.imageData, 0, 0);
  }, [page]);

  // Draw search-match highlights on the overlay canvas
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = page.width;
    canvas.height = page.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (matches.length === 0) return;

    function drawMatch(match: SearchMatch, color: string) {
      ctx!.fillStyle = color;
      for (let i = match.charIndex; i < match.charIndex + match.charCount; i++) {
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

    // Draw non-active matches in yellow, active match in orange on top
    for (const match of matches) {
      if (match.charIndex !== activeCharIndex) {
        drawMatch(match, 'rgba(255, 220, 0, 0.45)');
      }
    }
    if (activeCharIndex >= 0) {
      const active = matches.find((m) => m.charIndex === activeCharIndex);
      if (active) drawMatch(active, 'rgba(255, 140, 0, 0.75)');
    }
  }, [page, matches, activeCharIndex]);

  return (
    <div
      style={{
        position: 'relative',
        width: page.width,
        height: page.height,
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
      }}
    >
      <canvas
        ref={renderCanvasRef}
        style={{ position: 'absolute', top: 0, left: 0 }}
      />
      <canvas
        ref={overlayCanvasRef}
        style={{ position: 'absolute', top: 0, left: 0 }}
      />
    </div>
  );
}
