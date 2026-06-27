import { expect, test } from '@playwright/test';

test.describe('Converter page', () => {
  test('loads and shows the editor heading', async ({ page }) => {
    await page.goto('/photo-to-cross-stitch');
    await expect(page.getByRole('heading', { name: 'Cross-Stitch Pattern Editor' })).toBeVisible();
  });

  test('shows New Pattern and Download PDF buttons', async ({ page }) => {
    await page.goto('/photo-to-cross-stitch');
    await expect(page.getByRole('button', { name: 'New Pattern' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Download PDF/i })).toBeVisible();
  });

  test('Download PDF is disabled before importing a photo', async ({ page }) => {
    await page.goto('/photo-to-cross-stitch');
    await expect(page.getByRole('button', { name: /Download PDF/i })).toBeDisabled();
  });

  test('shows Import menu item in the File menu', async ({ page }) => {
    await page.goto('/photo-to-cross-stitch');
    await page.getByRole('button', { name: 'File' }).click();
    // 'New Pattern' also exists on the toolbar; .last() targets the dropdown item
    await expect(page.getByRole('button', { name: 'New Pattern' }).last()).toBeVisible();
    await expect(page.getByText('Save & share…')).toBeVisible();
  });

  test('shows the empty-state prompt to import a photo', async ({ page }) => {
    await page.goto('/photo-to-cross-stitch');
    await expect(page.getByText(/import a photo to begin/i)).toBeVisible();
  });

  test('shows error message for a broken pattern link', async ({ page }) => {
    await page.goto('/photo-to-cross-stitch?pattern=00000000-0000-0000-0000-000000000000');
    await expect(page.locator('text=⚠').or(page.getByText(/not found|broken|failed/i))).toBeVisible({ timeout: 15_000 });
  });
});
