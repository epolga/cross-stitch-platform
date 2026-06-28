import { expect, test } from '@playwright/test';

test.describe('Site navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('nav landmark is present', async ({ page }) => {
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  });

  test('desktop nav shows key links', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(nav.getByRole('link', { name: 'Home' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Thematic catalog' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Tips' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'My thoughts' })).toBeVisible();
  });

  test('Home link points to /', async ({ page }) => {
    await expect(
      page.getByRole('navigation', { name: 'Main navigation' })
          .getByRole('link', { name: 'Home' })
    ).toHaveAttribute('href', '/');
  });

  test('Thematic catalog link points to /XStitch-Charts.aspx', async ({ page }) => {
    await expect(
      page.getByRole('navigation', { name: 'Main navigation' })
          .getByRole('link', { name: 'Thematic catalog' })
    ).toHaveAttribute('href', '/XStitch-Charts.aspx');
  });

  test('Articles dropdown opens and shows sub-links', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await nav.getByRole('button', { name: 'Articles' }).click();
    await expect(page.getByRole('link', { name: 'The History of Embroidery' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Why Cross-Stitch?' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Men and Cross-Stitch' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Exercises for cross-stitchers' })).toBeVisible();
  });

  test('auth controls are visible (Login and Register)', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Register' })).toBeVisible();
  });

  test('footer is present with copyright text', async ({ page }) => {
    await expect(page.getByRole('contentinfo')).toBeVisible();
    await expect(page.getByRole('contentinfo')).toContainText('Copyright');
  });
});
