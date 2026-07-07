import { test, expect, type Page } from '@playwright/test';
import { waitForViewportStable } from './helpers';

// Real, assertion-based E2E against the production demo build. Runs on the
// full browser matrix (Chromium / Firefox / WebKit) plus a mobile-touch
// profile. Replaces the old fire-and-forget console.log smoke script.

const nodeSel = (id: string) => `.rf-node[data-id="${id}"]`;

async function gotoShowcase(page: Page) {
  await page.goto('/');
  // The showcase tab is the default scene; wait for its nodes to paint.
  await expect(page.locator(nodeSel('notify'))).toBeVisible();
  await waitForViewportStable(page); // let the fitView entrance animation settle
}

async function center(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`no bounding box for ${selector}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
}

/**
 * Drag a node by (dx, dy). WebKit on Linux (Playwright's build, not real
 * Safari) is picky: it needs the pointer settled before pressing, a small
 * "prime" nudge to cross the drag threshold, then incremental moves. Grabs the
 * node near its top-left body, clear of the side handles.
 */
async function dragBy(page: Page, selector: string, dx: number, dy: number) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`no bounding box for ${selector}`);
  const sx = box.x + Math.min(40, box.width / 2);
  const sy = box.y + 12;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.waitForTimeout(40);
  await page.mouse.move(sx + 6, sy + 6, { steps: 3 }); // cross the drag threshold
  await page.mouse.move(sx + dx / 2, sy + dy / 2, { steps: 10 });
  await page.mouse.move(sx + dx, sy + dy, { steps: 10 });
  await page.waitForTimeout(40);
  await page.mouse.up();
  return box;
}

test.describe('ReFlow core interactions', () => {
  test('renders the showcase graph', async ({ page }) => {
    await gotoShowcase(page);
    // Seven showcase nodes + their edges should be in the DOM.
    expect(await page.locator('.rf-node').count()).toBeGreaterThanOrEqual(5);
    expect(await page.locator('.rf-edge').count()).toBeGreaterThanOrEqual(5);
    // Named nodes exist.
    for (const id of ['trigger', 'enrich', 'review', 'notify']) {
      await expect(page.locator(nodeSel(id))).toBeVisible();
    }
  });

  test('a selected node moves via keyboard and undo restores it', async ({ page }, testInfo) => {
    test.skip(!!testInfo.project.use.isMobile, 'keyboard interaction is desktop-only');
    await gotoShowcase(page);
    const node = page.locator(nodeSel('notify'));
    const before = await node.boundingBox();
    await node.click(); // ReFlow selects the node on pointer-down
    await expect(node).toHaveClass(/rf-selected/);
    // WebKit doesn't focus a tabindex div on click, so focus it explicitly;
    // then Shift+Arrow nudges the selection 10 units per press (one undo each).
    await page.locator('.rf-container').focus();
    for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowRight');
    for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowDown');
    const moved = await node.boundingBox();
    expect(moved!.x - before!.x).toBeGreaterThan(20);
    expect(moved!.y - before!.y).toBeGreaterThan(20);
    // Undo every nudge; the node returns to where it started.
    for (let i = 0; i < 12; i++) await page.keyboard.press('ControlOrMeta+z');
    const restored = await node.boundingBox();
    expect(Math.abs(restored!.x - before!.x)).toBeLessThan(6);
    expect(Math.abs(restored!.y - before!.y)).toBeLessThan(6);
  });

  test('dragging a node with the mouse moves it', async ({ page }, testInfo) => {
    test.skip(!!testInfo.project.use.isMobile, 'touch is covered separately');
    await gotoShowcase(page);
    const before = await dragBy(page, nodeSel('notify'), 90, 110);
    const end = await page.locator(nodeSel('notify')).boundingBox();
    expect(end).not.toBeNull();
    // Alignment snapping can nudge the exact delta, so assert meaningful motion.
    expect(end!.x - before.x).toBeGreaterThan(30);
    expect(end!.y - before.y).toBeGreaterThan(30);
  });

  test('dragging between handles creates an edge', async ({ page }, testInfo) => {
    test.skip(!!testInfo.project.use.isMobile, 'handle-drag connect is a desktop interaction');
    await gotoShowcase(page);
    const before = await page.locator('.rf-edge').count();
    const src = await center(page, `${nodeSel('enrich')} .rf-handle-right`);
    const tgt = await center(page, `${nodeSel('review')} .rf-handle-left`);
    // WebKit is timing-sensitive here: hover the source handle, press, step off
    // it to start the connection, approach in small steps, settle on the target
    // handle, then release. Fewer/larger jumps intermittently miss the target.
    await page.mouse.move(src.x, src.y);
    await page.mouse.down();
    await page.mouse.move(src.x + 14, src.y, { steps: 5 });
    await page.mouse.move((src.x + tgt.x) / 2, (src.y + tgt.y) / 2, { steps: 14 });
    await page.mouse.move(tgt.x, tgt.y, { steps: 14 });
    await page.mouse.move(tgt.x, tgt.y); // settle precisely on the target handle
    await page.mouse.up();
    await expect
      .poll(() => page.locator('.rf-edge').count(), { timeout: 5000 })
      .toBe(before + 1);
  });

  test('culls off-screen nodes at 10k (DOM stays small)', async ({ page }) => {
    await gotoShowcase(page);
    await page.getByRole('button', { name: '10k nodes' }).click();
    // Let the stress scene mount + fitView settle.
    await expect.poll(() => page.locator('.rf-node').count(), { timeout: 15_000 }).toBeGreaterThan(0);
    const domNodes = await page.locator('.rf-node').count();
    // 10k nodes in the graph, but culling keeps the mounted count far lower.
    expect(domNodes).toBeLessThan(3000);
  });
});

test.describe('touch', () => {
  test('tap selects a node on a touch device', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.use.isMobile, 'touch-only');
    await gotoShowcase(page);
    await page.locator(nodeSel('notify')).tap();
    await expect(page.locator(`${nodeSel('notify')}.rf-selected`)).toBeVisible();
  });
});
