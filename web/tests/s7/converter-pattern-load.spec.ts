import { expect, test } from '@playwright/test';

test.describe('Converter pattern loading', () => {
  test('loads cleanly without a ?pattern param', async ({ page }) => {
    await page.goto('/photo-to-cross-stitch');
    // No loading spinner, no error message
    await expect(page.getByRole('heading', { name: 'Cross-Stitch Pattern Editor' })).toBeVisible();
    await expect(page.locator('text=⚠')).not.toBeVisible();
  });

  test('shows error for a non-existent pattern ID', async ({ page }) => {
    await page.goto('/photo-to-cross-stitch?pattern=00000000-0000-0000-0000-000000000000');
    await expect(page.locator('span').filter({ hasText: '⚠' })).toBeVisible({ timeout: 15_000 });
  });

  test('shows error for a 403 (pattern owned by someone else)', async ({ page }) => {
    // Intercept the API call and return 403
    await page.route('/api/converter/patterns/00000000-0000-0000-0000-000000000001', async (route) => {
      await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Access denied' }) });
    });
    await page.goto('/photo-to-cross-stitch?pattern=00000000-0000-0000-0000-000000000001');
    await expect(page.locator('span').filter({ hasText: '⚠' })).toBeVisible({ timeout: 10_000 });
  });

  test('pattern name appears in header after successful load', async ({ page }) => {
    const fakePattern = {
      id: 'aaaaaaaa-0000-0000-0000-000000000001',
      name: 'My Horse',
      width: 3, height: 2,
      palette: [{ number: '666', name: 'Red', r: 200, g: 0, b: 0, symbol: 'X', stitchCount: 4 }],
      grid: [[0, 0, 0], [0, 0, 0]],
      createdAt: '2026-06-27T10:00:00.000Z',
      ownerID: 'test-user',
    };

    await page.route('/api/converter/patterns/aaaaaaaa-0000-0000-0000-000000000001', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakePattern) });
    });

    await page.goto('/photo-to-cross-stitch?pattern=aaaaaaaa-0000-0000-0000-000000000001');
    await expect(page.getByText('My Horse')).toBeVisible({ timeout: 10_000 });
  });
});
