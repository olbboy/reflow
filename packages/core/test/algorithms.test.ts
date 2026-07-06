import { describe, expect, it } from 'vitest';
import {
  FlowStore,
  connectedComponents,
  getAncestors,
  getDescendants,
  getIncomers,
  getOutgoers,
  hasCycle,
  shortestPath,
  topologicalSort,
  type Node,
} from '@reflow/core';

const n = (id: string): Node => ({ id, position: { x: 0, y: 0 }, data: {} });

const diamond = () =>
  new FlowStore({
    nodes: ['a', 'b', 'c', 'd'].map(n),
    edges: [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'a', target: 'c' },
      { id: 'e3', source: 'b', target: 'd' },
      { id: 'e4', source: 'c', target: 'd' },
    ],
  });

describe('graph algorithms', () => {
  it('incomers/outgoers', () => {
    const g = diamond();
    expect(getOutgoers(g, 'a').map((x) => x.id).sort()).toEqual(['b', 'c']);
    expect(getIncomers(g, 'd').map((x) => x.id).sort()).toEqual(['b', 'c']);
    expect(getIncomers(g, 'a')).toEqual([]);
  });

  it('topological sort orders dependencies', () => {
    const order = topologicalSort(diamond())!;
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('d'));
    expect(order.indexOf('c')).toBeLessThan(order.indexOf('d'));
  });

  it('detects cycles', () => {
    const g = diamond();
    expect(hasCycle(g)).toBe(false);
    g.addEdge({ id: 'back', source: 'd', target: 'a' });
    expect(hasCycle(g)).toBe(true);
    expect(topologicalSort(g)).toBeNull();
  });

  it('shortest path directed and undirected', () => {
    const g = diamond();
    expect(shortestPath(g, 'a', 'd')).toHaveLength(3);
    expect(shortestPath(g, 'd', 'a')).toBeNull();
    expect(shortestPath(g, 'd', 'a', { directed: false })).toHaveLength(3);
  });

  it('connected components', () => {
    const g = diamond();
    g.addNode(n('island'));
    const comps = connectedComponents(g);
    expect(comps).toHaveLength(2);
    expect(comps.map((c) => c.length).sort()).toEqual([1, 4]);
  });

  it('ancestors and descendants', () => {
    const g = diamond();
    expect([...getAncestors(g, 'd')].sort()).toEqual(['a', 'b', 'c']);
    expect([...getDescendants(g, 'a')].sort()).toEqual(['b', 'c', 'd']);
  });
});
