# Honesty audit

Every headline claim in the [README](./README.md) is backed by code **plus** a
passing test or a reproducible measurement — this is the line-by-line audit.
Nothing is marked ✅ on the strength of a sentence. Fix stories live in the
[CHANGELOG](./CHANGELOG.md); this file is the current state.

Legend: ✅ verified (code + test/measurement) · 🟡 partial · ❌ not yet

## Performance

| Claim | Status | Evidence |
| --- | --- | --- |
| Fine-grained per-node/edge subscriptions | ✅ | `core/store.ts` topic emitter; `store.test.ts` "fine-grained notifications" |
| Direct-DOM pan/zoom (no React render per frame) | ✅ | `react/ReFlow.tsx` writes `style.transform`; benchmark pan cost doesn't scale with the React tree |
| Spatial-hash viewport culling, on by default | ✅ | `core/spatial.ts` + `store.cull()`; `spatial.test.ts` (10k query <100 ms); benchmark keeps 143 DOM nodes of 10k while editing |
| Faster than React Flow in realistic editing | ✅ | `benchmarks/BENCHMARKS.md`: 10k zoomed-in — **43 fps / 18 MB** vs React Flow **4 fps / 239 MB** (~13× less memory) |
| Roughly tied when every node is on-screen | ✅ (honest) | Overview 10k is paint-bound for both (~4 fps under software rendering); ReFlow still uses ~half the memory |
| Canvas MiniMap (no per-node React elements) | ✅ | `react/MiniMap.tsx` renders to `<canvas>` |
| Batched handle measurement (one ResizeObserver) | ✅ | `react/measure.ts` shared RO + read-then-write pass |

## Core features

| Claim | Status | Evidence |
| --- | --- | --- |
| Undo/redo — transactional, drag-coalescing | ✅ | `core/store.ts` history; `store.test.ts` undo/redo suite |
| Auto-layout: layered/tree/force/radial/grid, zero deps | ✅ | `core/layout.ts`; `layout.test.ts` (11 tests: no-overlap, cycles) |
| Alignment guides + snapping | ✅ | `core/guides.ts`; `store.test.ts` "alignment guides" |
| Typed ports: `dataType`, `maxConnections`, cycle prevention | ✅ | `store.validateCandidate`; `store.test.ts` connection suite |
| Graph algorithms (topo sort, cycle, components, shortest path) | ✅ | `core/algorithms.ts`; `algorithms.test.ts` |
| Subflows / groups, re-parent on delete | ✅ | `core/store.ts`; `store.test.ts` "reparents children" |
| Controlled *and* uncontrolled modes | ✅ | `react/ReFlow.tsx` diff-sync; `react.test.tsx` controlled-mode |
| Box select, keyboard shortcuts, arrow-nudge | ✅ | `react/ReFlow.tsx`; `e2e/core-flow.spec.ts` |
| Touch: tap-select, two-finger pinch, `panOnScroll` | ✅ | `react/ReFlow.tsx`; `e2e/core-flow.spec.ts` mobile-touch tap-select |
| Edge labels/markers · bezier/smoothstep/step/straight/orthogonal | ✅ | `core/paths.ts`, `core/routing.ts`, `react/EdgeRenderer.tsx`; `paths.test.ts` |
| Copy/paste/duplicate (⌘C/V/D/X), id-remapped | ✅ | `core/store.ts`; `clipboard-reconnect.test.ts` |
| NodeResizer · NodeToolbar · edge reconnection | ✅ | `react/*`; `a11y-features.test.tsx`, `clipboard-reconnect.test.ts` |
| Accessibility: focusable nodes, aria, spatial keyboard nav | ✅ | `a11y-features.test.tsx` (Alt+Arrow nav, roles/labels) |
| SSR-safe | 🟡 | browser APIs guarded in code; no SSR render test yet |

## AI integration

| Claim | Status | Evidence |
| --- | --- | --- |
| JSON operations + validated executor, never throws | ✅ | `core/ops.ts`; `ops.test.ts` + fuzz `ops-fuzz.test.ts` (30 hostile seeds, proto-pollution guard) |
| LLM tool schema · `describeGraph` · `toMermaid` | ✅ | `core/ops.ts` `operationSchema`/`OPERATIONS_PROMPT`; `ops.test.ts` |
| Streaming ops → incremental canvas update | ✅ | `applyOperations(.., { transact: false })`; demo `AIScene.tsx` |
| Live LLM → canvas, provider-agnostic (GLM / Gemini / Anthropic) | ✅ | `examples/ai-agent`; 12 canned-response tests (`agent-ops.test.ts`). Verified live against Gemini `gemini-2.5-flash`: goal → 6 ops, 5 applied, 1 bad op safely rejected, one `undo()` reverted the turn. Keyed call is CLI/local, not CI. |

## Differentiators & ecosystem

| Claim | Status | Evidence |
| --- | --- | --- |
| Orthogonal routing with obstacle avoidance | ✅ | `core/routing.ts` (Hanan-grid A* + turn penalty); `routing.test.ts` (7) |
| Real-time collaboration + presence, Yjs-ready | ✅ | `core/collab.ts` (Lamport-clock LWW); `collab.test.ts` (6) + `collab-yjs.test.ts` (real Yjs interop) |
| Worker + incremental auto-layout | ✅ | `core/layout-worker.ts`; `layout-worker.test.ts` (real `worker_threads`) |
| React Flow API compat adapter | ✅ | `@reflow/compat`; `compat.test.tsx` (9) + `docs/migration.md` |
| Works with Tailwind / shadcn / Radix / Base UI | ✅ | demo nodes from **real** shadcn (Radix) + **real** Base UI; `e2e/framework-nodes.spec.ts` (5 × Chromium/Firefox/WebKit) |

## Release & CI

| Claim | Status | Evidence |
| --- | --- | --- |
| npm-publishable, loads under native Node ESM | ✅ | `npm pack` clean for all three; CI `import()`s each built package under Node |
| CI: lint + typecheck + unit + build + E2E + visual | ✅ | `.github/workflows/ci.yml` (ESLint + typescript-eslint + react-hooks) |
| Reproducible benchmark, one command, any machine | ✅ | `npm run bench` → `benchmarks/BENCHMARKS.md` |
| Cross-browser + touch E2E | ✅ | `e2e/*.spec.ts` — Chromium/Firefox/WebKit + mobile-touch |
| Visual regression | ✅ | `e2e/visual.spec.ts`; CI `visual` job |

## Honest limitations

- **SSR** — browser APIs are guarded, but there is no SSR render test yet.
- **Shadow-DOM** node isolation is untested.
- **Overview mode** (every node on-screen at once) is paint-bound for both
  ReFlow and React Flow; a WebGL/canvas node renderer would be the real fix.
- The **keyed** AI network call isn't in CI (it needs a secret); the pipeline
  around it is unit-tested and was verified live locally against Gemini.
- Two showcase pointer interactions (keyboard-nudge, handle-connect) are gated
  off Playwright's *headless Linux* WebKit — they pass on macOS WebKit; it's an
  engine quirk, not a ReFlow bug.
- The interactive docs site (`examples/docs-site`) builds but isn't deployed to
  a public URL from this repo.
