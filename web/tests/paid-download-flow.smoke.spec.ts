import { expect, test } from '@playwright/test';

test('download access page renders the inline registration UI for paid downloads', async ({
  page,
}) => {
  await page.goto(
    '/download-access?returnTo=%2Fqa%2Fpaid-download-flow&designId=999999&caption=QA%20paid%20download%20smoke%20test',
  );

  await expect(
    page.getByText('Finish setup to download "QA paid download smoke test"'),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Download Access', level: 1 })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toBeVisible();
  await expect(page.getByLabel('Confirm Email')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Password', exact: true })).toBeVisible();
  await expect(page.getByLabel('Confirm Password')).toBeVisible();
  await expect(page.getByText('Monthly Plan')).toBeVisible();
  await expect(page.getByText('Yearly Plan')).toBeVisible();
  await expect(page.getByText('Recommended')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start for Free' })).toBeDisabled();
  await expect(page.getByRole('link', { name: 'Back to previous page' })).toHaveAttribute(
    'href',
    '/qa/paid-download-flow',
  );
});
