import { describe, expect, it } from 'vitest';
import {
  FlowStore,
  forceLayout,
  gridLayout,
  layeredLayout,
  layout,
  radialLayout,
  treeLayout,
  type LayoutEdge,
  type LayoutNode,
  type Node,
} from '@reflow/core';

const ln = (id: string): LayoutNode => ({ id, width: 100, height: 40 });

const chain = (ids: string[]): LayoutEdge[] =>
  ids.slice(1).map((id, i) => ({ source: ids[i], target: id }));

const noOverlap = (positions: Map<string, { x: number; y: number }>, nodes: LayoutNode[]) => {
  const rects = nodes.map((n) => {
    const p = positions.get(n.id)!;
    return { ...p, width: n.width, height: n.height, id: n.id };
  });
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      const overlap =
        a.x < b.x + b.width - 1 &&
        b.x < a.x + a.width - 1 &&
        a.y < b.y + b.height - 1 &&
        b.y < a.y + a.height - 1;
      expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
    }
  }
};

describe('layeredLayout', () => {
  it('ranks a chain left to right', () => {
    const nodes = ['a', 'b', 'c'].map(ln);
    const pos = layeredLayout(nodes, chain(['a', 'b', 'c']), { direction: 'LR' });
    expect(pos.get('a')!.x).toBeLessThan(pos.get('b')!.x);
    expect(pos.get('b')!.x).toBeLessThan(pos.get('c')!.x);
  });

  it('separates parallel branches without overlap', () => {
    const nodes = ['root', 'l', 'r', 'sink'].map(ln);
    const edges: LayoutEdge[] = [
      { source: 'root', target: 'l' },
      { source: 'root', target: 'r' },
      { source: 'l', target: 'sink' },
      { source: 'r', target: 'sink' },
    ];
    const pos = layeredLayout(nodes, edges);
    noOverlap(pos, nodes);
    // l and r share a rank; root and sink bracket them.
    expect(pos.get('l')!.x).toBeCloseTo(pos.get('r')!.x);
  });

  it('survives cycles', () => {
    const nodes = ['a', 'b', 'c'].map(ln);
    const edges = [...chain(['a', 'b', 'c']), { source: 'c', target: 'a' }];
    const pos = layeredLayout(nodes, edges);
    expect(pos.size).toBe(3);
    noOverlap(pos, nodes);
  });

  it('supports TB direction', () => {
    const nodes = ['a', 'b'].map(ln);
    const pos = layeredLayout(nodes, chain(['a', 'b']), { direction: 'TB' });
    expect(pos.get('a')!.y).toBeLessThan(pos.get('b')!.y);
  });

  it('handles 1000 nodes quickly', () => {
    const nodes: LayoutNode[] = [];
    const edges: LayoutEdge[] = [];
    for (let i = 0; i < 1000; i++) {
      nodes.push(ln(`n${i}`));
      if (i > 0) edges.push({ source: `n${Math.floor((i - 1) / 3)}`, target: `n${i}` });
    }
    const t0 = performance.now();
    const pos = layeredLayout(nodes, edges);
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(pos.size).toBe(1000);
  });
});

describe('treeLayout', () => {
  it('centers parent over children', () => {
    const nodes = ['p', 'a', 'b'].map(ln);
    const edges: LayoutEdge[] = [
      { source: 'p', target: 'a' },
      { source: 'p', target: 'b' },
    ];
    const pos = treeLayout(nodes, edges, { direction: 'TB' });
    const mid = (pos.get('a')!.x + pos.get('b')!.x) / 2;
    expect(pos.get('p')!.x).toBeCloseTo(mid);
    expect(pos.get('p')!.y).toBeLessThan(pos.get('a')!.y);
    noOverlap(pos, nodes);
  });

  it('lays out forests', () => {
    const nodes = ['a', 'b', 'c', 'd'].map(ln);
    const edges: LayoutEdge[] = [
      { source: 'a', target: 'b' },
      { source: 'c', target: 'd' },
    ];
    const pos = treeLayout(nodes, edges);
    expect(pos.size).toBe(4);
    noOverlap(pos, nodes);
  });
});

describe('forceLayout', () => {
  it('is deterministic and separates nodes', () => {
    const nodes = Array.from({ length: 30 }, (_, i) => ln(`n${i}`));
    const edges = chain(nodes.map((n) => n.id));
    const p1 = forceLayout(nodes, edges, { iterations: 100, seed: 7 });
    const p2 = forceLayout(nodes, edges, { iterations: 100, seed: 7 });
    expect(p1.get('n0')).toEqual(p2.get('n0'));
    // Connected nodes shouldn't be at identical positions.
    const a = p1.get('n0')!;
    const b = p1.get('n1')!;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(10);
  });
});

describe('grid & radial', () => {
  it('grid places in rows', () => {
    const nodes = Array.from({ length: 6 }, (_, i) => ln(`n${i}`));
    const pos = gridLayout(nodes, { columns: 3, gap: 20 });
    expect(pos.get('n0')!.y).toBe(pos.get('n2')!.y);
    expect(pos.get('n3')!.y).toBeGreaterThan(pos.get('n0')!.y);
  });

  it('radial rings by depth', () => {
    const nodes = ['root', 'a', 'b', 'c'].map(ln);
    const edges: LayoutEdge[] = [
      { source: 'root', target: 'a' },
      { source: 'root', target: 'b' },
      { source: 'a', target: 'c' },
    ];
    const pos = radialLayout(nodes, edges, { ringGap: 100 });
    const dist = (id: string) => {
      const p = pos.get(id)!;
      return Math.hypot(p.x + 50, p.y + 20); // + half size = center distance
    };
    expect(dist('root')).toBeLessThan(10);
    expect(dist('a')).toBeCloseTo(100, 0);
    expect(dist('c')).toBeCloseTo(200, 0);
  });
});

describe('store integration', () => {
  it('layout() applies as one undoable transaction', () => {
    const nodes: Node[] = ['a', 'b', 'c'].map((id) => ({
      id,
      position: { x: 0, y: 0 },
      data: {},
      width: 100,
      height: 40,
    }));
    const store = new FlowStore({
      nodes,
      edges: [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'b', target: 'c' },
      ],
    });
    layout(store, 'layered', { fitView: false });
    expect(store.getNode('c')!.position.x).toBeGreaterThan(store.getNode('a')!.position.x);
    store.undo();
    expect(store.getNode('c')!.position).toEqual({ x: 0, y: 0 });
  });
});
