# Getting started

## Install

```bash
npm install @reflow/react
```

`@reflow/react` re-exports everything from `@reflow/core`, so one import
covers most apps.

## Your first flow

```tsx
import { ReFlow, Background, Controls, MiniMap } from '@reflow/react';
import '@reflow/react/styles.css';

const nodes = [
  { id: '1', position: { x: 0, y: 0 }, data: { label: 'Extract' } },
  { id: '2', position: { x: 260, y: 0 }, data: { label: 'Transform', description: 'dedupe + clean' } },
  { id: '3', position: { x: 520, y: 0 }, data: { label: 'Load' } },
];

const edges = [
  { id: 'e1', source: '1', target: '2', animated: true },
  { id: 'e2', source: '2', target: '3', markerEnd: { type: 'arrowclosed' } },
];

export default function App() {
  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <ReFlow defaultNodes={nodes} defaultEdges={edges}>
        <Background variant="dots" />
        <Controls />
        <MiniMap />
      </ReFlow>
    </div>
  );
}
```

The container must have a size — ReFlow fills whatever box you give it.

## Two ways to manage state

### Uncontrolled (recommended)

Pass `defaultNodes` / `defaultEdges` and mutate through the API. ReFlow owns
the state; you get undo/redo, transactions and fine-grained rendering for
free:

```tsx
const flow = useReflow(); // inside <ReFlow>, or under <ReFlowProvider>

flow.addNode({ id: 'x', position: { x: 100, y: 100 }, data: { label: 'New' } });
flow.updateNodeData('x', { label: 'Renamed' });
flow.connect({ source: '1', target: 'x' });
flow.removeNodes(['x']);
flow.undo();
```

Subscribe to committed changes when you need to persist:

```tsx
<ReFlow defaultNodes={nodes} onNodesChange={saveNodes} onEdgesChange={saveEdges} />
```

`onNodesChange` fires at meaningful boundaries (drag end, add/remove, undo…)
— not on every drag frame.

### Controlled

Pass `nodes` / `edges` props; ReFlow diff-syncs them into its store
(selection and measurements survive). Combine with `onNodesChange` to close
the loop:

```tsx
const [nodes, setNodes] = useState(initial);
<ReFlow nodes={nodes} onNodesChange={setNodes} … />
```

## Hooks

| Hook | Returns |
| --- | --- |
| `useReflow()` | the imperative API (`addNode`, `layout`, `fitView`, `undo`, …) |
| `useNodes()` / `useEdges()` | all nodes/edges, updated on commits |
| `useNode(id)` / `useEdge(id)` | one element, fine-grained |
| `useSelection()` | `{ nodes: string[], edges: string[] }` |
| `useHistory()` | `{ canUndo, canRedo, undo, redo }` |
| `useViewport()` | `{ x, y, zoom }` (updates every pan frame) |
| `useConnection()` | in-progress connection state or `null` |

To use hooks outside the canvas (toolbars, sidebars), wrap both in
`<ReFlowProvider>`:

```tsx
<ReFlowProvider>
  <Toolbar />
  <ReFlow … />
</ReFlowProvider>
```

## Common options

```tsx
<ReFlow
  minZoom={0.1} maxZoom={2.5}
  snapGrid={16}                 // snap dragging to a 16px grid
  alignmentGuides               // Figma-style guides (default on)
  preventCycles                 // refuse loop-creating connections
  defaultEdgeOptions={{ type: 'smoothstep', markerEnd: { type: 'arrowclosed' } }}
  colorMode="auto"              // 'light' | 'dark' | 'auto'
  readOnly={false}
  selectionOnDrag={false}       // plain-drag box select instead of pan
  onConnect={(edge) => console.log('connected', edge)}
  onNodeClick={(e, node) => …}
  onPaneContextMenu={(e, flowPos) => …}
/>
```

## Keyboard

| Keys | Action |
| --- | --- |
| `Delete` / `Backspace` | delete selection |
| `⌘/Ctrl Z` · `⌘/Ctrl ⇧ Z` / `Ctrl Y` | undo · redo |
| `⌘/Ctrl A` | select all |
| Arrows (+`⇧` for ×10) | nudge selection |
| `Esc` | cancel connection / clear selection |
| `Shift` + drag | box select |
