import { expect, test } from '@playwright/test';

const PATTERN_ID = 'cccccccc-0000-0000-0000-000000000001';

const fakePattern = {
  id: PATTERN_ID,
  name: 'Mirror Test',
  width: 40,
  height: 20,
  palette: [{ number: '666', name: 'Red', r: 200, g: 0, b: 0, symbol: 'X', stitchCount: 800 }],
  grid: Array.from({ length: 20 }, () => Array(40).fill(0)),
  createdAt: '2026-01-01T00:00:00.000Z',
  ownerID: 'test-user',
};

async function loadPattern(page: Parameters<Parameters<typeof test>[1]>[0]) {
  await page.route(`/api/converter/patterns/${PATTERN_ID}`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakePattern) }),
  );
  await page.goto(`/photo-to-cross-stitch?pattern=${PATTERN_ID}`);
  await expect(page.getByText('Mirror Test')).toBeVisible({ timeout: 10_000 });
}

async function openMirrorRight(page: Parameters<Parameters<typeof test>[1]>[0]) {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.locator('button').filter({ hasText: /^Mirror/ }).hover();
  await page.getByRole('button', { name: 'Right', exact: true }).click();
}

test.describe('Mirror with active selection — regression tests', () => {
  // Regression: mousedown on Edit button was clearing selection before onClick fired.
  test('opening Edit menu preserves selection', async ({ page }) => {
    await loadPattern(page);
    await page.keyboard.press('Control+a');

    // Selection now active. Verify by checking Edit → Copy is enabled.
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Copy' })).toBeEnabled();
  });

  // Regression: clicking radio <input> inside MirrorDialog was clearing selection.
  test('clicking radio button in mirror dialog preserves selection', async ({ page }) => {
    await loadPattern(page);
    await page.keyboard.press('Control+a');

    await openMirrorRight(page);

    // Click a radio option inside the dialog (was clearing selection before fix)
    await page.getByText('Mirror from center of cell').click();

    // Cancel and re-open Edit — Copy must still be enabled
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Copy' })).toBeEnabled();
  });

  // Sanity: full-grid selection mirror right, edge axis, expand → doubles width.
  test('mirror right with Ctrl+A selection expands grid to double width', async ({ page }) => {
    await loadPattern(page);
    await page.keyboard.press('Control+a');

    await openMirrorRight(page);
    await page.getByRole('button', { name: 'OK' }).click();

    await expect(page.getByText('· 80 × 20 stitches')).toBeVisible({ timeout: 5_000 });
  });

  // Discriminating: partial drag selection should mirror only the selected columns.
  // If the bug exists (selection cleared before mirror runs), the whole grid mirrors
  // and width becomes 80. With the fix the width is less than 80.
  test('mirror right with partial selection mirrors selection width, not full grid', async ({ page }) => {
    await loadPattern(page);

    // Activate Select tool then drag to cover the left ~30% of the canvas
    await page.getByRole('button', { name: 'Select' }).click();

    const canvas = page.locator('canvas');
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');

    await page.mouse.move(box.x + box.width * 0.05, box.y + box.height * 0.05);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.95);
    await page.mouse.up();

    // Confirm a selection was created
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Copy' })).toBeEnabled();
    await page.keyboard.press('Escape');

    await openMirrorRight(page);
    await page.getByRole('button', { name: 'OK' }).click();

    // Partial mirror: width should be > 40 (something happened)
    // and < 80 (not the whole 40-col grid mirrored — that would be 80).
    const subtitle = page.locator('span').filter({ hasText: /· \d+ × 20 stitches/ });
    await expect(subtitle).toBeVisible({ timeout: 5_000 });
    const text = (await subtitle.textContent()) ?? '';
    const match = text.match(/· (\d+) × 20/);
    const newWidth = parseInt(match?.[1] ?? '0', 10);
    expect(newWidth).toBeGreaterThan(40);
    expect(newWidth).toBeLessThan(80);
  });
});
