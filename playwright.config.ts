import { defineConfig, devices } from '@playwright/test';

// The e2e suite runs against the built bundle served by `vite preview`, not the
// dev server: the thing worth checking end to end is what actually ships, and a
// production build is where a bad `define`, a broken asset path or a
// tree-shaken-away import would show up.
const PORT = Number(process.env.WINGMAN_E2E_PORT || 4173);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // A `.only` left in a spec silently stops CI from running the rest.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
