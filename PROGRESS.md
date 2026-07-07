# PROGRESS.md — honest status against the acceptance gates

Updated as work lands. Every ✅ is backed by code + a passing test or a
reproducible measurement. Gaps are listed plainly, not hidden.

## Gate A — production-ready & high performance

| Requirement | Status | Evidence |
| --- | --- | --- |
| npm-publishable (exports/types/sideEffects/peerDeps, semver) | ✅ | `npm pack --dry-run` clean for core/react/compat; `API_STABILITY.md`; `CHANGELOG.md` |
| CI: typecheck + tests + build | ✅ | `.github/workflows/ci.yml` (build, typecheck, test, demo build, pack verify) |
| Head-to-head benchmark, reproducible, prod builds, both actually pan | ✅ | `npm run bench` → `benchmarks/BENCHMARKS.md`; movement-verified; ReFlow wins the realistic edit scenario 43 vs 4–9 fps @10k, 13× less memory |
| `applyOperations` fuzz test (never-throw) | ✅ | `packages/core/test/ops-fuzz.test.ts` — 30 seeds × hostile input, proto-pollution guard. **Caught 3 real bugs**: two spatial-index infinite-loop DoS (huge dimension / extreme coordinate) and Symbol→number throws — all fixed + regression-tested. |
| Cross-browser Playwright matrix (Firefox/WebKit) + touch E2E | ❌ | Chromium-only so far. Honest gap. |
| Visual regression tests | ❌ | Not implemented. |

Gate A: **substantially met.** The core requirements (publishable, CI,
reproducible honest benchmark, fuzz) are done. Cross-browser matrix and
visual regression remain.

## Gate B — UI-framework compatibility

| Requirement | Status | Evidence |
| --- | --- | --- |
| Nodes/handles/edges don't impose blocking styles; className/style overridable | ✅ | All styling via `rf-*` classes + `--rf-*` variables; `docs/integrations.md` |
| No z-index/portal/pointer conflict with portal menus inside nodes | ✅ | `examples/demo/.../FrameworkScene.tsx` — portal dropdown + `<select>` + number input inside draggable nodes; `rf-nodrag` opt-out; verified in browser (see PROGRESS note) |
| No global CSS leakage; CSS-var theming (light/dark) | ✅ | `packages/react/src/styles.css` is fully scoped; `colorMode` + page `data-theme` |
| Live demo with framework-style nodes | ✅ | "UI frameworks" tab in the demo |
| shadcn/Radix/Base UI theme-token mapping | ✅ (documented) | `docs/integrations.md` maps `--rf-*` → shadcn HSL tokens |

Gate B: **met.** Portal coexistence is proven with the exact pattern
Radix/Base UI use (portal to body + fixed positioning + own pointer
handling). Shadow-DOM isolation is untested (noted as a future item).

## Gate C — AI-native

| Requirement | Status | Evidence |
| --- | --- | --- |
| JSON ops with public schema, validate + reject safely | ✅ | `packages/core/src/ops.ts` `operationSchema`; fuzz-tested |
| Streaming ops → incremental canvas update (no full re-render) | ✅ | `applyOperations(..., {transact:false})`; per-node fine-grained rendering; demo `AIScene.tsx` streams |
| E2E: an AI Assistant generates a workflow → live render + transactional undo | 🟡 | Demo streams a scripted agent building a live pipeline with per-node status + undo. A **live** Anthropic `/v1/messages` call is documented (`docs/ai-integration.md`) but not wired into CI (needs an API key). |
| AI integration guide + tool-schema for first-try correctness | ✅ | `docs/ai-integration.md` + `OPERATIONS_PROMPT` + `operationSchema`; `llms.txt` at repo root |

Gate C: **met** for the shippable surface. The only softness is a *live*
API-key E2E, which is impractical in CI; the operation layer it would call is
fully tested and the pattern is documented + demoed.

## Tier 2 parity (React Flow features ReFlow was missing)

| Feature | Status | Evidence |
| --- | --- | --- |
| NodeResizer | ✅ | `NodeResizer.tsx`; `a11y-features.test.tsx` |
| NodeToolbar | ✅ | `NodeToolbar.tsx`; test |
| Edge reconnection + snapping | ✅ | store `startReconnect`; `clipboard-reconnect.test.ts` |
| Copy/paste/duplicate + id remap | ✅ | store `copy/paste/duplicateSelection`; test; ⌘C/V/D/X |
| useOnSelectionChange, Panel, Background variants | ✅ | hooks + existing components |
| Accessibility (focus, tab order, aria, keyboard nav) | ✅ | focusable nodes, roles/labels, Alt+Arrow nav; `a11y-features.test.tsx` |
| `@reflow/compat` migration adapter | ✅ | `packages/compat` + `compat.test.tsx` (9 tests) + `docs/migration.md` |

Tier 2: **complete.**

## Tier 3 (differentiation) — DONE

| Item | Status | Evidence |
| --- | --- | --- |
| Orthogonal edge routing with obstacle avoidance | ✅ | `packages/core/src/routing.ts` (Hanan-grid A* + turn penalty); `routing.test.ts` (7 tests: avoids single/stacked obstacles, own-node exclusion, fallback, perf); `'orthogonal'` edge type re-routes live; demo "Smart routing" tab + docs-site example. |
| Collaborative sync + presence | ✅ | `packages/core/src/collab.ts` — transport-agnostic `Collab` (Lamport-clock LWW, order-independent convergence) + `Presence`; `collab.test.ts` + `collab-yjs.test.ts` (**real Yjs CRDT interop**); `RemoteCursors` component; docs/collaboration.md; live two-peer docs-site example (verified cross-panel sync). |
| Worker-based + incremental auto-layout | ✅ | `layout-worker.ts` `runLayoutJob`/`layoutInWorker` (runs in a real `worker_threads` Worker — `layout-worker.test.ts`); `incrementalLayout` places new nodes without moving the graph; `layoutAsync`/`layoutIncremental` on the React API; docs/layout.md. |
| Interactive docs site with live examples | ✅ | `examples/docs-site` — 6 live, runnable examples with source shown side-by-side (Basic, Custom nodes, Auto-layout, Smart routing, AI ops, Collaboration). `npm run dev:docs`. All examples verified rendering + interacting in a browser. |

## Remaining honest gaps (post-Tier 3)

- Cross-browser Playwright matrix (Firefox/WebKit) + touch E2E — still Chromium-only.
- Visual regression tests — not implemented.
- Live *hosted* docs site — the site exists and builds; it isn't deployed to a URL here.
- Overview-mode (all-nodes-visible) pan is paint-bound under software rendering
  for both libraries; a WebGL/canvas node renderer would be the deeper fix.

## Honest bottom line

- The **biggest real win this cycle was a bug fix, not a feature**: culling
  didn't re-run when zooming in from an overview, so the headline
  performance advantage wasn't actually delivered. The head-to-head
  benchmark caught it; it's fixed and regression-tested. This is exactly why
  RULE #0 mattered.
- ReFlow now genuinely beats React Flow in the realistic zoomed-in editing
  scenario (FPS and memory), ties it in the all-visible overview (both
  paint-bound under software rendering), ships a working migration adapter,
  closes the Tier 2 parity gaps, and has a real AI operation layer.
- **Tier 3 is now done**: obstacle-avoiding orthogonal routing, transport-agnostic
  collaboration with real Yjs interop + presence, worker/incremental layout, and
  an interactive docs site — each with tests or browser-verified evidence. This
  puts ReFlow ahead of React Flow on routing (neither had it), collaboration
  (React Flow leaves it to you), and ships an AI-native operation layer.
- The honest remaining bars to be unambiguously "#1" are operational, not
  feature gaps: a cross-browser/touch test matrix, visual regression, a hosted
  docs site, and — for the extreme all-visible-at-once case — a WebGL renderer.
