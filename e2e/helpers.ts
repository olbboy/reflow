import { type Page } from '@playwright/test';

/**
 * Wait until the ReFlow viewport transform stops changing. ReFlow writes the
 * pan/zoom transform straight to the DOM and animates `fitView` on scene entry;
 * on slower engines (Playwright's Linux WebKit especially) that animation is
 * still running when a test starts interacting, which shifts every node's
 * screen position and makes position assertions flaky. Polling until the
 * transform is stable removes the race deterministically, without a fixed
 * sleep.
 */
export async function waitForViewportStable(page: Page): Promise<void> {
  let prev = '';
  let stable = 0;
  for (let i = 0; i < 50; i++) {
    const t = await page
      .locator('.rf-viewport')
      .first()
      .evaluate((el) => (el as HTMLElement).style.transform)
      .catch(() => '');
    if (t && t === prev) {
      if (++stable >= 2) return; // two consecutive identical reads = settled
    } else {
      stable = 0;
    }
    prev = t;
    await page.waitForTimeout(75);
  }
}
