import type { Edge, Node } from './types';
import type { FlowStore } from './store';

/** Nodes with an edge pointing into the given node. */
export const getIncomers = (store: FlowStore, id: string): Node[] => {
  const out: Node[] = [];
  const seen = new Set<string>();
  for (const e of store.edgesOf(id)) {
    if (e.target === id && !seen.has(e.source)) {
      seen.add(e.source);
      const n = store.getNode(e.source);
      if (n) out.push(n);
    }
  }
  return out;
};

/** Nodes the given node points to. */
export const getOutgoers = (store: FlowStore, id: string): Node[] => {
  const out: Node[] = [];
  const seen = new Set<string>();
  for (const e of store.edgesOf(id)) {
    if (e.source === id && !seen.has(e.target)) {
      seen.add(e.target);
      const n = store.getNode(e.target);
      if (n) out.push(n);
    }
  }
  return out;
};

/** Every edge touching any of the given nodes. */
export const getConnectedEdges = (store: FlowStore, ids: string[]): Edge[] => {
  const seen = new Set<string>();
  const out: Edge[] = [];
  for (const id of ids) {
    for (const e of store.edgesOf(id)) {
      if (!seen.has(e.id)) {
        seen.add(e.id);
        out.push(e);
      }
    }
  }
  return out;
};

/**
 * Kahn topological sort. Returns node ids in dependency order, or null if
 * the graph contains a directed cycle.
 */
export const topologicalSort = (store: FlowStore): string[] | null => {
  const indegree = new Map<string, number>();
  for (const n of store.getNodes()) indegree.set(n.id, 0);
  for (const e of store.getEdges()) {
    indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1);
  }
  const queue: string[] = [];
  for (const [id, deg] of indegree) if (deg === 0) queue.push(id);
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const e of store.edgesOf(id)) {
      if (e.source !== id) continue;
      const d = (indegree.get(e.target) ?? 0) - 1;
      indegree.set(e.target, d);
      if (d === 0) queue.push(e.target);
    }
  }
  return order.length === store.nodes.size ? order : null;
};

export const hasCycle = (store: FlowStore): boolean => topologicalSort(store) === null;

/** Weakly connected components as arrays of node ids. */
export const connectedComponents = (store: FlowStore): string[][] => {
  const seen = new Set<string>();
  const components: string[][] = [];
  for (const start of store.nodes.keys()) {
    if (seen.has(start)) continue;
    const comp: string[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length > 0) {
      const id = stack.pop()!;
      comp.push(id);
      for (const e of store.edgesOf(id)) {
        const other = e.source === id ? e.target : e.source;
        if (!seen.has(other) && store.nodes.has(other)) {
          seen.add(other);
          stack.push(other);
        }
      }
    }
    components.push(comp);
  }
  return components;
};

/** BFS shortest path (by hop count). Directed by default. */
export const shortestPath = (
  store: FlowStore,
  from: string,
  to: string,
  { directed = true }: { directed?: boolean } = {}
): string[] | null => {
  if (from === to) return [from];
  const prev = new Map<string, string>();
  const queue = [from];
  const seen = new Set([from]);
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const e of store.edgesOf(id)) {
      const next = e.source === id ? e.target : directed ? null : e.source;
      if (!next || seen.has(next)) continue;
      seen.add(next);
      prev.set(next, id);
      if (next === to) {
        const path = [to];
        let cur = to;
        while (cur !== from) {
          cur = prev.get(cur)!;
          path.unshift(cur);
        }
        return path;
      }
      queue.push(next);
    }
  }
  return null;
};

/** All transitive ancestors (upstream nodes). */
export const getAncestors = (store: FlowStore, id: string): Set<string> => {
  const out = new Set<string>();
  const stack = [id];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const e of store.edgesOf(cur)) {
      if (e.target === cur && !out.has(e.source)) {
        out.add(e.source);
        stack.push(e.source);
      }
    }
  }
  return out;
};

/** All transitive descendants (downstream nodes). */
export const getDescendants = (store: FlowStore, id: string): Set<string> => {
  const out = new Set<string>();
  const stack = [id];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const e of store.edgesOf(cur)) {
      if (e.source === cur && !out.has(e.target)) {
        out.add(e.target);
        stack.push(e.target);
      }
    }
  }
  return out;
};
