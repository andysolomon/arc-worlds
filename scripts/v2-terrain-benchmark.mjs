import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? fallback : process.argv[index + 1]
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Vite exited with code ${child.exitCode}`)
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // The isolated benchmark server is still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200))
  }
  throw new Error(`Benchmark server did not become ready at ${url}`)
}

const root = resolve(import.meta.dirname, '..')
const port = Number(option('port', '4176'))
const runs = Number(option('runs', process.env.PERF_TERRAIN_RUNS ?? '3'))
const outputPath = resolve(root, option('output', '.artifacts/performance/v2-terrain.json'))
const url = `http://127.0.0.1:${port}/terrain-benchmark.html`
const viteCli = resolve(root, 'node_modules/vite/bin/vite.js')

if (!Number.isInteger(runs) || runs < 1) {
  throw new Error(`--runs must be a positive integer; received ${runs}`)
}
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error(`--port must be an integer from 1 to 65535; received ${port}`)
}

const server = spawn(
  'bun',
  [viteCli, '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  {
    cwd: root,
    stdio: 'inherit',
    detached: process.platform !== 'win32',
  },
)

const results = []
try {
  await waitForServer(url, server)
  const browser = await chromium.launch({
    headless: true,
    args: ['--enable-precise-memory-info'],
  })
  try {
    for (let iteration = 1; iteration <= runs; iteration++) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
      const page = await context.newPage()
      const pageErrors = []
      page.on('pageerror', (error) => pageErrors.push(String(error)))
      page.on('console', (message) => {
        if (message.type() === 'error') pageErrors.push(message.text())
      })
      try {
        await page.goto(url, { waitUntil: 'networkidle' })
        await page.waitForFunction(() => typeof window.runV2TerrainBenchmark === 'function')
        const result = await page.evaluate(() => window.runV2TerrainBenchmark())
        const combined = {
          iteration,
          ...result,
          errors: [...result.errors, ...pageErrors],
        }
        combined.passed = combined.passed && pageErrors.length === 0
        results.push(combined)
        console.log(JSON.stringify({ iteration, passed: combined.passed, metrics: combined.metrics }))
      } finally {
        await context.close()
      }
    }
  } finally {
    await browser.close()
  }
} finally {
  if (server.exitCode === null) {
    if (process.platform === 'win32') server.kill('SIGTERM')
    else process.kill(-server.pid, 'SIGTERM')
  }
}

const numericFields = [
  'previewSettledMs',
  'focusedSettledMs',
  'maxPhaseMs',
  'supersededMs',
  'artifactSupersededMs',
  'phaseCpuTotalMs',
  'workerJobTotalMs',
  'artifactTotalMs',
  'maxArtifactMs',
  'maxMainThreadLongTaskMs',
  'transferBytes',
  'maxCanonicalCacheBytes',
  'maxCanonicalCacheEntries',
  'cacheHits',
  'cacheMisses',
  'cacheEvictions',
  'obsoleteArtifactsReceived',
  'obsoleteArtifactsAccepted',
  'errorCount',
  'accountedIncrementalBytes',
]
const summary = Object.fromEntries(numericFields.map((field) => [
  field,
  median(results.map((result) => result.metrics[field])),
]))
summary.measuredIncrementalMemoryBytes = results.every(
  (result) => result.metrics.measuredIncrementalMemoryBytes !== null,
)
  ? median(results.map((result) => result.metrics.measuredIncrementalMemoryBytes))
  : null

const output = {
  environment: {
    url,
    browser: 'chromium',
    mode: 'Vite isolated benchmark entry',
    runs,
  },
  results,
  summary,
  passed: results.every((result) => result.passed),
}
await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`)
console.table(summary)
console.log(`V2 terrain results: ${outputPath}`)

if (!output.passed) {
  const failures = results.flatMap((result) => [
    ...result.gates.filter((gate) => !gate.passed).map(
      (gate) => `run ${result.iteration}: ${gate.name} ${gate.actual} exceeds ${gate.limit}`,
    ),
    ...result.errors.map((error) => `run ${result.iteration}: ${error}`),
  ])
  throw new Error(`V2 terrain stress gate failed:\n- ${failures.join('\n- ')}`)
}
