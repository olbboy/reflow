import { test, expect, type Page } from '@playwright/test';
import { waitForViewportStable } from './helpers';

// Gate B proof, at runtime: real shadcn/ui (Radix) and Base UI components live
// inside ReFlow nodes. Portals open above the canvas, interacting with them
// never pans the viewport, and the node stays draggable. Desktop matrix only —
// these are pointer-driven library interactions.

const shadcn = '.rf-node[data-id="svc-api"]';
const baseui = '.rf-node[data-id="svc-base"]';

async function gotoFramework(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'UI frameworks' }).click();
  await expect(page.locator(shadcn)).toBeVisible();
  await waitForViewportStable(page); // let the fitView entrance animation settle
}

async function viewportTransform(page: Page) {
  return page.locator('.rf-viewport').first().evaluate((el) => (el as HTMLElement).style.transform);
}

test.describe('framework-component nodes', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(!!testInfo.project.use.isMobile, 'desktop pointer interactions');
  });

  test('renders both a shadcn node and a Base UI node', async ({ page }) => {
    await gotoFramework(page);
    await expect(page.locator(shadcn)).toContainText('API gateway');
    await expect(page.locator(shadcn)).toContainText('shadcn/ui');
    await expect(page.locator(baseui)).toBeVisible();
    await expect(page.locator(baseui)).toContainText('Base UI');
  });

  test('shadcn (Radix) Select opens in a portal and updates without panning', async ({ page }) => {
    await gotoFramework(page);
    const trigger = page.locator(shadcn).getByLabel('Environment');
    await expect(trigger).toContainText('production');

    const before = await viewportTransform(page);
    await trigger.click();
    // Radix portals the listbox to <body>; the option is reachable + visible.
    const option = page.getByRole('option', { name: 'staging' });
    await expect(option).toBeVisible();
    // Opening the menu must not have panned the canvas.
    expect(await viewportTransform(page)).toBe(before);

    await option.click();
    await expect(trigger).toContainText('staging');
  });

  test('shadcn (Radix) Popover actions mutate the node', async ({ page }) => {
    await gotoFramework(page);
    const node = page.locator(shadcn);
    await expect(node).toContainText('replicas');
    // replicas starts at 3.
    await expect(node.locator('.font-mono')).toHaveText('3');
    await node.getByLabel('Service actions').click();
    const scaleUp = page.getByRole('button', { name: 'Scale up' });
    await expect(scaleUp).toBeVisible();
    await scaleUp.click();
    await expect(node.locator('.font-mono')).toHaveText('4');
  });

  test('Base UI Select opens and updates', async ({ page }) => {
    await gotoFramework(page);
    const trigger = page.locator(baseui).getByLabel('Environment');
    await trigger.click();
    const option = page.getByRole('option', { name: 'dev' });
    await expect(option).toBeVisible();
    await option.click();
    await expect(trigger).toContainText('dev');
  });

  test('a framework node stays draggable', async ({ page }) => {
    await gotoFramework(page);
    const box = await page.locator(shadcn).boundingBox();
    expect(box).not.toBeNull();
    // Grab the card header (title area), away from the controls, and drag.
    // Prime + incremental moves so WebKit-on-Linux registers the drag.
    const sx = box!.x + 40;
    const sy = box!.y + 12;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.waitForTimeout(40);
    await page.mouse.move(sx + 6, sy + 6, { steps: 3 });
    await page.mouse.move(sx + 70, sy + 90, { steps: 14 });
    await page.waitForTimeout(40);
    await page.mouse.up();
    const after = await page.locator(shadcn).boundingBox();
    expect(after!.x - box!.x).toBeGreaterThan(25);
    expect(after!.y - box!.y).toBeGreaterThan(25);
  });
});
