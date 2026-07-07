import { ReFlow, Background, Controls, MiniMap } from '@reflow/react';

const nodes = [
  { id: '1', position: { x: 40, y: 40 }, data: { label: 'Extract' }, type: 'input' },
  { id: '2', position: { x: 260, y: 120 }, data: { label: 'Transform', description: 'clean + dedupe' } },
  { id: '3', position: { x: 500, y: 40 }, data: { label: 'Load' }, type: 'output' },
];
const edges = [
  { id: 'e1', source: '1', target: '2', animated: true },
  { id: 'e2', source: '2', target: '3', markerEnd: { type: 'arrowclosed' as const } },
];

export function Basic() {
  return (
    <ReFlow defaultNodes={nodes} defaultEdges={edges}>
      <Background />
      <Controls />
      <MiniMap />
    </ReFlow>
  );
}
