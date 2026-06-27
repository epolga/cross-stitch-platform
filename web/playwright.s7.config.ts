import { defineConfig } from '@playwright/test';

const chromePath =
  process.env.PLAYWRIGHT_CHROME_PATH ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

export default defineConfig({
  testDir: './tests/s7',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://127.0.0.1:3001',
    headless: true,
    browserName: 'chromium',
    launchOptions: { executablePath: chromePath },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // Expects `npm run dev -- --port 3001` to already be running.
  webServer: {
    command: 'npm run dev -- --port 3001',
    url: 'http://127.0.0.1:3001',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
