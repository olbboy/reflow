import type { Guide, Rect } from './types';

export interface GuideResult {
  /** Correction to apply to the moving rect for snapping. */
  dx: number;
  dy: number;
  guides: Guide[];
}

interface Candidate {
  delta: number;
  value: number;
  otherRect: Rect;
}

const xLines = (r: Rect): number[] => [r.x, r.x + r.width / 2, r.x + r.width];
const yLines = (r: Rect): number[] => [r.y, r.y + r.height / 2, r.y + r.height];

/**
 * Figma-style alignment guides: compares the moving rect's edges and center
 * against other rects and returns the snap correction plus guide lines to
 * render. Pure and allocation-light so it can run on every drag frame.
 */
export const computeGuides = (
  moving: Rect,
  others: Iterable<Rect>,
  threshold = 5
): GuideResult => {
  let bestX: Candidate | null = null;
  let bestY: Candidate | null = null;

  const mx = xLines(moving);
  const my = yLines(moving);

  for (const other of others) {
    for (const ox of xLines(other)) {
      for (const m of mx) {
        const delta = ox - m;
        const abs = Math.abs(delta);
        if (abs <= threshold && (!bestX || abs < Math.abs(bestX.delta))) {
          bestX = { delta, value: ox, otherRect: other };
        }
      }
    }
    for (const oy of yLines(other)) {
      for (const m of my) {
        const delta = oy - m;
        const abs = Math.abs(delta);
        if (abs <= threshold && (!bestY || abs < Math.abs(bestY.delta))) {
          bestY = { delta, value: oy, otherRect: other };
        }
      }
    }
  }

  const guides: Guide[] = [];
  if (bestX) {
    guides.push({
      axis: 'x',
      value: bestX.value,
      from: Math.min(moving.y + bestX.delta * 0, bestX.otherRect.y) - 8,
      to: Math.max(moving.y + moving.height, bestX.otherRect.y + bestX.otherRect.height) + 8,
    });
  }
  if (bestY) {
    guides.push({
      axis: 'y',
      value: bestY.value,
      from: Math.min(moving.x, bestY.otherRect.x) - 8,
      to: Math.max(moving.x + moving.width, bestY.otherRect.x + bestY.otherRect.width) + 8,
    });
  }

  return { dx: bestX ? bestX.delta : 0, dy: bestY ? bestY.delta : 0, guides };
};
