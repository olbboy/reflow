// Head-to-head benchmark: ReFlow vs React Flow, production builds, identical
// scenes, same machine. Reproducible with: npm run bench -w reflow-benchmarks
//
// Honest methodology notes:
//  - Both apps are Vite *production* builds (minified, no dev tooling).
//  - Identical deterministic scenes (benchmarks/src/scene.ts).
//  - Chromium via Playwright. Software rendering in CI => absolute FPS is
//    lower than a real GPU desktop, but the RELATIVE comparison holds.
//  - We report three React Flow configs: default (no culling) and
//    onlyRenderVisibleElements (their opt-in culling), so nothing is
//    cherry-picked. ReFlow culls by default.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('./dist', import.meta.url));
const PORT = 5311;
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let file = join(DIR, path);
    const s = await stat(file).catch(() => null);
    if (s?.isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream');
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.end('not found');
  }
});
await new Promise((r) => server.listen(PORT, r));

// Browser resolution, in priority order, so `npm run bench` runs anywhere:
//  1) PLAYWRIGHT_CHROMIUM_PATH env override, 2) the CI image's pinned path if
//  present, 3) Playwright's own installed browser (default local dev).
const pinnedChromium = process.env.PLAYWRIGHT_CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const launchOpts = { headless: true, args: ['--js-flags=--expose-gc'] };
if (existsSync(pinnedChromium)) launchOpts.executablePath = pinnedChromium;
const browser = await chromium.launch(launchOpts);

/**
 * Drive a real pan for `ms` and count animation frames. Dispatches BOTH
 * pointer events (ReFlow) and mouse events (React Flow's d3-zoom listens on
 * window for mousemove/mouseup) so both libraries genuinely pan. Returns the
 * viewport transform before/after so the caller can assert real movement —
 * a frozen canvas would otherwise report a meaningless 60fps.
 */
const PAN_FN = ({ selector, ms, vpSelector }) =>
  new Promise((resolve) => {
    const el = document.querySelector(selector);
    if (!el) return resolve({ error: `no ${selector}` });
    const vp = vpSelector ? document.querySelector(vpSelector) : null;
    const readT = () => (vp ? getComputedStyle(vp).transform : '');
    const before = readT();
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const p = (x, y) => ({ pointerId: 1, isPrimary: true, button: 0, buttons: 1, clientX: x, clientY: y, bubbles: true, cancelable: true, view: window });
    el.dispatchEvent(new PointerEvent('pointerdown', p(cx, cy)));
    el.dispatchEvent(new MouseEvent('mousedown', p(cx, cy)));
    let frames = 0;
    const t0 = performance.now();
    let x = cx;
    let y = cy;
    const step = () => {
      frames++;
      x -= 11;
      y += Math.sin(frames / 6) * 7;
      if (x < r.left + 40) x = r.right - 40;
      const mv = p(x, y);
      el.dispatchEvent(new PointerEvent('pointermove', mv));
      window.dispatchEvent(new PointerEvent('pointermove', mv));
      window.dispatchEvent(new MouseEvent('mousemove', mv)); // d3-zoom listens on window
      if (performance.now() - t0 < ms) requestAnimationFrame(step);
      else {
        el.dispatchEvent(new PointerEvent('pointerup', p(x, y)));
        window.dispatchEvent(new MouseEvent('mouseup', p(x, y)));
        resolve({
          fps: Math.round((frames * 1000) / (performance.now() - t0)),
          moved: readT() !== before,
        });
      }
    };
    requestAnimationFrame(step);
  });

async function measure(page, url, nodeSelector, { edit = false } = {}) {
  const isReflow = nodeSelector.includes('rf-node');
  const vpSelector = isReflow ? '.rf-viewport' : '.react-flow__viewport';
  await page.goto(url, { waitUntil: 'load' });
  // Wait until nodes are painted (or a short cap for culled/heavy mounts).
  await page.waitForSelector(nodeSelector, { timeout: 30000 }).catch(() => {});
  // Generous settle: mounting 10k nodes takes several seconds for both libs.
  await page.waitForTimeout(6500);
  if (edit) {
    // Zoom to editing level (zoom=1) so only a viewport-worth of nodes is
    // visible — the realistic scenario where culling matters.
    await page.evaluate(() => window.__zoomEdit?.());
    await page.waitForTimeout(1500);
  }

  const mountMs = await page.evaluate(() => {
    const start = window.__RENDER_START ?? 0;
    return Math.round(performance.now() - start);
  });
  const domNodes = await page.locator(nodeSelector).count();

  // GC + heap snapshot before panning.
  await page.evaluate(() => (window.gc ? window.gc() : null));
  const heapMB = await page.evaluate(() =>
    performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null
  );

  // Warm up one pan, then measure. Assert the viewport actually moved so a
  // frozen canvas can't report a bogus 60fps.
  const paneSel = isReflow ? '.rf-container' : '.react-flow__pane';
  await page.evaluate(PAN_FN, { selector: paneSel, ms: 400, vpSelector });
  const pan = await page.evaluate(PAN_FN, { selector: paneSel, ms: 2000, vpSelector });

  return {
    mountMs,
    domNodes,
    heapMB,
    panFps: pan.fps ?? 0,
    moved: pan.moved,
    panErr: pan.error,
  };
}

const SIZES = [1000, 5000, 10000];
const CONFIGS = [
  { key: 'ReFlow', url: (n) => `http://localhost:${PORT}/reflow.html?n=${n}`, sel: '.rf-node' },
  { key: 'React Flow (default)', url: (n) => `http://localhost:${PORT}/xyflow.html?n=${n}`, sel: '.react-flow__node' },
  { key: 'React Flow (onlyRenderVisible)', url: (n) => `http://localhost:${PORT}/xyflow.html?n=${n}&cull=1`, sel: '.react-flow__node' },
];

const overview = [];
const editRows = [];
for (const n of SIZES) {
  for (const cfg of CONFIGS) {
    // Overview scenario: all nodes visible (fitView). Raw render stress.
    let page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const o = await measure(page, cfg.url(n), cfg.sel);
    await page.close();
    overview.push({ n, lib: cfg.key, ...o });
    console.error(`  [overview] ${n} · ${cfg.key}: pan ${o.panFps}fps${o.moved ? '' : ' [FROZEN!]'}, ${o.domNodes} DOM, ${o.heapMB}MB`);

    // Edit scenario: zoomed to 1:1, only a viewport-worth visible. Culling.
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const e = await measure(page, cfg.url(n), cfg.sel, { edit: true });
    await page.close();
    editRows.push({ n, lib: cfg.key, ...e });
    console.error(`  [edit]     ${n} · ${cfg.key}: pan ${e.panFps}fps${e.moved ? '' : ' [FROZEN!]'}, ${e.domNodes} DOM, ${e.heapMB}MB`);
  }
}
const rows = overview;

await browser.close();
server.close();

// Markdown output to stdout (pipe into a file for the docs).
const fmt = (v, suffix = '') => (v == null ? '—' : `${v}${suffix}`);
const table = (title, note, data) => {
  let s = `## ${title}\n\n${note}\n\n`;
  s += `| Nodes | Library | Pan FPS | DOM nodes | Mount ms | Heap MB |\n`;
  s += `| ---: | --- | ---: | ---: | ---: | ---: |\n`;
  for (const r of data) {
    const fps = r.moved ? `**${fmt(r.panFps)}**` : `${fmt(r.panFps)} ⚠️frozen`;
    s += `| ${r.n} | ${r.lib} | ${fps} | ${fmt(r.domNodes)} | ${fmt(r.mountMs)} | ${fmt(r.heapMB)} |\n`;
  }
  return s + '\n';
};

let md = `# ReFlow vs React Flow — head-to-head benchmark\n\n`;
md += `Chromium (Playwright, **software rendering** — no GPU) · 1440×900 · production builds · deterministic identical scenes.\n`;
md += `Reproduce: \`npm run bench -w reflow-benchmarks\`.\n\n`;
md += `> Absolute FPS is capped by software rendering (CI has no GPU); on real hardware\n`;
md += `> both libraries are far smoother. The **relative** comparison is the signal.\n`;
md += `> Every row's pan is verified to actually move the viewport (no frozen-canvas\n`;
md += `> false 60fps — an easy benchmark trap).\n\n`;
md += table(
  'Overview scenario — all nodes visible (fit to screen)',
  'Worst case: every node is genuinely on-screen, so culling cannot help either library. This is a raw paint stress test.',
  overview
);
md += table(
  'Editing scenario — zoomed to 1:1 (a viewport-worth of nodes visible)',
  'The realistic authoring case. ReFlow culls off-screen nodes by default; React Flow renders all unless `onlyRenderVisibleElements` is set.',
  editRows
);
md += `Higher FPS is better; lower DOM nodes / mount ms / heap is better.\n`;
process.stdout.write(md);
