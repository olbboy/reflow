import { describe, expect, it, vi } from 'vitest';
import { FlowStore, type Edge, type Node } from '@reflow/core';

const n = (id: string, x = 0, y = 0, extra: Partial<Node> = {}): Node => ({
  id,
  position: { x, y },
  data: { label: id },
  width: 100,
  height: 40,
  ...extra,
});

const e = (id: string, source: string, target: string, extra: Partial<Edge> = {}): Edge => ({
  id,
  source,
  target,
  ...extra,
});

describe('FlowStore basics', () => {
  it('initializes with nodes and edges', () => {
    const store = new FlowStore({ nodes: [n('a'), n('b', 200)], edges: [e('e1', 'a', 'b')] });
    expect(store.getNodes()).toHaveLength(2);
    expect(store.getEdges()).toHaveLength(1);
    expect(store.canUndo).toBe(false);
  });

  it('fine-grained notifications: moving one node notifies that node and its edges only', () => {
    const store = new FlowStore({
      nodes: [n('a'), n('b', 200), n('c', 400)],
      edges: [e('e1', 'a', 'b')],
    });
    const onA = vi.fn();
    const onC = vi.fn();
    const onE1 = vi.fn();
    store.subscribe('node:a', onA);
    store.subscribe('node:c', onC);
    store.subscribe('edge:e1', onE1);
    store.setNodePosition('a', { x: 50, y: 50 });
    expect(onA).toHaveBeenCalled();
    expect(onE1).toHaveBeenCalled();
    expect(onC).not.toHaveBeenCalled();
  });

  it('node objects are replaced immutably', () => {
    const store = new FlowStore({ nodes: [n('a')] });
    const before = store.getNode('a');
    store.updateNodeData('a', { label: 'renamed' });
    const after = store.getNode('a');
    expect(after).not.toBe(before);
    expect(after!.data.label).toBe('renamed');
    expect(before!.data.label).toBe('a');
  });

  it('removeNodes cascades to connected edges and reparents children', () => {
    const store = new FlowStore({
      nodes: [
        n('group', 100, 100, { width: 300, height: 200 }),
        n('child', 20, 30, { parentId: 'group' }),
        n('other', 600),
      ],
      edges: [e('e1', 'group', 'other')],
    });
    store.removeNodes(['group']);
    expect(store.getNode('group')).toBeUndefined();
    expect(store.getEdge('e1')).toBeUndefined();
    const child = store.getNode('child')!;
    expect(child.parentId).toBeUndefined();
    // Kept its absolute position.
    expect(child.position).toEqual({ x: 120, y: 130 });
  });

  it('absolute positions accumulate through parents', () => {
    const store = new FlowStore({
      nodes: [n('p', 100, 100), n('c', 10, 20, { parentId: 'p' })],
    });
    expect(store.absolutePosition('c')).toEqual({ x: 110, y: 120 });
    expect(store.nodeRect('c')).toEqual({ x: 110, y: 120, width: 100, height: 40 });
  });
});

describe('selection', () => {
  it('set/toggle/clear selection flags nodes', () => {
    const store = new FlowStore({ nodes: [n('a'), n('b')], edges: [] });
    store.setSelection(['a']);
    expect(store.getNode('a')!.selected).toBe(true);
    store.toggleSelection('b');
    expect(store.selectedNodes.size).toBe(2);
    store.clearSelection();
    expect(store.selectedNodes.size).toBe(0);
    expect(store.getNode('a')!.selected).toBe(false);
  });

  it('deleteSelection removes nodes and edges in one undo entry', () => {
    const store = new FlowStore({
      nodes: [n('a'), n('b', 200)],
      edges: [e('e1', 'a', 'b')],
    });
    store.setSelection(['a'], []);
    store.deleteSelection();
    expect(store.getNodes()).toHaveLength(1);
    expect(store.getEdges()).toHaveLength(0);
    store.undo();
    expect(store.getNodes()).toHaveLength(2);
    expect(store.getEdges()).toHaveLength(1);
  });
});

describe('undo/redo', () => {
  it('round-trips add/move/remove', () => {
    const store = new FlowStore();
    store.addNode(n('a'));
    store.setNodePosition('a', { x: 300, y: 0 });
    store.removeNodes(['a']);
    expect(store.getNodes()).toHaveLength(0);

    store.undo(); // un-remove
    expect(store.getNode('a')!.position.x).toBe(300);
    store.undo(); // un-move
    expect(store.getNode('a')!.position.x).toBe(0);
    store.undo(); // un-add
    expect(store.getNodes()).toHaveLength(0);
    expect(store.canUndo).toBe(false);

    store.redo();
    store.redo();
    store.redo();
    expect(store.getNodes()).toHaveLength(0);
    store.undo();
    expect(store.getNode('a')!.position.x).toBe(300);
  });

  it('drag produces a single history entry', () => {
    const store = new FlowStore({ nodes: [n('a'), n('b', 500, 500)] });
    store.startDrag(['a']);
    for (let i = 1; i <= 10; i++) store.dragBy({ x: i * 10, y: 0 });
    store.endDrag();
    expect(store.getNode('a')!.position.x).toBe(100);
    store.undo();
    expect(store.getNode('a')!.position.x).toBe(0);
    expect(store.canUndo).toBe(false);
    store.redo();
    expect(store.getNode('a')!.position.x).toBe(100);
  });

  it('transact groups mutations', () => {
    const store = new FlowStore();
    store.transact('setup', () => {
      store.addNode(n('a'));
      store.addNode(n('b', 100));
      store.connect({ source: 'a', target: 'b' });
    });
    expect(store.getEdges()).toHaveLength(1);
    store.undo();
    expect(store.getNodes()).toHaveLength(0);
    expect(store.getEdges()).toHaveLength(0);
  });

  it('respects history limit', () => {
    const store = new FlowStore({ historyLimit: 3 });
    for (let i = 0; i < 10; i++) store.addNode(n(`n${i}`));
    let undos = 0;
    while (store.canUndo) {
      store.undo();
      undos++;
    }
    expect(undos).toBe(3);
  });
});

describe('connections', () => {
  it('connect validates and creates edges with defaults', () => {
    const store = new FlowStore({
      nodes: [n('a'), n('b', 300)],
      defaultEdgeOptions: { type: 'smoothstep', animated: true },
    });
    const edge = store.connect({ source: 'a', target: 'b' });
    expect(edge).not.toBeNull();
    expect(edge!.type).toBe('smoothstep');
    expect(edge!.animated).toBe(true);
  });

  it('rejects self loops and duplicates', () => {
    const store = new FlowStore({ nodes: [n('a'), n('b', 300)] });
    expect(store.connect({ source: 'a', target: 'a' })).toBeNull();
    expect(store.connect({ source: 'a', target: 'b' })).not.toBeNull();
    expect(store.connect({ source: 'a', target: 'b' })).toBeNull();
    expect(store.getEdges()).toHaveLength(1);
  });

  it('preventCycles blocks cycle-creating connections', () => {
    const store = new FlowStore({
      nodes: [n('a'), n('b', 200), n('c', 400)],
      edges: [e('e1', 'a', 'b'), e('e2', 'b', 'c')],
      preventCycles: true,
    });
    expect(store.connect({ source: 'c', target: 'a' })).toBeNull();
    expect(store.connect({ source: 'a', target: 'c' })).not.toBeNull();
  });

  it('typed handles reject incompatible dataTypes', () => {
    const store = new FlowStore({ nodes: [n('a'), n('b', 300)] });
    store.registerHandle({
      id: 'out',
      nodeId: 'a',
      kind: 'source',
      side: 'right',
      x: 100,
      y: 20,
      dataType: 'number',
    });
    store.registerHandle({
      id: 'in',
      nodeId: 'b',
      kind: 'target',
      side: 'left',
      x: 0,
      y: 20,
      dataType: 'string',
    });
    expect(
      store.validateCandidate({ source: 'a', sourceHandle: 'out', target: 'b', targetHandle: 'in' })
    ).toBe('incompatible types');
  });

  it('maxConnections limits a handle', () => {
    const store = new FlowStore({ nodes: [n('a'), n('b', 300), n('c', 600)] });
    store.registerHandle({
      id: 'out',
      nodeId: 'a',
      kind: 'source',
      side: 'right',
      x: 100,
      y: 20,
      maxConnections: 1,
    });
    expect(store.connect({ source: 'a', sourceHandle: 'out', target: 'b' })).not.toBeNull();
    expect(store.connect({ source: 'a', sourceHandle: 'out', target: 'c' })).toBeNull();
  });

  it('interactive connection flow snaps to a compatible handle', () => {
    const store = new FlowStore({ nodes: [n('a'), n('b', 300)] });
    store.startConnection('a');
    expect(store.connection).not.toBeNull();
    // Move near b's implicit target handle (left midpoint at 300, 20).
    store.moveConnection({ x: 295, y: 22 });
    expect(store.connection!.toHandle?.nodeId).toBe('b');
    expect(store.connection!.valid).toBe(true);
    const edge = store.endConnection();
    expect(edge).not.toBeNull();
    expect(edge!.source).toBe('a');
    expect(edge!.target).toBe('b');
    expect(store.connection).toBeNull();
  });
});

describe('viewport & culling', () => {
  it('setViewport clamps zoom and notifies', () => {
    const store = new FlowStore({ minZoom: 0.5, maxZoom: 2 });
    const spy = vi.fn();
    store.subscribe('viewport', spy);
    store.setViewport({ x: 0, y: 0, zoom: 10 });
    expect(store.viewport.zoom).toBe(2);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('fitView centers content', () => {
    const store = new FlowStore({ nodes: [n('a', 0, 0), n('b', 900, 900)] });
    store.setScreenSize(1000, 1000);
    store.fitView({ padding: 0.1 });
    // Content bounds: (0,0)-(1000,940); center should map to screen center.
    const cx = (0 + 1000) / 2;
    const cy = (0 + 940) / 2;
    const sx = cx * store.viewport.zoom + store.viewport.x;
    const sy = cy * store.viewport.zoom + store.viewport.y;
    expect(sx).toBeCloseTo(500, 0);
    expect(sy).toBeCloseTo(500, 0);
  });

  it('culling keeps only nodes near the viewport (with >200 nodes)', () => {
    const nodes: Node[] = [];
    for (let i = 0; i < 300; i++) nodes.push(n(`x${i}`, (i % 20) * 400, Math.floor(i / 20) * 300));
    const store = new FlowStore({ nodes });
    store.setScreenSize(800, 600);
    store.setViewport({ x: 0, y: 0, zoom: 1 });
    store.cull();
    expect(store.cullingActive).toBe(true);
    expect(store.visibleRoots.size).toBeGreaterThan(0);
    expect(store.visibleRoots.size).toBeLessThan(60);
  });

  it('small graphs render everything', () => {
    const store = new FlowStore({ nodes: [n('a'), n('b', 5000, 5000)] });
    store.setScreenSize(800, 600);
    store.cull();
    expect(store.cullingActive).toBe(false);
    expect(store.visibleRoots.size).toBe(2);
  });
});

describe('snapshot', () => {
  it('round trips', () => {
    const store = new FlowStore({ nodes: [n('a'), n('b', 100)], edges: [e('e1', 'a', 'b')] });
    store.setViewport({ x: 10, y: 20, zoom: 1.2 });
    const snap = store.toSnapshot();
    const store2 = new FlowStore();
    store2.loadSnapshot(JSON.parse(JSON.stringify(snap)));
    expect(store2.getNodes()).toHaveLength(2);
    expect(store2.getEdge('e1')).toBeDefined();
    expect(store2.viewport.zoom).toBeCloseTo(1.2);
  });
});

describe('alignment guides', () => {
  it('dragging near another node edge snaps and produces guides', () => {
    const store = new FlowStore({
      nodes: [n('a', 0, 0), n('b', 300, 104)],
      alignmentGuides: true,
      guideThreshold: 6,
    });
    store.startDrag(['a']);
    // Move a so its top (y) is within 4px of b's top (104).
    store.dragBy({ x: 0, y: 100 });
    expect(store.getNode('a')!.position.y).toBe(104);
    expect(store.guides.length).toBeGreaterThan(0);
    store.endDrag();
    expect(store.guides).toHaveLength(0);
  });
});
