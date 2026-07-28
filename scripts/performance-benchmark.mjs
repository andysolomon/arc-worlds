import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? fallback : process.argv[index + 1]
}

const root = resolve(import.meta.dirname, '..')
const url = option('url', process.env.PERF_BASE_URL ?? 'http://127.0.0.1:4174')
const runs = Number(option('runs', process.env.PERF_RUNS ?? '3'))
const outputPath = resolve(root, option('output', '.artifacts/performance/results.json'))
const cpuThrottle = Number(option('cpu-throttle', process.env.PERF_CPU_THROTTLE ?? '1'))
const worldTypes = [
  'Meadow',
  'Dune',
  'Frost',
  'Ember',
  'Candy',
  'Amber giant',
  'Mist giant',
  'Storm giant',
]

function metric(metrics, name) {
  return metrics.find((entry) => entry.name === name)?.value ?? 0
}

function delta(after, before, name) {
  return Math.round((metric(after.metrics, name) - metric(before.metrics, name)) * 1_000)
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle]
  return (sorted[middle - 1] + sorted[middle]) / 2
}

async function sample(browser, iteration) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  })
  const page = await context.newPage()
  const errors = []
  const workerUrls = []
  page.on('pageerror', (error) => errors.push(String(error)))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('worker', (worker) => workerUrls.push(worker.url()))

  try {
    const cdp = await context.newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottle })
    await cdp.send('Performance.enable')

    await page.goto(url, { waitUntil: 'networkidle' })
    await page.getByRole('tab', { name: 'Systems' }).click()
    await page.getByRole('button', { name: 'New, empty' }).click()
    for (const type of worldTypes) {
      await page.getByRole('button', { name: type, exact: true }).click()
    }
    await page.getByLabel('Name of world 8').waitFor()

    await page.evaluate(() => {
      const canvas = document.querySelector('canvas')
      const state = {
        clickStart: 0,
        firstSystemFrame: 0,
        initialTriangles: Number(canvas?.dataset.triangles ?? 0),
        longTasks: [],
        events: [],
        eventTimingSupported: false,
      }
      window.__arcPerformance = state

      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.startTime >= state.clickStart) {
            state.longTasks.push({ startTime: entry.startTime, duration: entry.duration })
          }
        }
      }).observe({ type: 'longtask', buffered: true })

      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.startTime >= state.clickStart) {
              state.events.push({
                name: entry.name,
                startTime: entry.startTime,
                duration: entry.duration,
                interactionId: entry.interactionId,
              })
            }
          }
        }).observe({ type: 'event', buffered: true, durationThreshold: 16 })
        state.eventTimingSupported = true
      } catch {
        state.eventTimingSupported = false
      }

      const orbit = [...document.querySelectorAll('button')]
        .find((button) => button.textContent?.trim() === 'Orbit view')
      orbit?.addEventListener('pointerdown', () => {
        state.clickStart = performance.now()
        const checkFrame = () => {
          const triangles = Number(canvas?.dataset.triangles ?? 0)
          if (triangles !== state.initialTriangles) state.firstSystemFrame = performance.now()
          else requestAnimationFrame(checkFrame)
        }
        requestAnimationFrame(checkFrame)
      }, { capture: true, once: true })
    })

    const before = await cdp.send('Performance.getMetrics')
    await page.getByRole('button', { name: 'Orbit view' }).click()
    await page.waitForFunction(() => window.__arcPerformance?.firstSystemFrame > 0, null, {
      timeout: 15_000,
    })
    await page.waitForTimeout(6_000)
    const after = await cdp.send('Performance.getMetrics')
    const state = await page.evaluate(() => window.__arcPerformance)
    const interactionEvents = state.events.filter((entry) => entry.interactionId > 0)
    const longTasks = state.longTasks.filter((entry) => entry.startTime >= state.clickStart)

    const activeStart = await page.evaluate(() =>
      Number(document.querySelector('canvas')?.dataset.frames ?? 0),
    )
    await page.waitForTimeout(3_000)
    const activeEnd = await page.evaluate(() =>
      Number(document.querySelector('canvas')?.dataset.frames ?? 0),
    )

    await page.getByRole('button', { name: 'Pause' }).click()
    await page.waitForTimeout(500)
    const pausedFramesStart = await page.evaluate(() =>
      Number(document.querySelector('canvas')?.dataset.frames ?? 0),
    )
    const pausedBefore = await cdp.send('Performance.getMetrics')
    await page.waitForTimeout(3_000)
    const pausedAfter = await cdp.send('Performance.getMetrics')
    const pausedFramesEnd = await page.evaluate(() =>
      Number(document.querySelector('canvas')?.dataset.frames ?? 0),
    )
    const workerResourceLoaded = await page.evaluate(() =>
      performance.getEntriesByType('resource').some((entry) =>
        entry.name.includes('bake.worker')),
    )

    return {
      iteration,
      firstSystemFrameMs: Math.round((state.firstSystemFrame - state.clickStart) * 10) / 10,
      interactionDurationMs: Math.max(
        0,
        ...interactionEvents.map((entry) => entry.duration),
      ),
      longTaskCount: longTasks.length,
      longTaskMaxMs:
        Math.round(Math.max(0, ...longTasks.map((entry) => entry.duration)) * 10) / 10,
      longTaskTotalMs:
        Math.round(longTasks.reduce((sum, entry) => sum + entry.duration, 0) * 10) / 10,
      taskDurationMs: delta(after, before, 'TaskDuration'),
      scriptDurationMs: delta(after, before, 'ScriptDuration'),
      activeRendererFps: Math.round(((activeEnd - activeStart) / 3) * 10) / 10,
      pausedFramesIn3s: pausedFramesEnd - pausedFramesStart,
      pausedTaskDurationMs: delta(pausedAfter, pausedBefore, 'TaskDuration'),
      workerLoaded:
        workerUrls.some((workerUrl) => /bake\.worker-.*\.js$/.test(workerUrl))
        || workerResourceLoaded,
      eventTimingSupported: state.eventTimingSupported,
      errorCount: errors.length,
      errors,
    }
  } finally {
    await context.close()
  }
}

if (!Number.isInteger(runs) || runs < 1) {
  throw new Error(`--runs must be a positive integer; received ${runs}`)
}
if (!Number.isFinite(cpuThrottle) || cpuThrottle < 1) {
  throw new Error(`--cpu-throttle must be at least 1; received ${cpuThrottle}`)
}

const browser = await chromium.launch({ headless: true })
const results = []
try {
  for (let iteration = 1; iteration <= runs; iteration++) {
    const result = await sample(browser, iteration)
    results.push(result)
    console.log(JSON.stringify(result))
  }
} finally {
  await browser.close()
}

const numericFields = [
  'firstSystemFrameMs',
  'interactionDurationMs',
  'longTaskCount',
  'longTaskMaxMs',
  'longTaskTotalMs',
  'taskDurationMs',
  'scriptDurationMs',
  'activeRendererFps',
  'pausedFramesIn3s',
  'pausedTaskDurationMs',
  'errorCount',
]
const summary = Object.fromEntries(numericFields.map((field) => [
  field,
  median(results.map((result) => result[field])),
]))
summary.workerLoaded = results.every((result) => result.workerLoaded)
summary.eventTimingSupported = results.every((result) => result.eventTimingSupported)

const output = {
  environment: {
    url,
    viewport: '1440x900',
    dpr: 2,
    cpuThrottle,
    runs,
    browser: 'chromium',
  },
  results,
  summary,
}

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`)
console.table(summary)
console.log(`Performance results: ${outputPath}`)
