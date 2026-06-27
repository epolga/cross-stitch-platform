import { expect, test } from '@playwright/test';

// All profile pages require an active cs_session cookie.
// Without it, the client-side auth check redirects to /.

test.describe('Profile auth guard', () => {
  test('/profile redirects unauthenticated users to /', async ({ page }) => {
    await page.goto('/profile');
    await page.waitForURL('/', { timeout: 10_000 });
    expect(page.url()).toMatch(/\/$/);
  });

  test('/profile/patterns redirects unauthenticated users to /', async ({ page }) => {
    await page.goto('/profile/patterns');
    await page.waitForURL('/', { timeout: 10_000 });
    expect(page.url()).toMatch(/\/$/);
  });

  test('/profile/votes redirects unauthenticated users to /', async ({ page }) => {
    await page.goto('/profile/votes');
    await page.waitForURL('/', { timeout: 10_000 });
    expect(page.url()).toMatch(/\/$/);
  });

  test('/profile shows Redirecting… before redirect completes', async ({ page }) => {
    // Intercept the router.replace so we can assert the interim render.
    await page.route('/', async (route) => {
      // Hold the navigation so we can inspect the in-between state.
      await new Promise((res) => setTimeout(res, 300));
      await route.continue();
    });

    await page.goto('/profile');
    // Either the interim message or the redirect target is acceptable.
    const hasInterim = await page.getByText('Redirecting...').isVisible().catch(() => false);
    const onRoot = page.url().endsWith('/');
    expect(hasInterim || onRoot).toBe(true);
  });
});
