import type { Rect, XY, Viewport, Side } from './types';

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const rectCenter = (r: Rect): XY => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

export const rectContains = (r: Rect, p: XY): boolean =>
  p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;

export const rectContainsRect = (outer: Rect, inner: Rect): boolean =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;

export const rectsIntersect = (a: Rect, b: Rect): boolean =>
  a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height;

export const rectUnion = (a: Rect | null, b: Rect): Rect => {
  if (!a) return { ...b };
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
};

export const expandRect = (r: Rect, m: number): Rect => ({
  x: r.x - m,
  y: r.y - m,
  width: r.width + 2 * m,
  height: r.height + 2 * m,
});

export const rectFromPoints = (a: XY, b: XY): Rect => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  width: Math.abs(a.x - b.x),
  height: Math.abs(a.y - b.y),
});

/** Convert a screen point to flow coordinates. */
export const screenToFlow = (p: XY, v: Viewport): XY => ({
  x: (p.x - v.x) / v.zoom,
  y: (p.y - v.y) / v.zoom,
});

/** Convert a flow point to screen coordinates. */
export const flowToScreen = (p: XY, v: Viewport): XY => ({
  x: p.x * v.zoom + v.x,
  y: p.y * v.zoom + v.y,
});

/** The flow-space rectangle visible in a screen of the given size. */
export const visibleRect = (v: Viewport, width: number, height: number): Rect => ({
  x: -v.x / v.zoom,
  y: -v.y / v.zoom,
  width: width / v.zoom,
  height: height / v.zoom,
});

/**
 * Viewport that fits `bounds` inside a `width`x`height` screen with padding
 * (fraction of the screen, default 0.1).
 */
export const fitRect = (
  bounds: Rect,
  width: number,
  height: number,
  padding = 0.1,
  minZoom = 0.1,
  maxZoom = 2
): Viewport => {
  if (bounds.width <= 0 || bounds.height <= 0 || width <= 0 || height <= 0) {
    return { x: 0, y: 0, zoom: 1 };
  }
  const zoom = clamp(
    Math.min(
      (width * (1 - 2 * padding)) / bounds.width,
      (height * (1 - 2 * padding)) / bounds.height
    ),
    minZoom,
    maxZoom
  );
  const c = rectCenter(bounds);
  return { x: width / 2 - c.x * zoom, y: height / 2 - c.y * zoom, zoom };
};

/**
 * Zoom the viewport by `factor` while keeping the screen point `pivot`
 * stationary (the classic zoom-at-cursor).
 */
export const zoomAt = (
  v: Viewport,
  factor: number,
  pivot: XY,
  minZoom: number,
  maxZoom: number
): Viewport => {
  const zoom = clamp(v.zoom * factor, minZoom, maxZoom);
  const k = zoom / v.zoom;
  return {
    x: pivot.x - (pivot.x - v.x) * k,
    y: pivot.y - (pivot.y - v.y) * k,
    zoom,
  };
};

/** Outward unit vector for a node side. */
export const sideDir = (s: Side): XY => {
  switch (s) {
    case 'left':
      return { x: -1, y: 0 };
    case 'right':
      return { x: 1, y: 0 };
    case 'top':
      return { x: 0, y: -1 };
    default:
      return { x: 0, y: 1 };
  }
};

/** Default anchor point for a side of a rect (border midpoint). */
export const sideAnchor = (r: Rect, s: Side): XY => {
  switch (s) {
    case 'left':
      return { x: r.x, y: r.y + r.height / 2 };
    case 'right':
      return { x: r.x + r.width, y: r.y + r.height / 2 };
    case 'top':
      return { x: r.x + r.width / 2, y: r.y };
    default:
      return { x: r.x + r.width / 2, y: r.y + r.height };
  }
};

/** Pick the node side whose anchor is closest to pointing at `toward`. */
export const closestSide = (r: Rect, toward: XY): Side => {
  const c = rectCenter(r);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'bottom' : 'top';
};

export const snapToGrid = (p: XY, grid: number): XY =>
  grid > 0
    ? { x: Math.round(p.x / grid) * grid, y: Math.round(p.y / grid) * grid }
    : p;
