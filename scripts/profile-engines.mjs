/**
 * Profile the Orbit transition across rendering engines.
 *
 * The checked-in benchmark measures long tasks, which only Chromium reports —
 * Safari and WebKit have never implemented the Long Tasks API, so the numbers
 * driving `performance-budget.json` say nothing at all about what a Safari
 * visitor experiences. This measures the same stall portably instead: a task
 * that blocks the main thread also blocks requestAnimationFrame, so the
 * largest gap between frames is the stall, whichever engine is drawing.
 *
 * It also reports the renderer each engine actually used, which turned out to
 * matter more than anything else here — headless Chromium rasterises in
 * software, and software is far slower than the GPU the app really runs on.
 *
 *   bun scripts/profile-engines.mjs [--url http://localhost:4173] [--runs 3]
 *
 * WebKit needs a one-off `bunx playwright install webkit`. It is not Safari,
 * but it is Safari's engine on Safari's GPU stack, which is as close as an
 * automated run gets.
 */
import { chromium, webkit } from 'playwright'

function option(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? fallback : process.argv[i + 1]
}

const url = option('url', process.env.PERF_BASE_URL ?? 'http://localhost:4173')
const runs = Number(option('runs', '3'))

/** Recorded from the first frame, so the click has a baseline to compare to. */
const INSTRUMENT = () => {
  window.__gaps = { frames: [], clickAt: 0 }
  let last = performance.now()
  const tick = () => {
    const now = performance.now()
    window.__gaps.frames.push([last, now - last])
    last = now
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

async function once(type, opts) {
  const browser = await type.launch(opts)
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.addInitScript(INSTRUMENT)
  await page.goto(url)
  await page.getByRole('tab', { name: 'Systems' }).click()
  await page.waitForTimeout(2500)
  await page.evaluate(() => { window.__gaps.clickAt = performance.now() })
  await page.getByRole('button', { name: 'Orbit view' }).click()
  await page.waitForTimeout(7000)

  const result = await page.evaluate(() => {
    const { frames, clickAt } = window.__gaps
    const after = frames.filter(([at]) => at >= clickAt)
    const gaps = after.map(([, d]) => d).sort((a, b) => b - a)
    const gl = document.createElement('canvas').getContext('webgl')
    const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info')
    return {
      renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown',
      maxGap: Math.round(gaps[0] ?? 0),
      over50: gaps.filter((g) => g > 50).length,
      phases: Object.fromEntries(
        performance.getEntriesByType('measure')
          .filter((m) => m.name.startsWith('arc:orbit:'))
          .map((m) => [m.name.replace('arc:orbit:', ''), Math.round(m.duration * 10) / 10]),
      ),
      triangles: Number(document.querySelector('canvas')?.dataset.triangles ?? 0),
    }
  })
  await browser.close()
  return result
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

const engines = [
  ['WebKit', webkit, {}],
  ['Chromium headless', chromium, {}],
  ['Chromium headed', chromium, { headless: false }],
]

const rows = []
for (const [name, type, opts] of engines) {
  const samples = []
  for (let i = 0; i < runs; i++) samples.push(await once(type, opts))
  const phase = (k) => median(samples.map((s) => s.phases[k] ?? 0))
  rows.push({
    engine: name,
    renderer: String(samples[0].renderer).replace(/^ANGLE \(([^,]*),.*/, '$1').slice(0, 26),
    stallMs: median(samples.map((s) => s.maxGap)),
    framesOver50: median(samples.map((s) => s.over50)),
    shaderReadyMs: phase('shader-ready'),
    firstRenderMs: phase('first-render'),
    triangles: samples[0].triangles,
  })
}

console.table(rows)
console.log(
  '\nStall is the largest gap between animation frames after the Orbit click.\n' +
  'At or below the passive cadence (~33 ms at 30 fps) means nothing stalled at all.',
)
