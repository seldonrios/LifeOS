import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  globalTimeout: 180_000,
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:5173',
    browserName: 'chromium',
  },
});
