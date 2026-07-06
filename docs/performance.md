# Performance guide

ReFlow is architected so interaction cost scales with what's **on screen**,
not with graph size. This page explains the machinery and how to get the
most out of it.

## What ReFlow does for you

| Mechanism | Effect |
| --- | --- |
| Topic-scoped subscriptions | dragging node X re-renders X and its edges — nothing else |
| Direct-DOM viewport | pan/zoom never causes a React render |
| Spatial hash index | visibility queries and hit tests are O(result), not O(n) |
| Culling + hysteresis | offscreen nodes aren't mounted; re-culls happen when the view escapes an overscan region, not per frame |
| Batched measurement | one ResizeObserver for the whole flow; handle positions measured in a single read→write pass |
| Canvas MiniMap | ~1 ms repaints at 10k nodes |
| Per-edge versioning | edges recompute geometry only when their endpoints actually moved |
| Level-of-detail | handles and edge labels hidden below 0.35 zoom |

Culling activates automatically above 200 nodes (selected/dragged nodes are
always rendered). Tune the overscan with `cullingMargin` (flow px) in store
options.

## What you should do

1. **Give huge graphs fixed sizes.** `width`/`height` on a node skips
   ResizeObserver registration entirely. For 10k nodes this noticeably
   cuts mount time.

2. **Memoize `nodeTypes`/`edgeTypes`.** Defining them inline creates new
   identities each render and re-renders the whole tree:

   ```tsx
   const nodeTypes = { metric: MetricNode }; // module scope — perfect
   ```

3. **Prefer `useNode(id)` over `useNodes()`** inside components that care
   about one node. `useNodes()` re-renders on every commit.

4. **Batch bulk mutations.**

   ```tsx
   flow.transact('import', () => {
     flow.addNodes(thousands);
     flow.addEdges(links);
   }); // one history entry, one commit, one cull
   ```

5. **Keep node components cheap.** They render inside a transformed layer;
   avoid `filter`/`backdrop-filter` on thousands of elements.

## Measured results

Environment: 1440×900, headless Chromium with **software rendering** (no
GPU), Vite dev build with React StrictMode — i.e. worse than any production
setup.

| Scenario | Result |
| --- | --- |
| 10,000 nodes / 10,000 edges, editor zoom | ~300 nodes in DOM, pan ≈ 55 fps |
| Same, fully zoomed out (~5k nodes on screen) | interactive, ~25 fps |
| Drag one node in a 10k graph | re-renders: 1 node + its edges |
| MiniMap repaint at 10k nodes | ≈ 1 ms (canvas) |
| 100 viewport queries over 10k indexed rects | < 100 ms total (unit-tested bound; typically ~5 ms) |

Reproduce with `npm run dev`, the 10k tab, and the FPS meter — or
`node scripts/e2e-smoke.mjs`.

## Headless / server-side

`@reflow/core` has zero dependencies and no DOM requirements: run layouts,
validation and graph algorithms in Node.js, workers, or tests at native
speed. The `layeredLayout` of 1000 nodes completes in well under 2 s
(unit-tested bound; typically ~50 ms).
