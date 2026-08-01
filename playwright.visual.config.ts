import { defineConfig, devices } from '@playwright/test'

const PORT = 4173

/**
 * Visual regression, kept separate from the main suite on purpose.
 *
 * Baselines are per-platform and per-driver: headless Chromium rasterises in
 * software, and its output differs from a real GPU. Committing baselines that
 * a hosted runner could match would mean baselining the software rasteriser,
 * which is not what anybody looks at. So these run locally, where they catch
 * the class of bug that the counting tests cannot see, and CI keeps enforcing
 * the checks that do travel.
 */
export default defineConfig({
  testDir: './e2e/visual',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  // A frozen clock removes the variance these would otherwise chase, so a
  // failure here is a real difference rather than a slow machine.
  timeout: 90_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `bun run build && bun run preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
