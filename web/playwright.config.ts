import { defineConfig } from '@playwright/test';

const chromePath =
  process.env.PLAYWRIGHT_CHROME_PATH ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:3000',
    headless: true,
    browserName: 'chromium',
    launchOptions: {
      executablePath: chromePath,
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      DOWNLOAD_MODE: 'paid',
      NEXT_PUBLIC_DOWNLOAD_MODE: 'paid',
    },
  },
});
