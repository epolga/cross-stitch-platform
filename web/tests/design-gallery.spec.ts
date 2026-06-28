import { expect, test } from '@playwright/test';

test.describe('Photo-to-Cross-Stitch converter', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/photo-to-cross-stitch');
  });

  test('page heading is visible', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Photo to Cross-Stitch Pattern Converter', level: 1 }),
    ).toBeVisible();
  });

  test('converter app loads and shows the empty-state prompt', async ({ page }) => {
    await expect(page.getByText('No pattern loaded')).toBeVisible({ timeout: 15_000 });
  });

  test('menu bar shows File and Import top-level menus', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'File' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Import' })).toBeVisible({ timeout: 10_000 });
  });

  test('Import menu opens with "From Photo…" option', async ({ page }) => {
    await page.getByRole('button', { name: 'Import' }).click();
    await expect(page.getByRole('button', { name: 'From Photo…' })).toBeVisible();
  });
});

test.describe('Cross-stitch design gallery', () => {
  test('homepage has a link to the pattern catalog', async ({ page }) => {
    await page.goto('/');
    const catalogLink = page.locator('a[href="/XStitch-Charts.aspx"]').first();
    await expect(catalogLink).toBeVisible();
  });
});
