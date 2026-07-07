# Changelog

All notable changes to ReFlow are documented here. This project follows
[Semantic Versioning](https://semver.org). Until `1.0.0`, minor versions may
contain breaking changes to APIs marked **experimental** in
[API_STABILITY.md](./API_STABILITY.md); **stable** APIs will not break within
`0.x` without a minor bump and a migration note.

## [Unreleased]

### Added — testing & reproducibility
- **Cross-browser + touch E2E matrix** (`playwright.config.ts`,
  `e2e/core-flow.spec.ts`): 18 assertion-based tests over Chromium, Firefox,
  WebKit, and a mobile-touch profile (render, drag, undo, connect, 10k
  culling, tap-select). Run with `npm run test:e2e`; wired into CI as a
  dedicated `e2e` job. Replaces the old fire-and-forget console.log smoke.

### Fixed
- **Benchmark now reproducible on any machine.** `benchmarks/run.mjs` (and
  `scripts/e2e-smoke.mjs`) hard-coded a CI-only Chromium path
  (`/opt/pw-browsers/chromium`), so `npm run bench` failed everywhere else.
  Now resolves the browser from `PLAYWRIGHT_CHROMIUM_PATH` → pinned CI path →
  Playwright's own install, in that order.
- **README honesty pass.** The "Honesty" note listed orthogonal routing and
  CRDT collaboration as not-yet-done, though both ship with passing tests;
  corrected. Test count updated (67 → 132); dev commands now list
  `test:e2e` and `bench`.

### Added — Tier 3 differentiators
- **Orthogonal edge routing with obstacle avoidance** (`routeOrthogonal`,
  `roundedPath`): Hanan-grid A* with a turn penalty routes edges *around*
  nodes. New `'orthogonal'` edge type re-routes live as obstacles move
  (`store.edgeObstacles`, `store.graphVersion`).
- **Real-time collaboration** (`Collab`, `Presence`): transport-agnostic,
  zero-dependency; Lamport-clock last-write-wins gives order-independent
  convergence. Verified against a real Yjs CRDT. `RemoteCursors` React
  component. `store.applyRemotePatch`.
- **Worker + incremental layout**: `runLayoutJob`/`layoutWorkerHandler`/
  `layoutInWorker` run layouts off the main thread (tested in a real
  `worker_threads` worker); `incrementalLayout` places new nodes without
  moving the existing graph; `layoutAsync`/`layoutIncremental` on the React
  API.
- **Interactive docs site** (`examples/docs-site`, `npm run dev:docs`): six
  live, runnable examples with source shown side-by-side.

### Added
- **`@reflow/compat`** — React Flow (xyflow) API compatibility layer.
  Migrate an existing React Flow app by changing imports: `ReactFlow`,
  `Handle` (`type`/`position`), `Position`, `MarkerType`, `useReactFlow`,
  `useNodesState`/`useEdgesState`, `applyNodeChanges`/`applyEdgeChanges`,
  `addEdge`, `reconnectEdge`, `ReactFlowProvider`.
- **NodeResizer** — 8-grip drag-to-resize with min/max + aspect ratio; one
  undo entry per gesture.
- **NodeToolbar** — floating, zoom-stable per-node toolbar.
- **Edge reconnection** — drag a selected edge's endpoint to a new handle
  (validated); drop-to-void deletes, invalid target reverts.
- **Clipboard** — `copy` / `paste` / `duplicateSelection` on the store,
  wired to ⌘C/⌘V/⌘D/⌘X; groups copy with children, ids remapped, one undo.
- **Accessibility** — focusable nodes (`tabIndex`, `role`, `aria-label`,
  `aria-selected`, `aria-roledescription`), focus-selects, focus ring,
  Alt+Arrow spatial navigation, `store.nearestNodeInDirection`.
- **`useOnSelectionChange`**, **`useSelectionCount`** hooks.
- **Head-to-head benchmark harness** (`npm run bench`) vs React Flow with
  movement verification; results in [benchmarks/BENCHMARKS.md](./benchmarks/BENCHMARKS.md).
- **Fuzz tests** for `applyOperations` (never-throw / no-corruption guarantee).

### Fixed
- **Spatial-index DoS (2 variants), caught by the new fuzz test** — a node
  with a huge dimension (e.g. `height: 1e308`) or an extreme coordinate made
  `SpatialIndex.cellKeys` loop effectively forever (the second case because
  `index++` stops advancing past 2⁵³). Both now flag the rect as "oversized"
  and keep it out of the grid. Directly relevant to validating agent/LLM
  output — a hostile node size could otherwise freeze the app.
- **`applyOperations` input sanitization** — numeric fields (position, width,
  height) are coerced to finite, range-clamped numbers; ids/handles/labels to
  strings; node/edge id lists to string arrays. A `Symbol`, `NaN`, or
  non-array previously reached arithmetic/`for…of` and threw, violating the
  never-throw contract. Fuzz-tested across 30 seeds.
- **Culling regression** — zooming in from an all-visible overview left every
  node rendered because the pan-hysteresis skipped the re-cull when the new
  (smaller) view was contained in the old region. Culling now re-runs on any
  zoom change. This was the single biggest real-world performance bug; it cut
  10k-node zoomed-in DOM nodes from 10,000 to ~143 and pan from ~4fps to ~44fps.
- Duplicate-edge detection now treats synthetic default-handle ids
  (`__source`/`__target`) as equal to unset handles.
- `useFlowSelector` no longer corrupts topic names whose ids contain the
  previous `|` join separator.
- Per-edge version counters are cleaned up on edge removal (no small leak).

### Changed
- README performance claims replaced with a reproducible, movement-verified
  benchmark. The earlier "~55fps" figure was unverified and has been removed —
  see [CLAIMS.md](./CLAIMS.md) for the full honesty audit.

## [0.1.0] — initial

- `@reflow/core`: headless engine — reactive store, spatial-hash culling,
  edge path math, five auto-layouts, undo/redo, graph algorithms, AI
  operations layer.
- `@reflow/react`: renderer — `<ReFlow>`, `Handle`, `Background`, `MiniMap`
  (canvas), `Controls`, `Panel`, hooks, light/dark theme.
