import { describe, expect, it } from 'vitest';
import {
  clamp,
  fitRect,
  flowToScreen,
  rectsIntersect,
  rectUnion,
  screenToFlow,
  snapToGrid,
  visibleRect,
  zoomAt,
} from '@reflow/core';

describe('geometry', () => {
  it('screen/flow round trip', () => {
    const v = { x: 120, y: -40, zoom: 1.5 };
    const p = { x: 33, y: 77 };
    const back = flowToScreen(screenToFlow(p, v), v);
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
  });

  it('visibleRect inverts the viewport', () => {
    const v = { x: -100, y: 50, zoom: 2 };
    const r = visibleRect(v, 800, 600);
    expect(r.x).toBeCloseTo(50);
    expect(r.y).toBeCloseTo(-25);
    expect(r.width).toBeCloseTo(400);
    expect(r.height).toBeCloseTo(300);
  });

  it('zoomAt keeps the pivot stationary', () => {
    const v = { x: 10, y: 20, zoom: 1 };
    const pivot = { x: 200, y: 150 };
    const flowUnderPivot = screenToFlow(pivot, v);
    const v2 = zoomAt(v, 1.6, pivot, 0.1, 4);
    const after = flowToScreen(flowUnderPivot, v2);
    expect(after.x).toBeCloseTo(pivot.x);
    expect(after.y).toBeCloseTo(pivot.y);
    expect(v2.zoom).toBeCloseTo(1.6);
  });

  it('zoomAt clamps zoom', () => {
    const v = { x: 0, y: 0, zoom: 1 };
    expect(zoomAt(v, 100, { x: 0, y: 0 }, 0.1, 2).zoom).toBe(2);
    expect(zoomAt(v, 0.0001, { x: 0, y: 0 }, 0.5, 2).zoom).toBe(0.5);
  });

  it('fitRect centers bounds', () => {
    const vp = fitRect({ x: 0, y: 0, width: 100, height: 100 }, 1000, 1000, 0.1, 0.1, 10);
    // Content center maps to screen center.
    const c = flowToScreen({ x: 50, y: 50 }, vp);
    expect(c.x).toBeCloseTo(500);
    expect(c.y).toBeCloseTo(500);
    expect(vp.zoom).toBeCloseTo(8);
  });

  it('rect ops', () => {
    expect(rectsIntersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 })).toBe(true);
    expect(rectsIntersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: 0, width: 5, height: 5 })).toBe(false);
    const u = rectUnion({ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: 20, width: 10, height: 10 });
    expect(u).toEqual({ x: 0, y: 0, width: 30, height: 30 });
    expect(rectUnion(null, { x: 1, y: 2, width: 3, height: 4 })).toEqual({ x: 1, y: 2, width: 3, height: 4 });
  });

  it('snapToGrid & clamp', () => {
    expect(snapToGrid({ x: 17, y: 23 }, 10)).toEqual({ x: 20, y: 20 });
    expect(snapToGrid({ x: 17, y: 23 }, 0)).toEqual({ x: 17, y: 23 });
    expect(clamp(5, 0, 3)).toBe(3);
  });
});
