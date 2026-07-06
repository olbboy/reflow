import type { Side, XY } from './types';
import { sideDir } from './geometry';

export interface EdgePathSpec {
  source: XY;
  sourceSide: Side;
  target: XY;
  targetSide: Side;
  /** Bezier bending strength (default 0.25). */
  curvature?: number;
  /** Smooth-step corner radius (default 8). */
  borderRadius?: number;
  /** Minimum stub length leaving a handle for step paths (default 20). */
  offset?: number;
}

export interface EdgePath {
  /** SVG path data. */
  d: string;
  /** Anchor point for the label, halfway along the path. */
  label: XY;
}

const f = (v: number): string => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};

export const straightPath = (s: EdgePathSpec): EdgePath => ({
  d: `M ${f(s.source.x)},${f(s.source.y)} L ${f(s.target.x)},${f(s.target.y)}`,
  label: { x: (s.source.x + s.target.x) / 2, y: (s.source.y + s.target.y) / 2 },
});

const controlOffset = (dist: number, curvature: number): number =>
  dist >= 0 ? 0.5 * dist : curvature * 25 * Math.sqrt(-dist);

const controlPoint = (side: Side, from: XY, to: XY, c: number): XY => {
  switch (side) {
    case 'left':
      return { x: from.x - controlOffset(from.x - to.x, c), y: from.y };
    case 'right':
      return { x: from.x + controlOffset(to.x - from.x, c), y: from.y };
    case 'top':
      return { x: from.x, y: from.y - controlOffset(from.y - to.y, c) };
    default:
      return { x: from.x, y: from.y + controlOffset(to.y - from.y, c) };
  }
};

const cubicAt = (t: number, p0: number, p1: number, p2: number, p3: number): number => {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
};

/** Cubic bezier whose control points extend outward from each handle side. */
export const bezierPath = (s: EdgePathSpec): EdgePath => {
  const c = s.curvature ?? 0.25;
  const c1 = controlPoint(s.sourceSide, s.source, s.target, c);
  const c2 = controlPoint(s.targetSide, s.target, s.source, c);
  return {
    d:
      `M ${f(s.source.x)},${f(s.source.y)} ` +
      `C ${f(c1.x)},${f(c1.y)} ${f(c2.x)},${f(c2.y)} ${f(s.target.x)},${f(s.target.y)}`,
    label: {
      x: cubicAt(0.5, s.source.x, c1.x, c2.x, s.target.x),
      y: cubicAt(0.5, s.source.y, c1.y, c2.y, s.target.y),
    },
  };
};

const dist = (a: XY, b: XY): number => Math.hypot(a.x - b.x, a.y - b.y);

const dedupe = (pts: XY[]): XY[] => {
  const out: XY[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const last = out[out.length - 1];
    if (Math.abs(pts[i].x - last.x) > 1e-9 || Math.abs(pts[i].y - last.y) > 1e-9) {
      out.push(pts[i]);
    }
  }
  return out;
};

/**
 * Waypoints for an orthogonal edge, including source and target endpoints.
 * Exported for routing-aware consumers (e.g. custom edges, hit testing).
 */
export const stepWaypoints = (
  source: XY,
  sourceSide: Side,
  target: XY,
  targetSide: Side,
  offset: number
): XY[] => {
  const sd = sideDir(sourceSide);
  const td = sideDir(targetSide);
  const sg = { x: source.x + sd.x * offset, y: source.y + sd.y * offset };
  const tg = { x: target.x + td.x * offset, y: target.y + td.y * offset };
  const cx = (sg.x + tg.x) / 2;
  const cy = (sg.y + tg.y) / 2;

  let mid: XY[];
  const bothHorizontal = sd.x !== 0 && td.x !== 0;
  const bothVertical = sd.y !== 0 && td.y !== 0;

  if (bothHorizontal && sd.x === -td.x) {
    // Opposing horizontal handles (e.g. right -> left).
    mid =
      sd.x * (tg.x - sg.x) >= 0
        ? [
            { x: cx, y: sg.y },
            { x: cx, y: tg.y },
          ]
        : [
            { x: sg.x, y: cy },
            { x: tg.x, y: cy },
          ];
  } else if (bothVertical && sd.y === -td.y) {
    mid =
      sd.y * (tg.y - sg.y) >= 0
        ? [
            { x: sg.x, y: cy },
            { x: tg.x, y: cy },
          ]
        : [
            { x: cx, y: sg.y },
            { x: cx, y: tg.y },
          ];
  } else if (bothHorizontal) {
    // Same-side horizontal handles: route via the outermost x.
    const x = sd.x > 0 ? Math.max(sg.x, tg.x) : Math.min(sg.x, tg.x);
    mid = [
      { x, y: sg.y },
      { x, y: tg.y },
    ];
  } else if (bothVertical) {
    const y = sd.y > 0 ? Math.max(sg.y, tg.y) : Math.min(sg.y, tg.y);
    mid = [
      { x: sg.x, y },
      { x: tg.x, y },
    ];
  } else if (sd.x !== 0) {
    // Perpendicular: horizontal source, vertical target.
    mid = [{ x: tg.x, y: sg.y }];
  } else {
    mid = [{ x: sg.x, y: tg.y }];
  }

  return dedupe([source, sg, ...mid, tg, target]);
};

const polylineMidpoint = (pts: XY[]): XY => {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1], pts[i]);
  if (total === 0) return pts[0];
  let half = total / 2;
  for (let i = 1; i < pts.length; i++) {
    const seg = dist(pts[i - 1], pts[i]);
    if (half <= seg) {
      const t = half / seg;
      return {
        x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t,
        y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t,
      };
    }
    half -= seg;
  }
  return pts[pts.length - 1];
};

const renderRounded = (pts: XY[], radius: number): EdgePath => {
  let d = `M ${f(pts[0].x)},${f(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const next = pts[i + 1];
    const r = Math.min(radius, dist(prev, cur) / 2, dist(cur, next) / 2);
    if (r <= 0.01) {
      d += ` L ${f(cur.x)},${f(cur.y)}`;
      continue;
    }
    const lin = dist(prev, cur);
    const lout = dist(cur, next);
    const inPt = {
      x: cur.x - ((cur.x - prev.x) / lin) * r,
      y: cur.y - ((cur.y - prev.y) / lin) * r,
    };
    const outPt = {
      x: cur.x + ((next.x - cur.x) / lout) * r,
      y: cur.y + ((next.y - cur.y) / lout) * r,
    };
    d += ` L ${f(inPt.x)},${f(inPt.y)} Q ${f(cur.x)},${f(cur.y)} ${f(outPt.x)},${f(outPt.y)}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${f(last.x)},${f(last.y)}`;
  return { d, label: polylineMidpoint(pts) };
};

/** Orthogonal path with rounded corners. */
export const smoothStepPath = (s: EdgePathSpec): EdgePath =>
  renderRounded(
    stepWaypoints(s.source, s.sourceSide, s.target, s.targetSide, s.offset ?? 20),
    s.borderRadius ?? 8
  );

/** Orthogonal path with square corners. */
export const stepPath = (s: EdgePathSpec): EdgePath =>
  renderRounded(stepWaypoints(s.source, s.sourceSide, s.target, s.targetSide, s.offset ?? 20), 0);

export type PathFn = (s: EdgePathSpec) => EdgePath;

export const pathFns: Record<string, PathFn> = {
  bezier: bezierPath,
  straight: straightPath,
  smoothstep: smoothStepPath,
  step: stepPath,
};

/** Build a path for the given edge type, falling back to bezier. */
export const edgePath = (type: string | undefined, s: EdgePathSpec): EdgePath =>
  (pathFns[type ?? 'bezier'] ?? bezierPath)(s);
