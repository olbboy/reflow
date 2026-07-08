# Changelog

All notable changes to RealFlow are documented here. This project follows
[Semantic Versioning](https://semver.org). Until `1.0.0`, minor versions may
contain breaking changes to APIs marked **experimental** in
[API_STABILITY.md](./API_STABILITY.md); **stable** APIs will not break within
`0.x` without a minor bump and a migration note.

## [Unreleased]

## [0.2.1] — 2026-07-08

### Added
- Per-package READMEs for `@realflow/core`, `@realflow/react` and
  `@realflow/compat` so each package page on npm has full documentation.

## [0.2.0] — 2026-07-08

### Added
- **`@realflow/compat`** — a React Flow (xyflow) API-compatibility layer. Migrate
  an existing app by changing imports: `ReactFlow`, `Handle` (`type`/`position`),
  `Position`, `MarkerType`, `useReactFlow`, `useNodesState`/`useEdgesState`,
  `applyNodeChanges`/`applyEdgeChanges`, `addEdge`, `reconnectEdge`,
  `ReactFlowProvider`. See [docs/migration.md](./docs/migration.md).
- **Orthogonal edge routing with obstacle avoidance** — the `'orthogonal'` edge
  type routes *around* nodes (Hanan-grid A* + turn penalty) and re-routes live
  as obstacles move.
- **Real-time collaboration** — transport-agnostic `Collab` (Lamport-clock
  last-write-wins, order-independent convergence), `Presence`, and a
  `RemoteCursors` component. Verified against a real Yjs CRDT.
- **Off-thread + incremental auto-layout** — `layoutInWorker` runs layouts in a
  real `worker_threads` worker; `incrementalLayout` places new nodes without
  moving the existing graph; `layoutAsync` / `layoutIncremental` on the React API.
- **Provider-agnostic AI agent** (`examples/ai-agent`) — a zero-SDK `fetch`
  bridge that turns a natural-language goal into validated operations using GLM,
  Gemini or Anthropic (whichever key is set) and applies them as one
  transactional turn. See [docs/ai-integration.md](./docs/ai-integration.md).
- **Real shadcn/ui + Base UI demo nodes** — the "UI frameworks" tab builds nodes
  from the actual `@radix-ui/*` and `@base-ui-components/react` primitives.
- **NodeResizer** (8-grip, min/max + aspect ratio), **NodeToolbar**
  (zoom-stable), **edge reconnection** (drag an endpoint to a new handle), and a
  **clipboard** (`copy` / `paste` / `duplicateSelection`, ⌘C/V/D/X, id-remapped).
- **Accessibility** — focusable nodes (`tabIndex`, `role`, `aria-*`), a focus
  ring, focus-selects, and Alt+Arrow spatial navigation.
- **Hooks** — `useOnSelectionChange`, `useSelectionCount`.
- **Testing & tooling** — a head-to-head benchmark harness (`npm run bench`),
  `applyOperations` fuzz tests, a cross-browser + touch Playwright matrix
  (`npm run test:e2e`), visual-regression snapshots (`npm run test:e2e:visual`),
  and ESLint (`npm run lint`) — all wired into CI.
- **Interactive docs site** (`examples/docs-site`, `npm run dev:docs`).

### Fixed
- **Built packages now load under native Node ESM.** `tsc` emitted extensionless
  relative imports, so `import '@realflow/core'` threw `ERR_MODULE_NOT_FOUND` in
  plain Node even though bundlers resolved it. A post-build codemod appends `.js`
  to relative specifiers in the emitted output, and CI now `import()`s each built
  package under Node so it can't regress.
- **Benchmark runs on any machine.** `benchmarks/run.mjs` hard-coded a CI-only
  Chromium path; it now resolves the browser from `PLAYWRIGHT_CHROMIUM_PATH` →
  the pinned CI path → Playwright's own install.
- **Culling regression** — zooming in from an all-visible overview left every
  node rendered because the pan-hysteresis skipped the re-cull. Culling now
  re-runs on any zoom change (10k zoomed-in DOM nodes dropped from 10,000 to ~143).
- **Spatial-index DoS (2 variants)** — a huge node dimension or an extreme
  coordinate made `SpatialIndex.cellKeys` loop nearly forever; oversized rects
  are now kept out of the grid. Caught by the fuzz test.
- **`applyOperations` input sanitization** — numeric fields are coerced to
  finite, range-clamped numbers and ids/labels to strings, so a `Symbol`, `NaN`
  or non-array can't break the never-throw contract.
- Duplicate-edge detection treats default-handle ids as unset; `useFlowSelector`
  no longer corrupts topics whose ids contain `|`; per-edge version counters are
  freed on edge removal.

### Changed
- README performance claims are now a reproducible, movement-verified benchmark;
  the earlier unverified "~55 fps" figure was removed. See
  [CLAIMS.md](./CLAIMS.md) for the honesty audit.

## [0.1.0] — initial

- `@realflow/core`: headless engine — reactive store, spatial-hash culling, edge
  path math, five auto-layouts, undo/redo, graph algorithms, AI operations layer.
- `@realflow/react`: renderer — `<RealFlow>`, `Handle`, `Background`, `MiniMap`
  (canvas), `Controls`, `Panel`, hooks, light/dark theme.
