# Real-time collaboration

ReFlow ships a transport-agnostic collaboration layer in `@reflow/core` — no
mandatory dependency, no lock-in. `Collab` captures local graph changes as
element-level patches and applies remote ones, converging via Lamport-clock
last-write-wins. Wire it to **any** transport: WebSocket, `BroadcastChannel`,
WebRTC, or a Yjs `Y.Doc`.

## Minimal (BroadcastChannel, same-origin tabs)

```ts
import { Collab, FlowStore } from '@reflow/core';

const channel = new BroadcastChannel('my-flow');
const collab = new Collab(store, {
  peerId: crypto.randomUUID(),
  broadcast: (patch) => channel.postMessage(patch),
});
channel.onmessage = (e) => collab.receive(e.data);

// Onboard a peer that joins later:
channel.onmessage = (e) => {
  if (e.data.type === 'join') channel.postMessage(collab.fullState());
  else collab.receive(e.data);
};
```

Guarantees:

- **Deterministic convergence.** Each changed element carries a Lamport
  version; higher wins, ties broken by `peerId`. Peers converge to the same
  graph regardless of message order (unit-tested both directions).
- **No echo.** A peer never re-broadcasts a change it received.
- **Remote edits skip local undo** — you don't `⌘Z` a teammate's change.

## With Yjs (production CRDT + offline)

For offline support, large sessions, and battle-tested conflict resolution,
bridge `Collab` to a Yjs `Y.Doc`. `@reflow/core` stays zero-dependency; Yjs is
yours to add.

```ts
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { Collab } from '@reflow/core';

const doc = new Y.Doc();
new WebsocketProvider('wss://your-server', 'room-1', doc);
const yNodes = doc.getMap('nodes');
const yEdges = doc.getMap('edges');
let applyingRemote = false;

const collab = new Collab(store, {
  peerId: doc.clientID.toString(),
  broadcast: (patch) => {
    applyingRemote = true;
    doc.transact(() => {
      for (const n of patch.nodes?.upsert ?? []) yNodes.set(n.id, n);
      for (const id of patch.nodes?.remove ?? []) yNodes.delete(id);
      for (const e of patch.edges?.upsert ?? []) yEdges.set(e.id, e);
      for (const id of patch.edges?.remove ?? []) yEdges.delete(id);
    });
    applyingRemote = false;
  },
});

const observe = (map, kind) => map.observe((ev) => {
  if (applyingRemote) return;
  const upsert = [], remove = [];
  ev.changes.keys.forEach((c, id) => (c.action === 'delete' ? remove : upsert).push(c.action === 'delete' ? id : map.get(id)));
  collab.receive({ origin: 'yjs', [kind]: { upsert, remove } });
});
observe(yNodes, 'nodes');
observe(yEdges, 'edges');
```

This exact pattern is exercised end-to-end in
`packages/core/test/collab-yjs.test.ts` (two independent `Y.Doc`s syncing a
ReFlow store).

## Presence (cursors, selection, identity)

`Presence` is the same idea for ephemeral state:

```ts
import { Presence } from '@reflow/core';

const presence = new Presence({
  peerId,
  broadcast: (state) => channel.postMessage({ presence: state }),
  onChange: (peers) => setRemotePeers(peers), // React state
});

// Broadcast your cursor as it moves (in flow coordinates):
const flow = useReflow();
onPointerMove = (e) => presence.update({ cursor: flow.screenToFlow({ x: e.clientX, y: e.clientY }) });
// And your selection (PeerState.selection is a string[] of node ids):
useOnSelectionChange(({ nodes }) => presence.update({ selection: nodes.map((n) => n.id) }));
```

Render remote peers with the `RemoteCursors` helper from `@reflow/react`:

```tsx
import { RemoteCursors } from '@reflow/react';
<ReFlow …>
  <RemoteCursors peers={remotePeers} />
</ReFlow>
```

Stale peers (no update within `timeout`, default 15 s) are pruned
automatically; call `presence.remove(id)` on a hard disconnect.

## What this is and isn't

- ✅ Deterministic multi-peer graph convergence + presence, transport-free.
- ✅ Drop-in Yjs bridge for offline/scale.
- ⚠️ The built-in `Collab` is element-level LWW, not text-CRDT: two peers
  editing the *same node's label* concurrently keep one whole value, not a
  merged string. For collaborative rich-text inside a node, put a `Y.Text` in
  that node's data and bind it separately.
