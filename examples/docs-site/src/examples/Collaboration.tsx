import { useEffect, useMemo, useState } from 'react';
import { ReFlow, Background, Panel, RemoteCursors, FlowContext } from '@reflow/react';
import { Collab, Presence, FlowStore, screenToFlow, type GraphPatch, type PeerState } from '@reflow/core';

/**
 * Two live canvases sharing edits + cursors through an in-memory channel —
 * the exact Collab/Presence API you'd wire to a WebSocket or Yjs. Drag a node
 * in one panel and watch it move in the other; move your pointer to share a
 * cursor.
 */

// A tiny event bus standing in for the network transport.
const bus = (() => {
  const map = new Map<string, Set<(v: unknown) => void>>();
  return {
    on: (t: string, f: (v: unknown) => void) => {
      if (!map.has(t)) map.set(t, new Set());
      map.get(t)!.add(f);
    },
    off: (t: string, f: (v: unknown) => void) => map.get(t)?.delete(f),
    emit: (t: string, v: unknown) => map.get(t)?.forEach((f) => f(v)),
  };
})();

const initialNodes = [
  { id: 'a', position: { x: 60, y: 60 }, data: { label: 'Shared' } },
  { id: 'b', position: { x: 260, y: 170 }, data: { label: 'Graph' } },
];

function Canvas({ peerId, name, color }: { peerId: string; name: string; color: string }) {
  const store = useMemo(
    () => new FlowStore({ nodes: initialNodes, edges: [{ id: 'e', source: 'a', target: 'b' }] }),
    []
  );
  const [remote, setRemote] = useState<PeerState[]>([]);

  useEffect(() => {
    const collab = new Collab(store, { peerId, broadcast: (p) => bus.emit('graph', p) });
    const presence = new Presence({ peerId, broadcast: (s) => bus.emit('cursor', s), onChange: setRemote });
    presence.update({ name, color });
    const onGraph = (p: unknown) => collab.receive(p as GraphPatch);
    const onCursor = (s: unknown) => presence.receive(s as PeerState);
    bus.on('graph', onGraph);
    bus.on('cursor', onCursor);
    (store as unknown as { _presence: Presence })._presence = presence;
    return () => {
      bus.off('graph', onGraph);
      bus.off('cursor', onCursor);
      collab.destroy();
    };
  }, [store, peerId, name, color]);

  const onPointerMove = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const p = screenToFlow({ x: e.clientX - rect.left, y: e.clientY - rect.top }, store.viewport);
    (store as unknown as { _presence?: Presence })._presence?.update({ cursor: p, name, color });
  };

  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0 }} onPointerMove={onPointerMove}>
      <FlowContext.Provider value={store}>
        <ReFlow fitViewOnInit={false}>
          <Background />
          <RemoteCursors peers={remote} />
          <Panel position="top-left" style={{ color, fontWeight: 700 }}>
            {name}
          </Panel>
        </ReFlow>
      </FlowContext.Provider>
    </div>
  );
}

export function Collaboration() {
  return (
    <div style={{ display: 'flex', height: '100%', gap: 1, background: 'var(--rf-node-border)' }}>
      <Canvas peerId="p1" name="Ada" color="#6366f1" />
      <Canvas peerId="p2" name="Grace" color="#10b981" />
    </div>
  );
}
