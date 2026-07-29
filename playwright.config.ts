import { cpus } from 'node:os'
import { defineConfig, devices } from '@playwright/test'

const PORT = 4173

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Every spec drives a live WebGL context, and Playwright's default of one
  // worker per core oversubscribes the GPU rather than the CPU: at six workers
  // this suite failed a different spec on most runs — including `page.goto`
  // itself timing out, which is starvation, not test design. Half the cores,
  // capped at four, runs the suite in about the same wall time and stopped the
  // flaking. CI stays serial.
  workers: process.env.CI ? 1 : Math.max(2, Math.min(4, Math.floor((cpus().length || 4) / 2))),
  // A cold WebGL context on a loaded machine can want more than the default
  // 30 s before it has drawn anything worth asserting on.
  timeout: 60_000,
  // The github reporter only writes annotations, so on its own a failed run
  // left nothing to download and the upload step had no playwright-report/ to
  // find. Pairing it with the html reporter keeps the inline annotations and
  // also writes the report — which is where the trace from the retry lives,
  // and the only way to see what a headless failure actually looked like.
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Preview the real production build — the WebGL path is what we care about.
    command: `bun run build && bun run preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
