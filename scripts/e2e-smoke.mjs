import { chromium } from 'playwright';

// Usage: npm run dev -- --port 5199  (in examples/demo), then: node scripts/e2e-smoke.mjs
import { mkdirSync } from 'node:fs';
const SCRATCH = process.env.SHOTS_DIR ?? 'screenshots';
mkdirSync(SCRATCH, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});

await page.goto('http://localhost:5199', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

const nodeCount = await page.locator('.rf-node').count();
const edgeCount = await page.locator('.rf-edge').count();
console.log(`showcase: ${nodeCount} nodes, ${edgeCount} edges rendered`);
await page.screenshot({ path: `${SCRATCH}/01-showcase-light.png` });

// Dark mode
await page.click('.demo-actions button');
await page.waitForTimeout(400);
await page.screenshot({ path: `${SCRATCH}/02-showcase-dark.png` });
await page.click('.demo-actions button');
await page.waitForTimeout(200);

// ── interactions ──────────────────────────────────────────────────────
// 1. Drag a node
const node = page.locator('.rf-node[data-id="notify"]');
const before = await node.boundingBox();
await page.mouse.move(before.x + before.width / 2, before.y + 20);
await page.mouse.down();
await page.mouse.move(before.x + before.width / 2 + 80, before.y + 120, { steps: 12 });
await page.mouse.up();
const after = await node.boundingBox();
console.log(`drag: moved ${Math.round(after.x - before.x)},${Math.round(after.y - before.y)} (expect ~80,~100)`);
const dAfterDrag = await page.locator('.rf-edge[data-id="e7"] .rf-edge-path').getAttribute('d');
await page.waitForTimeout(100);

// 1b. Edge must follow the dragged node
const dBefore = dAfterDrag;

// 2. Undo the drag with keyboard
await page.keyboard.press('ControlOrMeta+z');
await page.waitForTimeout(150);
const undone = await node.boundingBox();
console.log(`undo: back to origin dx=${Math.round(undone.x - before.x)} (expect 0)`);
const dAfterUndo = await page.locator('.rf-edge[data-id="e7"] .rf-edge-path').getAttribute('d');
console.log(`edge follows node: ${dBefore !== dAfterUndo ? 'yes' : 'NO — STALE EDGE BUG'}`);

// 3. Connect two nodes by dragging from a handle
const edgesBefore = await page.locator('.rf-edge').count();
const srcHandle = page.locator('.rf-node[data-id="enrich"] .rf-handle-right').first();
const hb = await srcHandle.boundingBox();
const tgt = page.locator('.rf-node[data-id="review"] .rf-handle-left').first();
const tb = await tgt.boundingBox();
await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
await page.mouse.down();
await page.mouse.move(tb.x + 4, tb.y + 4, { steps: 15 });
await page.screenshot({ path: `${SCRATCH}/03-connecting.png` });
await page.mouse.up();
await page.waitForTimeout(150);
const edgesAfter = await page.locator('.rf-edge').count();
console.log(`connect: edges ${edgesBefore} -> ${edgesAfter} (expect +1)`);

// 4. Box select with shift-drag on empty pane
await page.keyboard.press('Escape');
await page.keyboard.down('Shift');
await page.mouse.move(120, 200);
await page.mouse.down();
await page.mouse.move(900, 750, { steps: 10 });
await page.mouse.up();
await page.keyboard.up('Shift');
const selected = await page.locator('.rf-node.rf-selected').count();
console.log(`box-select: ${selected} nodes selected (expect >1)`);
await page.screenshot({ path: `${SCRATCH}/04-box-select.png` });
await page.keyboard.press('Escape');

// 5. Zoom with wheel
await page.mouse.move(720, 450);
await page.mouse.wheel(0, -400);
await page.waitForTimeout(300);

// 6. Auto layout
await page.click('.demo-toolbar button:has-text("layered")');
await page.waitForTimeout(700);
await page.screenshot({ path: `${SCRATCH}/05-layered.png` });
await page.click('.demo-toolbar button:has-text("radial")');
await page.waitForTimeout(700);
await page.screenshot({ path: `${SCRATCH}/06-radial.png` });
await page.keyboard.press('ControlOrMeta+z'); // undo layout
await page.keyboard.press('ControlOrMeta+z');

// ── stress test 10k ───────────────────────────────────────────────────
await page.click('.demo-tabs button:has-text("10k")');
await page.waitForTimeout(2500);
const visNodes = await page.locator('.rf-node').count();
const visEdges = await page.locator('.rf-edge').count();
console.log(`stress-10k: DOM nodes=${visNodes}, DOM edges=${visEdges} (culling should keep these small)`);
await page.screenshot({ path: `${SCRATCH}/07-stress-10k.png` });

// Pan around and measure frame rate
const fps = await page.evaluate(async () => {
  const el = document.querySelector('.rf-container');
  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const down = new PointerEvent('pointerdown', { pointerId: 9, button: 0, clientX: cx, clientY: cy, bubbles: true });
  el.dispatchEvent(down);
  let frames = 0;
  const t0 = performance.now();
  let x = cx;
  await new Promise((resolve) => {
    const step = () => {
      frames++;
      x -= 12;
      el.dispatchEvent(new PointerEvent('pointermove', { pointerId: 9, clientX: x, clientY: cy + Math.sin(frames / 5) * 60, bubbles: true }));
      if (performance.now() - t0 < 2000) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
  el.dispatchEvent(new PointerEvent('pointerup', { pointerId: 9, clientX: x, clientY: cy, bubbles: true }));
  return Math.round((frames * 1000) / (performance.now() - t0));
});
console.log(`stress-10k pan fps: ~${fps}`);
await page.screenshot({ path: `${SCRATCH}/08-stress-panned.png` });

// Zoom out to see many nodes
for (let i = 0; i < 6; i++) {
  await page.mouse.move(720, 450);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(80);
}
await page.waitForTimeout(600);
const visNodesOut = await page.locator('.rf-node').count();
console.log(`stress-10k zoomed out: DOM nodes=${visNodesOut}`);
await page.screenshot({ path: `${SCRATCH}/09-stress-zoomout.png` });

console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no console/page errors');
await browser.close();
