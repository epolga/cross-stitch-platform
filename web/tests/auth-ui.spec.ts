import { expect, test } from '@playwright/test';

test.describe('Auth UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('Login and Register buttons are visible when logged out', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Register' })).toBeVisible();
  });

  test('clicking Login opens the login modal', async ({ page }) => {
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page.getByRole('heading', { name: 'Login', level: 2 })).toBeVisible();
  });

  test('login modal has email and password fields', async ({ page }) => {
    await page.getByRole('button', { name: 'Login' }).click();
    // getByRole('textbox') for email input; locator for password (type=password has no textbox role)
    await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
    await expect(page.locator('input[aria-label="Password"]')).toBeVisible();
  });

  test('login modal has a submit button', async ({ page }) => {
    await page.getByRole('button', { name: 'Login' }).click();
    // The form submit button also has aria-label="Login"
    await expect(page.getByRole('button', { name: 'Login' }).last()).toBeVisible();
  });

  test('Close modal button dismisses the login modal', async ({ page }) => {
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page.getByRole('heading', { name: 'Login', level: 2 })).toBeVisible();
    await page.getByRole('button', { name: 'Close modal' }).click();
    await expect(page.getByRole('heading', { name: 'Login', level: 2 })).not.toBeVisible();
  });

  test('Register button opens a registration modal', async ({ page }) => {
    await page.getByRole('button', { name: 'Register' }).click();
    // In paid mode, RegisterForm opens with heading "Download Access"
    await expect(page.getByRole('heading', { name: 'Download Access', level: 2 })).toBeVisible({ timeout: 5_000 });
  });
});
