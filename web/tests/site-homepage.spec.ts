import { expect, test } from '@playwright/test';

test.describe('Homepage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('renders the main heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Free Cross-Stitch PDF Patterns', level: 1 }),
    ).toBeVisible();
  });

  test('shows the filter/search section heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'How to use the filters', level: 2 }),
    ).toBeVisible();
  });

  test('design results section is present', async ({ page }) => {
    await expect(page.locator('#results')).toBeAttached();
  });

  test('design list renders at least one design card or empty state', async ({ page }) => {
    const cards = page.locator('#results a, #results [data-testid="design-card"]');
    const empty = page.getByText(/no designs found/i);
    const hasCards = await cards.count() > 0;
    const isEmpty  = await empty.isVisible().catch(() => false);
    expect(hasCards || isEmpty).toBe(true);
  });

  test('page does not show an error message', async ({ page }) => {
    await expect(page.getByText(/error loading designs/i)).not.toBeVisible();
  });

  test('footer copyright is visible', async ({ page }) => {
    await expect(page.getByRole('contentinfo')).toContainText('Copyright');
  });
});
