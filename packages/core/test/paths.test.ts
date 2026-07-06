import { describe, expect, it } from 'vitest';
import { bezierPath, edgePath, smoothStepPath, stepWaypoints, straightPath } from '@reflow/core';

const spec = {
  source: { x: 0, y: 0 },
  sourceSide: 'right' as const,
  target: { x: 200, y: 100 },
  targetSide: 'left' as const,
};

describe('edge paths', () => {
  it('straight path midpoint label', () => {
    const p = straightPath(spec);
    expect(p.d).toBe('M 0,0 L 200,100');
    expect(p.label).toEqual({ x: 100, y: 50 });
  });

  it('bezier path starts and ends at the endpoints', () => {
    const p = bezierPath(spec);
    expect(p.d.startsWith('M 0,0 C')).toBe(true);
    expect(p.d.endsWith('200,100')).toBe(true);
    // Label near the middle.
    expect(p.label.x).toBeCloseTo(100);
    expect(p.label.y).toBeCloseTo(50);
  });

  it('bezier pulls control points backwards when target is behind', () => {
    const p = bezierPath({ ...spec, target: { x: -200, y: 0 } });
    // Control point should extend to the right of the source even though
    // the target is to the left (the classic S-curve).
    const c1x = parseFloat(p.d.split('C ')[1].split(',')[0]);
    expect(c1x).toBeGreaterThan(0);
  });

  it('step waypoints route orthogonally', () => {
    const pts = stepWaypoints(spec.source, 'right', spec.target, 'left', 20);
    // Every segment must be axis-aligned.
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x;
      const dy = pts[i].y - pts[i - 1].y;
      expect(dx === 0 || dy === 0).toBe(true);
    }
    expect(pts[0]).toEqual(spec.source);
    expect(pts[pts.length - 1]).toEqual(spec.target);
  });

  it('step waypoints route around when target is behind', () => {
    const pts = stepWaypoints({ x: 0, y: 0 }, 'right', { x: -200, y: 10 }, 'left', 20);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[pts.length - 1]).toEqual({ x: -200, y: 10 });
    // Must still leave the source heading right (stub).
    expect(pts[1].x).toBeGreaterThan(0);
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x;
      const dy = pts[i].y - pts[i - 1].y;
      expect(dx === 0 || dy === 0).toBe(true);
    }
  });

  it('smoothstep renders rounded corners with Q segments', () => {
    const p = smoothStepPath(spec);
    expect(p.d).toContain('Q');
    expect(p.d.startsWith('M 0,0')).toBe(true);
  });

  it('edgePath falls back to bezier for unknown types', () => {
    expect(edgePath('nope', spec).d).toBe(bezierPath(spec).d);
    expect(edgePath('straight', spec).d).toBe(straightPath(spec).d);
  });

  it('handles vertical (top/bottom) sides', () => {
    const p = smoothStepPath({
      source: { x: 0, y: 0 },
      sourceSide: 'bottom',
      target: { x: 100, y: 200 },
      targetSide: 'top',
    });
    expect(p.d.startsWith('M 0,0')).toBe(true);
    expect(p.d.endsWith('L 100,200')).toBe(true);
  });
});
