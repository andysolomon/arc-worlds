import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Pure logic only — the renderer is covered by the Playwright e2e run.
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
