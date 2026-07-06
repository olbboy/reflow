import type { Rect } from './types';
import { rectsIntersect } from './geometry';

/**
 * A uniform-grid spatial hash for fast viewport culling and hit testing.
 *
 * Nodes are bucketed by the grid cells their bounds overlap. Queries visit
 * only the cells intersecting the query rect, so lookups stay O(result)
 * instead of O(total nodes) — the key to keeping 10k+ node flows smooth.
 */
export class SpatialIndex {
  private cellSize: number;
  private cells = new Map<string, Set<string>>();
  private bounds = new Map<string, Rect>();

  constructor(cellSize = 512) {
    this.cellSize = cellSize;
  }

  get size(): number {
    return this.bounds.size;
  }

  private *cellKeys(r: Rect): Generator<string> {
    const s = this.cellSize;
    const x0 = Math.floor(r.x / s);
    const y0 = Math.floor(r.y / s);
    const x1 = Math.floor((r.x + r.width) / s);
    const y1 = Math.floor((r.y + r.height) / s);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        yield `${cx}:${cy}`;
      }
    }
  }

  set(id: string, rect: Rect): void {
    const prev = this.bounds.get(id);
    if (
      prev &&
      prev.x === rect.x &&
      prev.y === rect.y &&
      prev.width === rect.width &&
      prev.height === rect.height
    ) {
      return;
    }
    if (prev) this.removeFromCells(id, prev);
    this.bounds.set(id, { ...rect });
    for (const key of this.cellKeys(rect)) {
      let cell = this.cells.get(key);
      if (!cell) {
        cell = new Set();
        this.cells.set(key, cell);
      }
      cell.add(id);
    }
  }

  delete(id: string): void {
    const prev = this.bounds.get(id);
    if (!prev) return;
    this.removeFromCells(id, prev);
    this.bounds.delete(id);
  }

  private removeFromCells(id: string, rect: Rect): void {
    for (const key of this.cellKeys(rect)) {
      const cell = this.cells.get(key);
      if (cell) {
        cell.delete(id);
        if (cell.size === 0) this.cells.delete(key);
      }
    }
  }

  getBounds(id: string): Rect | undefined {
    return this.bounds.get(id);
  }

  /** Ids whose bounds intersect the query rect. */
  query(rect: Rect): Set<string> {
    const out = new Set<string>();
    for (const key of this.cellKeys(rect)) {
      const cell = this.cells.get(key);
      if (!cell) continue;
      for (const id of cell) {
        if (out.has(id)) continue;
        const b = this.bounds.get(id)!;
        if (rectsIntersect(b, rect)) out.add(id);
      }
    }
    return out;
  }

  /** Ids whose bounds contain the point. */
  hit(x: number, y: number): string[] {
    const key = `${Math.floor(x / this.cellSize)}:${Math.floor(y / this.cellSize)}`;
    const cell = this.cells.get(key);
    if (!cell) return [];
    const out: string[] = [];
    for (const id of cell) {
      const b = this.bounds.get(id)!;
      if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) out.push(id);
    }
    return out;
  }

  clear(): void {
    this.cells.clear();
    this.bounds.clear();
  }
}
