import { defineConfig, devices } from '@playwright/test'

const printerViewport = {
  width: 960,
  height: 544,
}

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,

  reporter: process.env.CI
    ? [
        ['line'],
        ['html', { outputFolder: 'playwright-report', open: 'never' }],
      ]
    : 'list',

  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  webServer: {
    command: 'vite --mode mock --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],

        // Должно идти после Desktop Chrome,
        // иначе device-профиль перезапишет размер экрана.
        viewport: printerViewport,
      },
    },
  ],
})