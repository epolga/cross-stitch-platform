import { expect, test } from '@playwright/test';

test.describe('Static pages — 200 + correct heading', () => {
  const pages: Array<{ path: string; heading: string | RegExp }> = [
    { path: '/privacy-policy',       heading: 'Privacy Policy' },
    { path: '/terms',                heading: 'Terms of Service' },
    { path: '/WhyCrossStitch',       heading: /Why Cross-Stitch\?/ },
    { path: '/CrossStitchTips.aspx', heading: 'Cross-Stitch Tips & Techniques Guide' },
    { path: '/Embroidery_History.aspx', heading: 'The History of Embroidery and Cross-Stitch' },
    { path: '/short-stories',        heading: 'My thoughts' },
    { path: '/exercises',            heading: 'Exercises and Tips for Cross-Stitchers' },
    { path: '/photo-to-cross-stitch', heading: 'Photo to Cross-Stitch Pattern Converter' },
  ];

  for (const { path, heading } of pages) {
    test(`${path} renders correctly`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBeLessThan(400);
      await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
    });
  }
});

