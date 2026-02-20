/** Per-character bounding box in PDF coordinate space (origin bottom-left, Y-up, units: points) */
export interface CharBox {
  char: string;
  left: number;
  right: number;
  bottom: number;
  top: number;
}

/** Rendered page data — holds the bitmap and all character positions */
export interface PageData {
  index: number;
  imageData: ImageData;
  /** Rendered width in pixels */
  width: number;
  /** Rendered height in pixels */
  height: number;
  /** Page width in PDF points (used for coordinate conversion) */
  originalWidth: number;
  /** Page height in PDF points (used for Y-flip: y = (originalHeight - top) * scale) */
  originalHeight: number;
  chars: CharBox[];
  scale: number;
}

/** One search match — identifies a run of characters on a page */
export interface SearchMatch {
  pageIndex: number;
  charIndex: number;
  charCount: number;
}

export interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
}
