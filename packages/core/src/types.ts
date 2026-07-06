/** A 2D point in flow (world) coordinates. */
export interface XY {
  x: number;
  y: number;
}

/** An axis-aligned rectangle in flow coordinates. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The side of a node a handle sits on. */
export type Side = 'left' | 'right' | 'top' | 'bottom';

/** Camera state: `screen = flow * zoom + (x, y)`. */
export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

/** Whether a handle emits connections (source) or accepts them (target). */
export type HandleKind = 'source' | 'target';

/**
 * A registered connection point on a node. Offsets are relative to the
 * node's top-left corner, in unscaled pixels.
 */
export interface HandleInfo {
  id: string;
  nodeId: string;
  kind: HandleKind;
  side: Side;
  /** Offset of the handle center relative to the node origin. */
  x: number;
  y: number;
  /** Optional port type used by typed-connection validation. */
  dataType?: string;
  /** Maximum simultaneous connections (Infinity when undefined). */
  maxConnections?: number;
}

export interface Node<T = Record<string, unknown>> {
  id: string;
  /** Rendering type key, resolved against the nodeTypes registry. */
  type?: string;
  /** Position relative to the parent node (or the flow origin). */
  position: XY;
  data: T;
  /** Fixed or measured size. Measured sizes are kept in the store. */
  width?: number;
  height?: number;
  parentId?: string;
  /** Constrain dragging of children to the parent bounds. */
  extent?: 'parent';
  hidden?: boolean;
  selected?: boolean;
  draggable?: boolean;
  selectable?: boolean;
  connectable?: boolean;
  /** Prevents deletion via keyboard/API helpers. */
  deletable?: boolean;
  zIndex?: number;
  /** Arbitrary inline style passed to the node wrapper. */
  style?: Record<string, string | number>;
  className?: string;
  /** Accessible label; falls back to data.label. */
  ariaLabel?: string;
}

export type EdgePathType = 'bezier' | 'smoothstep' | 'step' | 'straight';

export type MarkerType = 'arrow' | 'arrowclosed' | 'dot';

export interface EdgeMarker {
  type: MarkerType;
  color?: string;
  size?: number;
}

export interface Edge<T = Record<string, unknown>> {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  /** Path style or a custom edge type key. */
  type?: EdgePathType | (string & {});
  label?: string;
  animated?: boolean;
  selected?: boolean;
  hidden?: boolean;
  deletable?: boolean;
  selectable?: boolean;
  data?: T;
  markerStart?: EdgeMarker;
  markerEnd?: EdgeMarker;
  zIndex?: number;
  style?: Record<string, string | number>;
  className?: string;
}

/** A connection in progress (while the user drags from a handle). */
export interface ConnectionState {
  fromNode: string;
  fromHandle: HandleInfo;
  /** Current pointer position in flow coordinates. */
  to: XY;
  /** Snapped target handle when hovering a compatible handle. */
  toHandle: HandleInfo | null;
  valid: boolean | null;
}

/** Parameters describing a would-be connection, passed to validators. */
export interface ConnectionCandidate {
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export type ConnectionValidator = (
  candidate: ConnectionCandidate,
  ctx: { sourceHandle?: HandleInfo; targetHandle?: HandleInfo }
) => boolean | string;

/** An alignment guide produced while dragging (Figma-style helper line). */
export interface Guide {
  axis: 'x' | 'y';
  /** Position of the line on the given axis, in flow coordinates. */
  value: number;
  /** Extent of the line along the other axis. */
  from: number;
  to: number;
}

export interface FitViewOptions {
  padding?: number;
  minZoom?: number;
  maxZoom?: number;
  /** Restrict fitting to these node ids. */
  nodes?: string[];
  /** Animate the transition (handled by the renderer). */
  duration?: number;
}

/** Serializable snapshot of a flow. */
export interface FlowSnapshot {
  version: 1;
  nodes: Node[];
  edges: Edge[];
  viewport: Viewport;
}

export interface StoreOptions {
  nodes?: Node[];
  edges?: Edge[];
  viewport?: Viewport;
  minZoom?: number;
  maxZoom?: number;
  /** Grid size for snap-to-grid. 0 disables snapping. */
  snapGrid?: number;
  /** Enable Figma-style alignment guides + snapping while dragging. */
  alignmentGuides?: boolean;
  /** Snap distance (flow px) for alignment guides. */
  guideThreshold?: number;
  /** Maximum history entries kept for undo. */
  historyLimit?: number;
  /** Custom connection validation. */
  validateConnection?: ConnectionValidator;
  /** Disallow connections that would create a cycle. */
  preventCycles?: boolean;
  /** Allow multiple edges between the same handle pair. */
  allowDuplicateEdges?: boolean;
  /** Margin (in flow px) added around the viewport for culling. */
  cullingMargin?: number;
  /** Default edge options applied to user-created connections. */
  defaultEdgeOptions?: Partial<Edge>;
}

/** Topics emitted by the store. */
export type StoreTopic =
  | 'nodes'
  | 'edges'
  | 'viewport'
  | 'selection'
  | 'connection'
  | 'guides'
  | 'visible'
  | 'history'
  | 'commit'
  | `node:${string}`
  | `edge:${string}`;

export type NodeChange =
  | { type: 'add'; node: Node }
  | { type: 'remove'; id: string }
  | { type: 'position'; id: string; position: XY }
  | { type: 'size'; id: string; width: number; height: number }
  | { type: 'select'; id: string; selected: boolean }
  | { type: 'update'; id: string; node: Node };

export type EdgeChange =
  | { type: 'add'; edge: Edge }
  | { type: 'remove'; id: string }
  | { type: 'select'; id: string; selected: boolean }
  | { type: 'update'; id: string; edge: Edge };
