import type {
  ConnectionCandidate,
  ConnectionState,
  Edge,
  FitViewOptions,
  FlowSnapshot,
  Guide,
  HandleInfo,
  HandleKind,
  Node,
  Rect,
  StoreOptions,
  Viewport,
  XY,
} from './types';
import {
  clamp,
  expandRect,
  fitRect,
  rectsIntersect,
  rectUnion,
  sideAnchor,
  snapToGrid,
  visibleRect,
  zoomAt,
} from './geometry';
import { SpatialIndex } from './spatial';
import { computeGuides } from './guides';
import { setsEqual, uid } from './utils';

export const DEFAULT_NODE_WIDTH = 172;
export const DEFAULT_NODE_HEIGHT = 44;

type Listener = () => void;

interface HistoryOp {
  undo: () => void;
  redo: () => void;
}

interface HistoryEntry {
  label: string;
  ops: HistoryOp[];
}

interface DragSession {
  ids: string[];
  start: Map<string, XY>;
  /** Rects of non-moving visible nodes, for alignment guides. */
  guideRects: Rect[];
  moved: boolean;
}

const rafSchedule = (fn: () => void): void => {
  if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(fn);
  else fn();
};

/**
 * FlowStore is ReFlow's reactive heart: a Map-backed graph store with
 * fine-grained topic subscriptions.
 *
 * Every mutation notifies only the topics it touches (`node:<id>`,
 * `edge:<id>`, `viewport`, ...), so a renderer can subscribe each component
 * to exactly the state it draws — dragging one node re-renders one node,
 * not the whole flow.
 */
export class FlowStore {
  readonly nodes = new Map<string, Node>();
  readonly edges = new Map<string, Edge>();
  nodeOrder: string[] = [];
  edgeOrder: string[] = [];
  viewport: Viewport = { x: 0, y: 0, zoom: 1 };

  readonly selectedNodes = new Set<string>();
  readonly selectedEdges = new Set<string>();
  connection: ConnectionState | null = null;
  guides: Guide[] = [];

  /** Node ids inside the culling viewport (all depths). */
  visibleNodes = new Set<string>();
  /** Root node ids that should be mounted by a renderer. */
  visibleRoots = new Set<string>();
  visibleEdges = new Set<string>();
  /** When false (small graphs / no screen yet), everything renders. */
  cullingActive = false;

  screen = { width: 0, height: 0 };
  options: StoreOptions;

  readonly spatial = new SpatialIndex();
  private nodeEdges = new Map<string, Set<string>>();
  private children = new Map<string, Set<string>>();
  private handles = new Map<string, Map<string, HandleInfo>>();

  private listeners = new Map<string, Set<Listener>>();
  private pending = new Set<string>();
  private batchDepth = 0;

  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private txn: HistoryEntry | null = null;
  private recording = true;

  private drag: DragSession | null = null;
  private cullScheduled = false;
  private vpAnim: number | null = null;

  constructor(options: StoreOptions = {}) {
    this.options = options;
    if (options.viewport) this.viewport = { ...options.viewport };
    if (options.nodes || options.edges) {
      this.recording = false;
      this.batch(() => {
        for (const n of options.nodes ?? []) this._insertNode({ ...n });
        for (const e of options.edges ?? []) this._insertEdge({ ...e });
      });
      this.recording = true;
    }
  }

  // ── events ────────────────────────────────────────────────────────────

  subscribe(topic: string, fn: Listener): () => void {
    let set = this.listeners.get(topic);
    if (!set) {
      set = new Set();
      this.listeners.set(topic, set);
    }
    set.add(fn);
    return () => {
      set.delete(fn);
      if (set.size === 0) this.listeners.delete(topic);
    };
  }

  private emit(topic: string): void {
    if (this.batchDepth > 0) {
      this.pending.add(topic);
      return;
    }
    const set = this.listeners.get(topic);
    if (set) for (const fn of [...set]) fn();
  }

  /** Group mutations; duplicate notifications are coalesced. */
  batch(fn: () => void): void {
    this.batchDepth++;
    try {
      fn();
    } finally {
      this.batchDepth--;
      if (this.batchDepth === 0) {
        const topics = [...this.pending];
        this.pending.clear();
        for (const t of topics) {
          const set = this.listeners.get(t);
          if (set) for (const l of [...set]) l();
        }
      }
    }
  }

  private commit(): void {
    this.emit('commit');
  }

  // ── history ───────────────────────────────────────────────────────────

  private record(label: string, op: HistoryOp): void {
    if (!this.recording) return;
    if (this.txn) {
      this.txn.ops.push(op);
    } else {
      this.undoStack.push({ label, ops: [op] });
      const limit = this.options.historyLimit ?? 200;
      if (this.undoStack.length > limit) this.undoStack.shift();
      this.redoStack = [];
      this.emit('history');
    }
  }

  /** Group several mutations into a single undo entry. */
  transact(label: string, fn: () => void): void {
    if (this.txn) {
      fn();
      return;
    }
    this.txn = { label, ops: [] };
    try {
      this.batch(fn);
    } finally {
      const entry = this.txn;
      this.txn = null;
      if (entry.ops.length > 0 && this.recording) {
        this.undoStack.push(entry);
        const limit = this.options.historyLimit ?? 200;
        if (this.undoStack.length > limit) this.undoStack.shift();
        this.redoStack = [];
        this.emit('history');
      }
    }
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): void {
    const entry = this.undoStack.pop();
    if (!entry) return;
    this.recording = false;
    this.batch(() => {
      for (let i = entry.ops.length - 1; i >= 0; i--) entry.ops[i].undo();
    });
    this.recording = true;
    this.redoStack.push(entry);
    this.emit('history');
    this.commit();
  }

  redo(): void {
    const entry = this.redoStack.pop();
    if (!entry) return;
    this.recording = false;
    this.batch(() => {
      for (const op of entry.ops) op.redo();
    });
    this.recording = true;
    this.undoStack.push(entry);
    this.emit('history');
    this.commit();
  }

  clearHistory(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.emit('history');
  }

  // ── raw graph ops (no history) ────────────────────────────────────────

  private _insertNode(node: Node): void {
    this.nodes.set(node.id, node);
    this.nodeOrder.push(node.id);
    if (node.parentId) {
      let set = this.children.get(node.parentId);
      if (!set) {
        set = new Set();
        this.children.set(node.parentId, set);
      }
      set.add(node.id);
    }
    if (node.selected) this.selectedNodes.add(node.id);
    this.spatial.set(node.id, this.nodeRect(node.id));
    this.emit('nodes');
    this.emit(`node:${node.id}`);
    this.scheduleCull();
  }

  private _removeNode(id: string): void {
    const node = this.nodes.get(id);
    if (!node) return;
    this.nodes.delete(id);
    const i = this.nodeOrder.indexOf(id);
    if (i >= 0) this.nodeOrder.splice(i, 1);
    if (node.parentId) this.children.get(node.parentId)?.delete(id);
    this.children.delete(id);
    this.handles.delete(id);
    this.selectedNodes.delete(id);
    this.spatial.delete(id);
    this.emit('nodes');
    this.emit(`node:${id}`);
    this.scheduleCull();
  }

  private _replaceNode(node: Node): void {
    const prev = this.nodes.get(node.id);
    this.nodes.set(node.id, node);
    if (prev?.parentId !== node.parentId) {
      if (prev?.parentId) this.children.get(prev.parentId)?.delete(node.id);
      if (node.parentId) {
        let set = this.children.get(node.parentId);
        if (!set) {
          set = new Set();
          this.children.set(node.parentId, set);
        }
        set.add(node.id);
      }
      this.emit('nodes');
    }
    if (node.selected) this.selectedNodes.add(node.id);
    else this.selectedNodes.delete(node.id);
    this.touchNode(node.id);
  }

  private _insertEdge(edge: Edge): void {
    this.edges.set(edge.id, edge);
    this.edgeOrder.push(edge.id);
    for (const nid of [edge.source, edge.target]) {
      let set = this.nodeEdges.get(nid);
      if (!set) {
        set = new Set();
        this.nodeEdges.set(nid, set);
      }
      set.add(edge.id);
    }
    if (edge.selected) this.selectedEdges.add(edge.id);
    this.emit('edges');
    this.emit(`edge:${edge.id}`);
    this.scheduleCull();
  }

  private _removeEdge(id: string): void {
    const edge = this.edges.get(id);
    if (!edge) return;
    this.edges.delete(id);
    const i = this.edgeOrder.indexOf(id);
    if (i >= 0) this.edgeOrder.splice(i, 1);
    this.nodeEdges.get(edge.source)?.delete(id);
    this.nodeEdges.get(edge.target)?.delete(id);
    this.selectedEdges.delete(id);
    this.emit('edges');
    this.emit(`edge:${id}`);
  }

  private _replaceEdge(edge: Edge): void {
    const prev = this.edges.get(edge.id);
    if (prev && (prev.source !== edge.source || prev.target !== edge.target)) {
      this.nodeEdges.get(prev.source)?.delete(edge.id);
      this.nodeEdges.get(prev.target)?.delete(edge.id);
      for (const nid of [edge.source, edge.target]) {
        let set = this.nodeEdges.get(nid);
        if (!set) {
          set = new Set();
          this.nodeEdges.set(nid, set);
        }
        set.add(edge.id);
      }
    }
    this.edges.set(edge.id, edge);
    if (edge.selected) this.selectedEdges.add(edge.id);
    else this.selectedEdges.delete(edge.id);
    this.emit(`edge:${edge.id}`);
  }

  /** Re-index a node and notify it plus every edge touching it. */
  private touchNode(id: string): void {
    this.spatial.set(id, this.nodeRect(id));
    this.emit(`node:${id}`);
    const edges = this.nodeEdges.get(id);
    if (edges) for (const eid of edges) this.emit(`edge:${eid}`);
    const kids = this.children.get(id);
    if (kids) for (const kid of kids) this.touchNode(kid);
    this.scheduleCull();
  }

  // ── public graph API (history-aware) ──────────────────────────────────

  getNode(id: string): Node | undefined {
    return this.nodes.get(id);
  }

  getEdge(id: string): Edge | undefined {
    return this.edges.get(id);
  }

  getNodes(): Node[] {
    return this.nodeOrder.map((id) => this.nodes.get(id)!);
  }

  /** All edges connected to a node. */
  edgesOf(id: string): Edge[] {
    const set = this.nodeEdges.get(id);
    if (!set) return [];
    const out: Edge[] = [];
    for (const eid of set) out.push(this.edges.get(eid)!);
    return out;
  }

  /** Direct children ids of a node (subflow members). */
  childrenOf(id: string): string[] {
    const set = this.children.get(id);
    return set ? [...set] : [];
  }

  getEdges(): Edge[] {
    return this.edgeOrder.map((id) => this.edges.get(id)!);
  }

  addNodes(nodes: Node[]): void {
    if (nodes.length === 0) return;
    const copies = nodes.map((n) => ({ ...n }));
    this.batch(() => {
      for (const n of copies) this._insertNode(n);
    });
    this.record('add nodes', {
      undo: () =>
        this.batch(() => {
          for (const n of copies) this._removeNode(n.id);
        }),
      redo: () =>
        this.batch(() => {
          for (const n of copies) this._insertNode(n);
        }),
    });
    this.commit();
  }

  addNode(node: Node): void {
    this.addNodes([node]);
  }

  /**
   * Remove nodes plus their connected edges. Children of removed nodes are
   * re-parented to the flow root (keeping their absolute position) instead
   * of being orphaned.
   */
  removeNodes(ids: string[]): void {
    const doomed = ids.filter((id) => this.nodes.has(id) && this.nodes.get(id)!.deletable !== false);
    if (doomed.length === 0) return;
    const doomedSet = new Set(doomed);

    const removedNodes = doomed.map((id) => this.nodes.get(id)!);
    const removedEdges: Edge[] = [];
    for (const id of doomed) {
      const set = this.nodeEdges.get(id);
      if (set) {
        for (const eid of set) {
          const e = this.edges.get(eid);
          if (e && !removedEdges.includes(e)) removedEdges.push(e);
        }
      }
    }
    // Children that survive get re-parented to root at absolute position.
    const reparented: { before: Node; after: Node }[] = [];
    for (const id of doomed) {
      const kids = this.children.get(id);
      if (!kids) continue;
      for (const kid of kids) {
        if (doomedSet.has(kid)) continue;
        const child = this.nodes.get(kid)!;
        const abs = this.absolutePosition(kid);
        reparented.push({
          before: child,
          after: { ...child, parentId: undefined, position: abs },
        });
      }
    }

    this.batch(() => {
      for (const e of removedEdges) this._removeEdge(e.id);
      for (const r of reparented) this._replaceNode(r.after);
      for (const id of doomed) this._removeNode(id);
    });
    this.record('remove nodes', {
      undo: () =>
        this.batch(() => {
          for (const n of removedNodes) this._insertNode(n);
          for (const r of reparented) this._replaceNode(r.before);
          for (const e of removedEdges) this._insertEdge(e);
        }),
      redo: () =>
        this.batch(() => {
          for (const e of removedEdges) this._removeEdge(e.id);
          for (const r of reparented) this._replaceNode(r.after);
          for (const id of doomed) this._removeNode(id);
        }),
    });
    this.emit('selection');
    this.commit();
  }

  updateNode(id: string, patch: Partial<Node>): void {
    const prev = this.nodes.get(id);
    if (!prev) return;
    const next = { ...prev, ...patch, id };
    this._replaceNode(next);
    this.record('update node', {
      undo: () => this._replaceNode(prev),
      redo: () => this._replaceNode(next),
    });
    this.commit();
  }

  updateNodeData(id: string, dataPatch: Record<string, unknown>): void {
    const prev = this.nodes.get(id);
    if (!prev) return;
    this.updateNode(id, { data: { ...prev.data, ...dataPatch } });
  }

  setNodePosition(id: string, position: XY): void {
    const prev = this.nodes.get(id);
    if (!prev) return;
    const snapped = snapToGrid(position, this.options.snapGrid ?? 0);
    const next = { ...prev, position: snapped };
    this._replaceNode(next);
    this.record('move node', {
      undo: () => this._replaceNode(prev),
      redo: () => this._replaceNode(next),
    });
    this.commit();
  }

  /** Measured size update from the renderer — not recorded in history. */
  setNodeSize(id: string, width: number, height: number): void {
    const prev = this.nodes.get(id);
    if (!prev || (prev.width === width && prev.height === height)) return;
    this.nodes.set(id, { ...prev, width, height });
    this.touchNode(id);
  }

  addEdges(edges: Edge[]): void {
    const fresh = edges.filter((e) => !this.edges.has(e.id)).map((e) => ({ ...e }));
    if (fresh.length === 0) return;
    this.batch(() => {
      for (const e of fresh) this._insertEdge(e);
    });
    this.record('add edges', {
      undo: () =>
        this.batch(() => {
          for (const e of fresh) this._removeEdge(e.id);
        }),
      redo: () =>
        this.batch(() => {
          for (const e of fresh) this._insertEdge(e);
        }),
    });
    this.commit();
  }

  addEdge(edge: Edge): void {
    this.addEdges([edge]);
  }

  removeEdges(ids: string[]): void {
    const removed = ids
      .map((id) => this.edges.get(id))
      .filter((e): e is Edge => !!e && e.deletable !== false);
    if (removed.length === 0) return;
    this.batch(() => {
      for (const e of removed) this._removeEdge(e.id);
    });
    this.record('remove edges', {
      undo: () =>
        this.batch(() => {
          for (const e of removed) this._insertEdge(e);
        }),
      redo: () =>
        this.batch(() => {
          for (const e of removed) this._removeEdge(e.id);
        }),
    });
    this.emit('selection');
    this.commit();
  }

  updateEdge(id: string, patch: Partial<Edge>): void {
    const prev = this.edges.get(id);
    if (!prev) return;
    const next = { ...prev, ...patch, id };
    this._replaceEdge(next);
    this.record('update edge', {
      undo: () => this._replaceEdge(prev),
      redo: () => this._replaceEdge(next),
    });
    this.commit();
  }

  /** Replace the whole graph (used by controlled mode and loadSnapshot). */
  setGraph(nodes: Node[], edges: Edge[]): void {
    this.recording = false;
    this.batch(() => {
      for (const id of [...this.nodeOrder]) this._removeNode(id);
      for (const id of [...this.edgeOrder]) this._removeEdge(id);
      for (const n of nodes) this._insertNode({ ...n });
      for (const e of edges) this._insertEdge({ ...e });
      this.emit('selection');
    });
    this.recording = true;
  }

  // ── geometry helpers ──────────────────────────────────────────────────

  absolutePosition(id: string): XY {
    let node = this.nodes.get(id);
    if (!node) return { x: 0, y: 0 };
    let x = node.position.x;
    let y = node.position.y;
    let guard = 0;
    while (node?.parentId && guard++ < 100) {
      node = this.nodes.get(node.parentId);
      if (!node) break;
      x += node.position.x;
      y += node.position.y;
    }
    return { x, y };
  }

  nodeSize(id: string): { width: number; height: number } {
    const n = this.nodes.get(id);
    return {
      width: n?.width ?? DEFAULT_NODE_WIDTH,
      height: n?.height ?? DEFAULT_NODE_HEIGHT,
    };
  }

  /** Absolute rect of a node in flow coordinates. */
  nodeRect(id: string): Rect {
    const pos = this.absolutePosition(id);
    const size = this.nodeSize(id);
    return { x: pos.x, y: pos.y, width: size.width, height: size.height };
  }

  /** Union of all node rects (or the given subset). */
  nodesBounds(ids?: string[]): Rect {
    let acc: Rect | null = null;
    for (const id of ids ?? this.nodeOrder) {
      if (!this.nodes.has(id) || this.nodes.get(id)!.hidden) continue;
      acc = rectUnion(acc, this.nodeRect(id));
    }
    return acc ?? { x: 0, y: 0, width: 0, height: 0 };
  }

  /** Nodes whose rects intersect (or are fully inside) the given rect. */
  nodesInRect(rect: Rect, partially = true): string[] {
    const hits = this.spatial.query(rect);
    const out: string[] = [];
    for (const id of hits) {
      const n = this.nodes.get(id);
      if (!n || n.hidden || n.selectable === false) continue;
      if (partially) {
        out.push(id);
      } else {
        const r = this.nodeRect(id);
        if (
          r.x >= rect.x &&
          r.y >= rect.y &&
          r.x + r.width <= rect.x + rect.width &&
          r.y + r.height <= rect.y + rect.height
        ) {
          out.push(id);
        }
      }
    }
    return out;
  }

  // ── handles & edge geometry ───────────────────────────────────────────

  registerHandle(info: HandleInfo): void {
    let map = this.handles.get(info.nodeId);
    if (!map) {
      map = new Map();
      this.handles.set(info.nodeId, map);
    }
    const prev = map.get(info.id);
    if (
      prev &&
      prev.x === info.x &&
      prev.y === info.y &&
      prev.side === info.side &&
      prev.kind === info.kind
    ) {
      return;
    }
    map.set(info.id, info);
    const edges = this.nodeEdges.get(info.nodeId);
    if (edges) for (const eid of edges) this.emit(`edge:${eid}`);
    this.emit('connection');
  }

  unregisterHandle(nodeId: string, handleId: string): void {
    this.handles.get(nodeId)?.delete(handleId);
  }

  getHandles(nodeId: string): HandleInfo[] {
    const map = this.handles.get(nodeId);
    return map ? [...map.values()] : [];
  }

  /**
   * Resolve the handle an edge endpoint attaches to. Falls back to a
   * synthetic border-midpoint handle when nothing is registered (headless
   * usage, or nodes without <Handle> children).
   */
  resolveHandle(nodeId: string, kind: HandleKind, handleId?: string): HandleInfo {
    const map = this.handles.get(nodeId);
    if (map) {
      if (handleId != null) {
        const h = map.get(handleId);
        if (h) return h;
      }
      for (const h of map.values()) if (h.kind === kind) return h;
    }
    const size = this.nodeSize(nodeId);
    const side = kind === 'source' ? 'right' : 'left';
    const anchor = sideAnchor({ x: 0, y: 0, ...size }, side);
    return { id: handleId ?? `__${kind}`, nodeId, kind, side, x: anchor.x, y: anchor.y };
  }

  /** Absolute anchor point of a handle. */
  handleAnchor(h: HandleInfo): XY {
    const pos = this.absolutePosition(h.nodeId);
    return { x: pos.x + h.x, y: pos.y + h.y };
  }

  /** Endpoint geometry for rendering an edge. */
  edgeGeometry(
    edge: Edge
  ): { source: XY; sourceSide: HandleInfo['side']; target: XY; targetSide: HandleInfo['side'] } | null {
    if (!this.nodes.has(edge.source) || !this.nodes.has(edge.target)) return null;
    const sh = this.resolveHandle(edge.source, 'source', edge.sourceHandle);
    const th = this.resolveHandle(edge.target, 'target', edge.targetHandle);
    return {
      source: this.handleAnchor(sh),
      sourceSide: sh.side,
      target: this.handleAnchor(th),
      targetSide: th.side,
    };
  }

  // ── selection ─────────────────────────────────────────────────────────

  setSelection(nodeIds: Iterable<string>, edgeIds: Iterable<string> = []): void {
    const nextNodes = new Set(nodeIds);
    const nextEdges = new Set(edgeIds);
    if (setsEqual(nextNodes, this.selectedNodes) && setsEqual(nextEdges, this.selectedEdges)) {
      return;
    }
    this.batch(() => {
      for (const id of [...this.selectedNodes]) {
        if (!nextNodes.has(id)) {
          const n = this.nodes.get(id);
          if (n) this._replaceNode({ ...n, selected: false });
        }
      }
      for (const id of nextNodes) {
        const n = this.nodes.get(id);
        if (n && !n.selected) this._replaceNode({ ...n, selected: true });
      }
      for (const id of [...this.selectedEdges]) {
        if (!nextEdges.has(id)) {
          const e = this.edges.get(id);
          if (e) this._replaceEdge({ ...e, selected: false });
        }
      }
      for (const id of nextEdges) {
        const e = this.edges.get(id);
        if (e && !e.selected) this._replaceEdge({ ...e, selected: true });
      }
      this.emit('selection');
    });
  }

  addToSelection(nodeIds: Iterable<string>, edgeIds: Iterable<string> = []): void {
    this.setSelection(
      [...this.selectedNodes, ...nodeIds],
      [...this.selectedEdges, ...edgeIds]
    );
  }

  toggleSelection(nodeId?: string, edgeId?: string): void {
    const nodes = new Set(this.selectedNodes);
    const edges = new Set(this.selectedEdges);
    if (nodeId) nodes.has(nodeId) ? nodes.delete(nodeId) : nodes.add(nodeId);
    if (edgeId) edges.has(edgeId) ? edges.delete(edgeId) : edges.add(edgeId);
    this.setSelection(nodes, edges);
  }

  clearSelection(): void {
    this.setSelection([], []);
  }

  selectAll(): void {
    this.setSelection(
      this.nodeOrder.filter((id) => this.nodes.get(id)!.selectable !== false),
      this.edgeOrder
    );
  }

  deleteSelection(): void {
    const nodeIds = [...this.selectedNodes];
    const edgeIds = [...this.selectedEdges];
    if (nodeIds.length === 0 && edgeIds.length === 0) return;
    this.transact('delete selection', () => {
      this.removeEdges(edgeIds);
      this.removeNodes(nodeIds);
    });
    this.commit();
  }

  // ── dragging (with grid snap + alignment guides) ──────────────────────

  startDrag(ids: string[]): void {
    const moving = ids.filter((id) => {
      const n = this.nodes.get(id);
      return n && n.draggable !== false;
    });
    if (moving.length === 0) return;
    const movingSet = new Set(moving);
    const start = new Map<string, XY>();
    for (const id of moving) start.set(id, { ...this.nodes.get(id)!.position });

    const guideRects: Rect[] = [];
    if (this.options.alignmentGuides !== false) {
      const view = this.cullingActive
        ? this.visibleNodes
        : new Set(this.nodeOrder);
      for (const id of view) {
        if (movingSet.has(id)) continue;
        // Skip nodes inside the moving subtree.
        let p = this.nodes.get(id)?.parentId;
        let inside = false;
        while (p) {
          if (movingSet.has(p)) {
            inside = true;
            break;
          }
          p = this.nodes.get(p)?.parentId;
        }
        if (!inside && !this.nodes.get(id)?.hidden) guideRects.push(this.nodeRect(id));
      }
    }
    this.drag = { ids: moving, start, guideRects, moved: false };
  }

  /** Move the dragged nodes by a flow-space delta from the drag origin. */
  dragBy(delta: XY): void {
    const drag = this.drag;
    if (!drag) return;
    let dx = delta.x;
    let dy = delta.y;

    const grid = this.options.snapGrid ?? 0;
    let guides: Guide[] = [];

    // Alignment guides: snap the union bounds of the moving nodes.
    if (this.options.alignmentGuides !== false && drag.guideRects.length > 0) {
      let bounds: Rect | null = null;
      for (const id of drag.ids) {
        const startPos = drag.start.get(id)!;
        const node = this.nodes.get(id)!;
        const abs = this.absolutePosition(id);
        const size = this.nodeSize(id);
        // Absolute rect at the tentative position.
        const rect: Rect = {
          x: abs.x - node.position.x + startPos.x + dx,
          y: abs.y - node.position.y + startPos.y + dy,
          width: size.width,
          height: size.height,
        };
        bounds = rectUnion(bounds, rect);
      }
      if (bounds) {
        const res = computeGuides(bounds, drag.guideRects, this.options.guideThreshold ?? 6);
        dx += res.dx;
        dy += res.dy;
        guides = res.guides;
      }
    }

    this.batch(() => {
      for (const id of drag.ids) {
        const node = this.nodes.get(id);
        const startPos = drag.start.get(id);
        if (!node || !startPos) continue;
        let pos = { x: startPos.x + dx, y: startPos.y + dy };
        if (grid > 0) pos = snapToGrid(pos, grid);
        if (node.extent === 'parent' && node.parentId) {
          const parentSize = this.nodeSize(node.parentId);
          const size = this.nodeSize(id);
          pos = {
            x: clamp(pos.x, 0, Math.max(0, parentSize.width - size.width)),
            y: clamp(pos.y, 0, Math.max(0, parentSize.height - size.height)),
          };
        }
        if (pos.x !== node.position.x || pos.y !== node.position.y) {
          this.nodes.set(id, { ...node, position: pos });
          this.touchNode(id);
          drag.moved = true;
        }
      }
      this.setGuides(guides);
    });
  }

  endDrag(): void {
    const drag = this.drag;
    this.drag = null;
    this.setGuides([]);
    if (!drag || !drag.moved) return;
    const before = drag.start;
    const after = new Map<string, XY>();
    for (const id of drag.ids) {
      const n = this.nodes.get(id);
      if (n) after.set(id, { ...n.position });
    }
    this.record('move', {
      undo: () =>
        this.batch(() => {
          for (const [id, pos] of before) {
            const n = this.nodes.get(id);
            if (n) {
              this.nodes.set(id, { ...n, position: pos });
              this.touchNode(id);
            }
          }
        }),
      redo: () =>
        this.batch(() => {
          for (const [id, pos] of after) {
            const n = this.nodes.get(id);
            if (n) {
              this.nodes.set(id, { ...n, position: pos });
              this.touchNode(id);
            }
          }
        }),
    });
    this.commit();
  }

  get dragging(): boolean {
    return this.drag !== null;
  }

  private setGuides(guides: Guide[]): void {
    if (guides.length === 0 && this.guides.length === 0) return;
    this.guides = guides;
    this.emit('guides');
  }

  // ── connections ───────────────────────────────────────────────────────

  startConnection(nodeId: string, handleId?: string, kind: HandleKind = 'source'): void {
    const node = this.nodes.get(nodeId);
    if (!node || node.connectable === false) return;
    const handle = this.resolveHandle(nodeId, kind, handleId);
    this.connection = {
      fromNode: nodeId,
      fromHandle: handle,
      to: this.handleAnchor(handle),
      toHandle: null,
      valid: null,
    };
    this.emit('connection');
  }

  moveConnection(to: XY): void {
    if (!this.connection) return;
    const snap = this.findCompatibleHandle(to, 28);
    this.connection = {
      ...this.connection,
      to: snap ? this.handleAnchor(snap.handle) : to,
      toHandle: snap?.handle ?? null,
      valid: snap ? snap.valid : null,
    };
    this.emit('connection');
  }

  /** Complete the pending connection; returns the new edge if created. */
  endConnection(): Edge | null {
    const conn = this.connection;
    this.connection = null;
    this.emit('connection');
    if (!conn || !conn.toHandle || !conn.valid) return null;
    const from = conn.fromHandle;
    const to = conn.toHandle;
    const candidate: ConnectionCandidate =
      from.kind === 'source'
        ? {
            source: from.nodeId,
            sourceHandle: from.id,
            target: to.nodeId,
            targetHandle: to.id,
          }
        : {
            source: to.nodeId,
            sourceHandle: to.id,
            target: from.nodeId,
            targetHandle: from.id,
          };
    return this.connect(candidate);
  }

  cancelConnection(): void {
    if (!this.connection) return;
    this.connection = null;
    this.emit('connection');
  }

  /** Validate and create an edge (respecting defaultEdgeOptions). */
  connect(candidate: ConnectionCandidate, props: Partial<Edge> = {}): Edge | null {
    const verdict = this.validateCandidate(candidate);
    if (verdict !== true) return null;
    const edge: Edge = {
      id: uid('e'),
      type: 'bezier',
      ...this.options.defaultEdgeOptions,
      ...props,
      source: candidate.source,
      target: candidate.target,
      sourceHandle: candidate.sourceHandle,
      targetHandle: candidate.targetHandle,
    };
    this.addEdges([edge]);
    return this.edges.get(edge.id) ?? null;
  }

  /** Returns true, or a string describing why the connection is invalid. */
  validateCandidate(c: ConnectionCandidate): true | string {
    if (!this.nodes.has(c.source) || !this.nodes.has(c.target)) return 'missing node';
    if (c.source === c.target) return 'self loop';

    if (!this.options.allowDuplicateEdges) {
      const set = this.nodeEdges.get(c.source);
      if (set) {
        for (const eid of set) {
          const e = this.edges.get(eid)!;
          if (
            e.source === c.source &&
            e.target === c.target &&
            (e.sourceHandle ?? null) === (c.sourceHandle ?? null) &&
            (e.targetHandle ?? null) === (c.targetHandle ?? null)
          ) {
            return 'duplicate edge';
          }
        }
      }
    }

    const sh = this.resolveHandle(c.source, 'source', c.sourceHandle);
    const th = this.resolveHandle(c.target, 'target', c.targetHandle);

    if (sh.dataType && th.dataType && sh.dataType !== th.dataType) return 'incompatible types';

    for (const h of [sh, th]) {
      if (h.maxConnections != null && this.handleConnectionCount(h) >= h.maxConnections) {
        return 'handle full';
      }
    }

    if (this.options.preventCycles && this.wouldCreateCycle(c.source, c.target)) {
      return 'cycle';
    }

    const custom = this.options.validateConnection;
    if (custom) {
      const res = custom(c, { sourceHandle: sh, targetHandle: th });
      if (res !== true) return typeof res === 'string' ? res : 'rejected';
    }
    return true;
  }

  handleConnectionCount(h: HandleInfo): number {
    const set = this.nodeEdges.get(h.nodeId);
    if (!set) return 0;
    let count = 0;
    for (const eid of set) {
      const e = this.edges.get(eid)!;
      if (h.kind === 'source' && e.source === h.nodeId && (e.sourceHandle ?? `__source`) === h.id) count++;
      if (h.kind === 'target' && e.target === h.nodeId && (e.targetHandle ?? `__target`) === h.id) count++;
    }
    return count;
  }

  /** Would adding source→target create a directed cycle? */
  wouldCreateCycle(source: string, target: string): boolean {
    if (source === target) return true;
    const stack = [target];
    const seen = new Set<string>();
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (id === source) return true;
      if (seen.has(id)) continue;
      seen.add(id);
      const set = this.nodeEdges.get(id);
      if (set) {
        for (const eid of set) {
          const e = this.edges.get(eid)!;
          if (e.source === id) stack.push(e.target);
        }
      }
    }
    return false;
  }

  /** Nearest compatible opposite-kind handle within `radius` flow px. */
  findCompatibleHandle(
    p: XY,
    radius: number
  ): { handle: HandleInfo; valid: boolean } | null {
    const conn = this.connection;
    if (!conn) return null;
    const wantKind: HandleKind = conn.fromHandle.kind === 'source' ? 'target' : 'source';
    const searchRect: Rect = {
      x: p.x - radius,
      y: p.y - radius,
      width: radius * 2,
      height: radius * 2,
    };
    // Handles sit on node borders, so search nodes near the pointer
    // (expanded to catch handles that poke outside the node rect).
    const near = this.spatial.query(expandRect(searchRect, 16));
    let best: { handle: HandleInfo; d: number } | null = null;
    for (const nodeId of near) {
      if (nodeId === conn.fromNode) continue;
      const node = this.nodes.get(nodeId);
      if (!node || node.hidden || node.connectable === false) continue;
      const registered = this.handles.get(nodeId);
      const candidates: HandleInfo[] = registered
        ? [...registered.values()].filter((h) => h.kind === wantKind)
        : [this.resolveHandle(nodeId, wantKind)];
      for (const h of candidates) {
        const anchor = this.handleAnchor(h);
        const d = Math.hypot(anchor.x - p.x, anchor.y - p.y);
        if (d <= radius && (!best || d < best.d)) best = { handle: h, d };
      }
    }
    if (!best) return null;
    const from = conn.fromHandle;
    const candidate: ConnectionCandidate =
      from.kind === 'source'
        ? {
            source: from.nodeId,
            sourceHandle: from.id,
            target: best.handle.nodeId,
            targetHandle: best.handle.id,
          }
        : {
            source: best.handle.nodeId,
            sourceHandle: best.handle.id,
            target: from.nodeId,
            targetHandle: from.id,
          };
    return { handle: best.handle, valid: this.validateCandidate(candidate) === true };
  }

  // ── viewport ──────────────────────────────────────────────────────────

  setScreenSize(width: number, height: number): void {
    if (this.screen.width === width && this.screen.height === height) return;
    this.screen = { width, height };
    this.scheduleCull();
  }

  setViewport(v: Viewport): void {
    const minZoom = this.options.minZoom ?? 0.1;
    const maxZoom = this.options.maxZoom ?? 2.5;
    const next = { x: v.x, y: v.y, zoom: clamp(v.zoom, minZoom, maxZoom) };
    if (
      next.x === this.viewport.x &&
      next.y === this.viewport.y &&
      next.zoom === this.viewport.zoom
    ) {
      return;
    }
    this.viewport = next;
    this.emit('viewport');
    this.scheduleCull();
  }

  panBy(dx: number, dy: number): void {
    this.setViewport({ x: this.viewport.x + dx, y: this.viewport.y + dy, zoom: this.viewport.zoom });
  }

  /** Zoom by factor around a screen-space pivot (defaults to center). */
  zoomBy(factor: number, pivot?: XY): void {
    const p = pivot ?? { x: this.screen.width / 2, y: this.screen.height / 2 };
    this.setViewport(
      zoomAt(this.viewport, factor, p, this.options.minZoom ?? 0.1, this.options.maxZoom ?? 2.5)
    );
  }

  zoomTo(zoom: number, duration = 0): void {
    const c = { x: this.screen.width / 2, y: this.screen.height / 2 };
    const target = zoomAt(
      this.viewport,
      zoom / this.viewport.zoom,
      c,
      this.options.minZoom ?? 0.1,
      this.options.maxZoom ?? 2.5
    );
    this.animateViewport(target, duration);
  }

  fitView(opts: FitViewOptions = {}): void {
    if (this.screen.width === 0 || this.screen.height === 0) return;
    const bounds = this.nodesBounds(opts.nodes);
    if (bounds.width === 0 && bounds.height === 0) return;
    const target = fitRect(
      bounds,
      this.screen.width,
      this.screen.height,
      opts.padding ?? 0.1,
      opts.minZoom ?? this.options.minZoom ?? 0.05,
      opts.maxZoom ?? this.options.maxZoom ?? 2.5
    );
    this.animateViewport(target, opts.duration ?? 0);
  }

  /** Center the view on a node (nice for search/jump UX). */
  centerNode(id: string, duration = 300): void {
    const r = this.spatial.getBounds(id);
    if (!r || this.screen.width === 0) return;
    const zoom = this.viewport.zoom;
    this.animateViewport(
      {
        x: this.screen.width / 2 - (r.x + r.width / 2) * zoom,
        y: this.screen.height / 2 - (r.y + r.height / 2) * zoom,
        zoom,
      },
      duration
    );
  }

  animateViewport(target: Viewport, duration = 300): void {
    if (this.vpAnim != null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.vpAnim);
      this.vpAnim = null;
    }
    if (duration <= 0 || typeof requestAnimationFrame === 'undefined') {
      this.setViewport(target);
      return;
    }
    const from = { ...this.viewport };
    const start = performance.now();
    const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const tick = (now: number): void => {
      const t = clamp((now - start) / duration, 0, 1);
      const k = ease(t);
      this.setViewport({
        x: from.x + (target.x - from.x) * k,
        y: from.y + (target.y - from.y) * k,
        zoom: from.zoom + (target.zoom - from.zoom) * k,
      });
      this.vpAnim = t < 1 ? requestAnimationFrame(tick) : null;
    };
    this.vpAnim = requestAnimationFrame(tick);
  }

  // ── culling ───────────────────────────────────────────────────────────

  private scheduleCull(): void {
    if (this.cullScheduled) return;
    this.cullScheduled = true;
    rafSchedule(() => {
      this.cullScheduled = false;
      this.cull();
    });
  }

  /** Recompute the visible node/edge sets; emits 'visible' on change. */
  cull(): void {
    const total = this.nodes.size;
    const threshold = 200;
    const active = this.screen.width > 0 && total > threshold;

    let nextNodes: Set<string>;
    if (active) {
      const margin = this.options.cullingMargin ?? 200;
      const view = expandRect(
        visibleRect(this.viewport, this.screen.width, this.screen.height),
        margin
      );
      nextNodes = this.spatial.query(view);
      // Selected + dragged nodes always render.
      for (const id of this.selectedNodes) nextNodes.add(id);
      if (this.drag) for (const id of this.drag.ids) nextNodes.add(id);
    } else {
      nextNodes = new Set(this.nodeOrder);
    }

    const nextRoots = new Set<string>();
    for (const id of nextNodes) {
      let node = this.nodes.get(id);
      let cur = id;
      let guard = 0;
      while (node?.parentId && guard++ < 100) {
        cur = node.parentId;
        node = this.nodes.get(cur);
      }
      if (node) nextRoots.add(cur);
    }
    // Children of visible roots render with their parent.
    const stack = [...nextRoots];
    while (stack.length > 0) {
      const id = stack.pop()!;
      const kids = this.children.get(id);
      if (kids) {
        for (const kid of kids) {
          if (!nextNodes.has(kid)) nextNodes.add(kid);
          stack.push(kid);
        }
      }
    }

    const nextEdges = new Set<string>();
    if (active) {
      for (const eid of this.edgeOrder) {
        const e = this.edges.get(eid)!;
        if (e.hidden) continue;
        if (nextNodes.has(e.source) || nextNodes.has(e.target)) nextEdges.add(eid);
      }
    } else {
      for (const eid of this.edgeOrder) nextEdges.add(eid);
    }

    const changed =
      this.cullingActive !== active ||
      !setsEqual(nextRoots, this.visibleRoots) ||
      !setsEqual(nextEdges, this.visibleEdges);
    this.visibleNodes = nextNodes;
    this.visibleRoots = nextRoots;
    this.visibleEdges = nextEdges;
    this.cullingActive = active;
    if (changed) this.emit('visible');
  }

  // ── serialization ─────────────────────────────────────────────────────

  toSnapshot(): FlowSnapshot {
    return {
      version: 1,
      nodes: this.getNodes().map((n) => ({ ...n })),
      edges: this.getEdges().map((e) => ({ ...e })),
      viewport: { ...this.viewport },
    };
  }

  loadSnapshot(snap: FlowSnapshot): void {
    this.batch(() => {
      this.setGraph(snap.nodes, snap.edges);
      if (snap.viewport) this.setViewport(snap.viewport);
    });
    this.clearHistory();
    this.commit();
  }
}
