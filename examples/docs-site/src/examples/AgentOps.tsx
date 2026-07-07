import { useRef } from 'react';
import { ReFlow, Background, Panel, useReflow, applyOperations, type FlowOperation } from '@reflow/react';

// Build a graph the way an AI agent would: a stream of JSON operations.
const script: FlowOperation[] = [
  { op: 'add_node', id: 'in', label: 'User query', type: 'input' },
  { op: 'add_node', id: 'retr', label: 'Retrieve' },
  { op: 'add_node', id: 'rank', label: 'Rerank' },
  { op: 'add_node', id: 'llm', label: 'LLM' },
  { op: 'add_node', id: 'out', label: 'Answer', type: 'output' },
  { op: 'connect', source: 'in', target: 'retr' },
  { op: 'connect', source: 'retr', target: 'rank' },
  { op: 'connect', source: 'rank', target: 'llm' },
  { op: 'connect', source: 'llm', target: 'out' },
  { op: 'layout', type: 'layered', direction: 'LR' },
];

function Runner() {
  const flow = useReflow();
  const running = useRef(false);
  const run = async () => {
    if (running.current) return;
    running.current = true;
    applyOperations(flow.store, [{ op: 'clear' }]);
    for (const op of script) {
      applyOperations(flow.store, [op], { transact: false });
      await new Promise((r) => setTimeout(r, 220));
    }
    running.current = false;
  };
  return (
    <Panel position="top-right">
      <button onClick={run}>▶ run agent</button>
    </Panel>
  );
}

export function AgentOps() {
  return (
    <ReFlow defaultNodes={[]} defaultEdges={[]} fitViewOnInit={false}>
      <Background />
      <Runner />
      <Panel position="bottom-center">applyOperations(store, ops) — validated, undoable, streamed</Panel>
    </ReFlow>
  );
}
