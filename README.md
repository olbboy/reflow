<div align="center">

# ◆ ReFlow

**Node-based UIs for React, reimagined.**

The fastest, most complete open source library for building flow editors,
workflow builders, data pipelines and node graphs with React —
with the features other libraries put behind a paywall built in and free.

[Quick start](#quick-start) · [Why ReFlow](#why-reflow) · [Features](#features) · [Docs](./docs/getting-started.md) · [Live demo](#run-the-demo)

![ReFlow showcase](./docs/assets/showcase-light.png)

</div>

---

## Why ReFlow

React Flow (xyflow) made node-based UIs mainstream. ReFlow starts where it
stops — every row in this table is a deliberate design decision, not an
add-on:

| | **ReFlow** | React Flow (xyflow) |
| --- | --- | --- |
| Undo / redo | ✅ Built in, transactional, drag-coalescing | 💰 Pro example, DIY |
| Auto-layout | ✅ Built in: layered, tree, force, radial, grid — zero deps | 💰 Pro example + dagre/elkjs |
| Alignment guides + snapping | ✅ Built in, Figma-style | 💰 Pro example ("helper lines") |
| Viewport culling | ✅ On by default, spatial-index backed, hysteresis | ⚠️ Opt-in, linear scan |
| Re-render on drag | ✅ Only the dragged node + its edges | ⚠️ Store-wide change dispatch |
| Pan / zoom | ✅ Direct DOM transform — **zero** React renders | ⚠️ Renders through the store |
| MiniMap | ✅ Canvas — 10k nodes ≈ 1 ms per repaint | ⚠️ One SVG React element per node |
| Typed ports | ✅ `dataType` + `maxConnections` on handles, cycle prevention | ⚠️ Single `isValidConnection` callback |
| Graph algorithms | ✅ Topo sort, cycle detect, components, shortest path, ancestors | ⚠️ `getIncomers` / `getOutgoers` |
| State management | ✅ `useReflow()` — no reducers, no change handlers | ⚠️ `onNodesChange` + `applyNodeChanges` boilerplate |
| Headless core | ✅ `@reflow/core` — zero dependencies, runs anywhere | ⚠️ `@xyflow/system` (depends on d3-zoom/d3-drag) |
| Default look | ✅ Polished theme, dark mode, animations out of the box | ⚠️ Gray boxes |
| License | ✅ MIT, everything free | MIT + paid Pro examples |

**10,000-node stress test** (dev build, software rendering, 1440×900):
smooth pan at ~55 fps with ~300 nodes in the DOM. The spatial hash index,
culling hysteresis and batched measurements keep interaction cost
proportional to what you *see*, not what you *have*.

## Quick start

```bash
npm install @reflow/react
```

```tsx
import { ReFlow, Background, Controls, MiniMap } from '@reflow/react';
import '@reflow/react/styles.css';

const nodes = [
  { id: 'a', position: { x: 0, y: 0 }, data: { label: 'Hello' } },
  { id: 'b', position: { x: 260, y: 80 }, data: { label: 'World', description: 'it just works' } },
];
const edges = [{ id: 'e1', source: 'a', target: 'b', animated: true }];

export default function App() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ReFlow defaultNodes={nodes} defaultEdges={edges}>
        <Background />
        <Controls />
        <MiniMap />
      </ReFlow>
    </div>
  );
}
```

That's the whole app. Pan, zoom, drag, connect, box-select, delete,
**undo/redo**, alignment guides, dark mode — all already working.
No `onNodesChange`, no `applyNodeChanges`, no state wiring.

### Drive it imperatively

```tsx
import { useReflow } from '@reflow/react';

function Toolbar() {
  const flow = useReflow();
  return (
    <>
      <button onClick={() => flow.addNode({ id: crypto.randomUUID(), position: { x: 0, y: 0 }, data: { label: 'New' } })}>
        Add
      </button>
      <button onClick={() => flow.layout('layered', { duration: 300 })}>Auto layout</button>
      <button onClick={() => flow.undo()}>Undo</button>
      <button onClick={() => flow.fitView({ duration: 300 })}>Fit</button>
    </>
  );
}
```

## Features

### ⚡ Performance as architecture, not an afterthought

- **Fine-grained reactivity** — every node and edge subscribes to its own
  topic (`node:<id>`, `edge:<id>`). Dragging one node re-renders one node
  and its edges. Nothing else.
- **Zero-render pan/zoom** — the viewport transform is written straight to
  the DOM. React is not involved in a single pan frame.
- **Spatial hash culling** — only visible nodes are mounted, with overscan
  hysteresis so panning doesn't churn mounts every frame.
- **Batched measurement** — one shared `ResizeObserver`, and handle
  positions are measured in a single read-then-write pass (no layout
  thrashing when 500 nodes mount at once).
- **Canvas MiniMap** — repaints 10k nodes in about a millisecond.

### 🎨 Beautiful by default

Light and dark themes with a modern look — soft shadows, hover elevation,
selection rings, animated edges — all themeable with CSS variables
(`--rf-accent`, `--rf-node-bg`, …). `colorMode="auto"` follows the OS.

![Dark mode](./docs/assets/showcase-dark.png)

### 🧭 Built-in auto-layout (no dagre, no elkjs)

```tsx
flow.layout('layered', { direction: 'LR' }); // Sugiyama-style, handles cycles
flow.layout('tree');                          // tidy trees & forests
flow.layout('force', { linkDistance: 180 });  // deterministic (seeded) FR
flow.layout('radial');                        // BFS rings
flow.layout('grid', { columns: 8 });
```

Every layout is a single undoable transaction and knows about node sizes,
subflows and cycles.

![Auto layout](./docs/assets/auto-layout.png)

### ↩️ Real undo/redo

Every mutation is recorded with its inverse. Drags coalesce into one entry.
Group anything with `flow.transact('label', () => { ... })`. `⌘Z` / `⌘⇧Z`
work out of the box, and `useHistory()` gives you reactive
`canUndo`/`canRedo` for your own UI.

### 🔌 Typed, validated connections

```tsx
<Handle kind="source" side="right" dataType="tensor" maxConnections={1} />
```

Incompatible types can't connect. Full handles are rejected. Set
`preventCycles` and edges that would create a loop are refused — validated
live while dragging, with the connection line turning red.

### 📐 Figma-style alignment guides

Drag a node near another's edge or center: guide lines appear and the node
snaps. On by default (`alignmentGuides={false}` to disable), plus optional
`snapGrid`.

### 🧩 Custom everything

```tsx
function MetricNode({ data, selected }: NodeProps<{ kpi: string }>) {
  return (
    <div className={selected ? 'ring' : ''}>
      <Handle kind="target" side="left" />
      {data.kpi}
      <Handle kind="source" side="right" />
    </div>
  );
}
<ReFlow nodeTypes={{ metric: MetricNode }} … />
```

Handles are measured automatically — put them anywhere in your markup and
edges anchor exactly. Custom edges get precomputed geometry
(`path`, `labelX/Y`, endpoints) as props.

### 🗂 Subflows & groups

`parentId` nests nodes; children move with their parent for free (one
transform, not N re-renders). `extent: 'parent'` clamps children inside.
Deleting a group re-parents children instead of orphaning them.

### 🧠 A real graph library underneath

```ts
import { topologicalSort, hasCycle, connectedComponents, shortestPath,
         getAncestors, getDescendants, getIncomers, getOutgoers } from '@reflow/core';
```

`@reflow/core` is headless and dependency-free — use it in Node.js for
server-side validation, tests, or CLI tooling with the exact engine the UI
runs.

### And also

Controlled *or* uncontrolled modes · box selection · keyboard shortcuts
(delete, select-all, arrow-nudge) · edge labels & markers · animated edges ·
`bezier` / `smoothstep` / `step` / `straight` paths · MiniMap
drag-to-navigate · `fitView`/`centerNode` with smooth animation ·
save/restore snapshots · SSR-safe · touch support via pointer events ·
level-of-detail rendering when zoomed out.

## Packages

| Package | What it is |
| --- | --- |
| [`@reflow/core`](./packages/core) | Headless engine: store, spatial index, paths, layouts, history, algorithms. Zero dependencies. |
| [`@reflow/react`](./packages/react) | React renderer: `<ReFlow>`, components, hooks, theme. Depends only on core + React. |

## Run the demo

```bash
git clone https://github.com/olbboy/reflow && cd reflow
npm install
npm run dev   # showcase + 1k/5k/10k stress scenes at http://localhost:5173
```

## Development

```bash
npm run build      # build both packages
npm test           # 67 unit tests (vitest)
npm run typecheck  # strict TS across packages
node scripts/e2e-smoke.mjs  # browser smoke test (requires `npm run dev` on :5199)
```

## Documentation

- [Getting started](./docs/getting-started.md)
- [Custom nodes & edges](./docs/custom-nodes.md)
- [Performance guide](./docs/performance.md)
- [Core concepts & API](./docs/api.md)

## License

[MIT](./LICENSE) — every feature above is free, forever.
