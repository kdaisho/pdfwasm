export const ZOOM_BASE_WIDTH = 250;
export const ZOOM_MIN_WIDTH = 100;
export const ZOOM_MAX_WIDTH = 800;
export const ZOOM_STEP = 50;

export function clampZoomWidth(width: number): number {
	return Math.min(ZOOM_MAX_WIDTH, Math.max(ZOOM_MIN_WIDTH, width));
}

export function stepZoomWidth(current: number, direction: -1 | 1): number {
	return clampZoomWidth(current + direction * ZOOM_STEP);
}
