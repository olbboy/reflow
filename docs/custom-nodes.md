# Custom nodes & edges

## Custom nodes

A node type is just a React component. Register it in `nodeTypes` and
reference it with `node.type`:

```tsx
import { Handle, type NodeProps } from '@reflow/react';

interface MetricData {
  label: string;
  value: number;
}

function MetricNode({ id, data, selected }: NodeProps<MetricData>) {
  return (
    <div className={`metric ${selected ? 'metric-selected' : ''}`}>
      <Handle kind="target" side="left" />
      <strong>{data.label}</strong>
      <span>{data.value}</span>
      <Handle kind="source" side="right" />
    </div>
  );
}

<ReFlow
  nodeTypes={{ metric: MetricNode }}
  defaultNodes={[{ id: 'm1', type: 'metric', position: { x: 0, y: 0 }, data: { label: 'CPU', value: 42 } }]}
/>;
```

Notes:

- **Size is measured automatically** (one shared ResizeObserver). Set
  `node.width`/`node.height` to skip measurement — worth doing for
  huge graphs of fixed-size nodes.
- Memoize `nodeTypes` (module scope or `useMemo`) so the tree doesn't
  re-render on every parent render.
- Interactive elements (`input`, `button`, links, `[contenteditable]`, or
  anything with the `rf-nodrag` class) don't start drags.
- Inside a node component, `useNodeId()` returns the current node id and
  `useReflow()` gives you the API — a node can edit itself:

```tsx
const flow = useReflow();
const id = useNodeId();
<input
  className="rf-nodrag"
  onChange={(e) => flow.updateNodeData(id, { label: e.target.value })}
/>;
```

## Handles

```tsx
<Handle
  kind="source"          // 'source' | 'target'
  side="bottom"          // which node side; affects edge routing
  id="out-2"             // required when a node has several of one kind
  dataType="image"       // typed port: only equal dataTypes connect
  maxConnections={1}     // reject when full
/>
```

Handles register their measured position, so edges anchor exactly wherever
you render them — nested markup, flex layouts, anything.

## Multiple handles

```tsx
function Splitter() {
  return (
    <div className="splitter">
      <Handle kind="target" side="left" />
      <Handle kind="source" side="right" id="pass" style={{ top: '30%' }} />
      <Handle kind="source" side="right" id="fail" style={{ top: '70%' }} />
    </div>
  );
}
// edge: { source: 'splitter-1', sourceHandle: 'fail', target: … }
```

## Custom edges

Edge components receive precomputed geometry — no path math needed:

```tsx
import type { EdgeProps } from '@reflow/react';

function GlowEdge({ path, labelX, labelY, edge, selected }: EdgeProps) {
  return (
    <>
      <path className="rf-edge-hit" d={path} />
      <path d={path} fill="none" stroke={selected ? '#f0f' : '#a0f'} strokeWidth={3} filter="url(#glow)" />
      <text x={labelX} y={labelY}>{edge.label}</text>
    </>
  );
}

<ReFlow edgeTypes={{ glow: GlowEdge }} … />;
```

Built-in path types: `bezier` (default), `smoothstep`, `step`, `straight`.
Need raw waypoints for orthogonal routing? `stepWaypoints()` from
`@reflow/core` returns them.

## Groups / subflows

```tsx
const nodes = [
  { id: 'group', type: 'group', position: { x: 0, y: 0 }, width: 420, height: 260, data: { label: 'Stage 1' } },
  { id: 'child', parentId: 'group', extent: 'parent', position: { x: 30, y: 50 }, data: { label: 'Inside' } },
];
```

- Children position relative to the parent and move with it — no extra
  renders.
- `extent: 'parent'` keeps children inside while dragging.
- Deleting a parent re-parents children to the root (positions preserved).

## Validation

Beyond typed ports, plug in your own rule — return `true` or a reason
string:

```tsx
<ReFlow
  preventCycles
  validateConnection={(candidate, { sourceHandle, targetHandle }) => {
    if (candidate.source === 'root' && candidate.target === 'sink') return 'not directly';
    return true;
  }}
/>
```

The connection line turns red on invalid targets while dragging, and
`store.validateCandidate()` gives you the same answer programmatically.
