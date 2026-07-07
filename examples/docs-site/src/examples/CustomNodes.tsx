import { ReFlow, Background, Handle, useReflow, useNodeId, type NodeProps } from '@reflow/react';

// A custom node that edits its own data — no reducers, no change handlers.
function CounterNode({ data }: NodeProps) {
  const flow = useReflow();
  const id = useNodeId();
  const count = (data as { count?: number }).count ?? 0;
  return (
    <div style={{ padding: 14, borderRadius: 10, background: 'var(--rf-node-bg)', border: '1px solid var(--rf-node-border)', boxShadow: 'var(--rf-node-shadow)', minWidth: 130 }}>
      <Handle kind="target" side="left" />
      <div style={{ fontWeight: 650 }}>{(data as { label?: string }).label}</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
        <button className="rf-nodrag" onClick={() => flow.updateNodeData(id, { count: count - 1 })}>−</button>
        <strong style={{ minWidth: 20, textAlign: 'center' }}>{count}</strong>
        <button className="rf-nodrag" onClick={() => flow.updateNodeData(id, { count: count + 1 })}>+</button>
      </div>
      <Handle kind="source" side="right" />
    </div>
  );
}

const nodeTypes = { counter: CounterNode };
const nodes = [
  { id: 'a', type: 'counter', position: { x: 60, y: 60 }, data: { label: 'Left', count: 2 } },
  { id: 'b', type: 'counter', position: { x: 340, y: 160 }, data: { label: 'Right', count: 0 } },
];

export function CustomNodes() {
  return (
    <ReFlow defaultNodes={nodes} defaultEdges={[{ id: 'e', source: 'a', target: 'b' }]} nodeTypes={nodeTypes}>
      <Background />
    </ReFlow>
  );
}
