# Core concepts & API

## Architecture

```
@reflow/core            @reflow/react
┌─────────────────┐     ┌──────────────────────────┐
│ FlowStore        │◄────│ <ReFlow> renderer         │
│  · nodes/edges   │     │  · NodeView (per-node sub)│
│  · spatial index │     │  · EdgeView (per-edge sub)│
│  · history       │     │  · direct-DOM viewport    │
│  · validation    │     │  · Handle / MiniMap / …   │
│ layouts          │     │ hooks (useReflow, …)      │
│ algorithms       │     └──────────────────────────┘
│ path math        │
└─────────────────┘  zero dependencies · runs in Node
```

The store publishes **topics**; renderers subscribe to exactly what they
draw:

| Topic | Fires when |
| --- | --- |
| `node:<id>` / `edge:<id>` | that element (or its geometry) changed |
| `nodes` / `edges` | membership changed |
| `viewport` | pan/zoom |
| `selection`, `connection`, `guides`, `history`, `visible` | respective state |
| `commit` | a meaningful mutation boundary (persist here) |
| `graph` | coarse: anything moved/changed (throttle it) |

```ts
const unsub = store.subscribe('node:a', () => console.log(store.getNode('a')));
```

## FlowStore

```ts
import { FlowStore } from '@reflow/core';

const store = new FlowStore({
  nodes, edges,
  minZoom: 0.1, maxZoom: 2.5,
  snapGrid: 0,
  alignmentGuides: true,
  preventCycles: false,
  historyLimit: 200,
  defaultEdgeOptions: { type: 'smoothstep' },
  validateConnection: (candidate, ctx) => true,
});
```

Selected methods (all history-aware unless noted):

- Graph: `addNodes` `removeNodes` `updateNode` `updateNodeData`
  `setNodePosition` `addEdges` `removeEdges` `updateEdge` `setGraph`(diff,
  no history) `getNodes` `getEdges` `edgesOf` `childrenOf`
- Selection: `setSelection` `addToSelection` `toggleSelection` `selectAll`
  `clearSelection` `deleteSelection`
- History: `undo` `redo` `canUndo` `canRedo` `transact(label, fn)`
  `clearHistory`
- Connections: `connect` `validateCandidate` `startConnection`
  `moveConnection` `endConnection` `wouldCreateCycle`
- Drag: `startDrag(ids)` `dragBy(delta)` `endDrag()` (guides + snapping +
  one history entry)
- Viewport: `setViewport` `panBy` `zoomBy` `zoomTo` `fitView` `centerNode`
  `animateViewport` `setScreenSize`
- Geometry: `nodeRect` `nodesBounds` `nodesInRect` `absolutePosition`
  `resolveHandle` `edgeGeometry`
- Persistence: `toSnapshot()` / `loadSnapshot(snap)` — versioned JSON

## Layouts

```ts
import { layout, computeLayout, applyLayout } from '@reflow/core';

layout(store, 'layered', { direction: 'LR', nodeGap: 48, rankGap: 96 });
const positions = computeLayout(store, 'force', { linkDistance: 200 }); // Map<id, XY>
applyLayout(store, positions); // one undoable transaction
```

Types: `layered` (Sugiyama: cycle-safe ranking, barycenter ordering,
size-aware coordinates) · `tree` · `force` (seeded, deterministic) ·
`radial` · `grid`. Pure functions (`layeredLayout(nodes, edges, opts)` etc.)
are exported for headless use.

## Algorithms

```ts
topologicalSort(store)          // string[] | null (null = cycle)
hasCycle(store)
connectedComponents(store)      // string[][]
shortestPath(store, 'a', 'z', { directed: false })
getAncestors(store, id); getDescendants(store, id)
getIncomers(store, id); getOutgoers(store, id)
getConnectedEdges(store, ids)
```

## Path math

```ts
import { bezierPath, smoothStepPath, stepPath, straightPath, stepWaypoints } from '@reflow/core';

const { d, label } = smoothStepPath({
  source: { x: 0, y: 0 }, sourceSide: 'right',
  target: { x: 300, y: 120 }, targetSide: 'left',
  borderRadius: 8,
});
```

## Theming

Override CSS variables on `.rf-container` (or any ancestor):

```css
.my-flow {
  --rf-accent: #f59e0b;
  --rf-node-radius: 4px;
  --rf-bg: #fffbeb;
  --rf-edge: #d97706;
}
```

Full token list in [`packages/react/src/styles.css`](../packages/react/src/styles.css).
`colorMode="dark" | "light" | "auto"` switches the built-in palettes.

## SSR

`@reflow/core` is DOM-free. `@reflow/react` guards all browser APIs —
`<ReFlow>` renders on the server and hydrates cleanly; measurements and
culling kick in on mount.
