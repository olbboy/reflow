import { ReFlow, Background, Panel } from '@reflow/react';

// Orthogonal edges route AROUND obstacle nodes — drag the middle nodes.
const nodes = [
  { id: 'src', position: { x: 20, y: 180 }, data: { label: 'Source' }, width: 110, height: 46 },
  { id: 'dst', position: { x: 560, y: 180 }, data: { label: 'Target' }, width: 110, height: 46 },
  { id: 'o1', position: { x: 230, y: 160 }, data: { label: 'obstacle' }, width: 100, height: 84 },
  { id: 'o2', position: { x: 390, y: 160 }, data: { label: 'obstacle' }, width: 100, height: 84 },
];
const edges = [
  { id: 'e', source: 'src', target: 'dst', type: 'orthogonal', markerEnd: { type: 'arrowclosed' as const } },
];

export function Routing() {
  return (
    <ReFlow defaultNodes={nodes} defaultEdges={edges}>
      <Background />
      <Panel position="bottom-center">drag an obstacle — the edge re-routes live</Panel>
    </ReFlow>
  );
}
