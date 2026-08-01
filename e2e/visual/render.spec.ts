import { expect, test, type Page } from '@playwright/test'

/**
 * What the renderer actually looks like.
 *
 * The rest of the suite asserts counts and text: triangles reaching the GPU,
 * headings, scan prose. None of it can see a picture, and every rendering bug
 * this project has had was found by a person looking at one — Earth wearing
 * invented continents, Mercury shaped like an asteroid, a system framed inside
 * its own star, a moon buried in its planet. All of them would have passed the
 * existing checks. These are the tests that would have caught them.
 *
 * Run with `bun run test:visual`; re-baseline with `bun run test:visual:update`
 * after looking at the diff and agreeing with it. Kept out of the main suite
 * and out of CI: baselines are per-platform, and these exist to catch changes
 * while somebody is working, not to gate a merge on a hosted runner whose
 * software rasteriser draws differently from a real GPU.
 *
 * The baselines are not committed, for the same reason — a shot recorded on
 * one GPU does not match another's, so record your own before the first run.
 * Two of the six are not yet reliable enough to trust a failure from: the
 * orbit views settle at slightly different camera positions between runs.
 * Treat a diff in `solar-orbit` or `alpha-centauri-scale` as a prompt to look
 * at the picture, not as a verdict, until the camera easing is deterministic.
 */

/**
 * Freeze time before the app starts.
 *
 * Every moving thing in the engine — rotation, orbits, water shimmer, the
 * star's granulation — is derived from an accumulated clock fed by the
 * animation-frame timestamp. Handing it the same timestamp forever leaves that
 * clock at zero, so the scene is identical on every run without touching a
 * line of production code or clicking Pause at a moment that varies.
 */
const FREEZE_TIME = () => {
  const raf = window.requestAnimationFrame.bind(window)
  // Deliberately not zero. The loop treats a falsy previous timestamp as "no
  // previous frame" and substitutes a default step, so handing it zero every
  // time made the clock advance at a steady 16 ms instead of stopping — which
  // looks frozen until you compare two captures of a world with clouds.
  window.requestAnimationFrame = (cb: FrameRequestCallback) => raf(() => cb(1e6))
}

/**
 * A window large enough to keep the canvas on screen.
 *
 * Not cosmetic. The engine suspends rendering while the canvas is scrolled out
 * of view, which is deliberate and good — but in a small window the canvas
 * leaves the viewport entirely and a screenshot captures a suspended frame
 * from whatever was on screen before. That cost an afternoon once.
 */
test.use({ viewport: { width: 1180, height: 900 } })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(FREEZE_TIME)
})

/** Wait until the drawn triangle count stops moving, then shoot the canvas. */
async function settled(page: Page): Promise<void> {
  let last = -1
  let streak = 0
  await expect
    .poll(async () => {
      const now = await page.evaluate(
        () => Number(document.querySelector('canvas')?.dataset.triangles ?? 0),
      )
      streak = now > 0 && now === last ? streak + 1 : 0
      last = now
      return streak
    }, { intervals: Array(40).fill(400) as number[], timeout: 30_000 })
    .toBeGreaterThanOrEqual(2)
}

async function shot(page: Page, name: string) {
  // Pausing does more than stop the world, which the frozen clock has already
  // done. The loop throttles passive frames to 30 fps by comparing timestamps,
  // and a frozen timestamp makes every frame look too early — so it renders
  // only on demand, and the camera's easing toward its framing never finishes
  // converging. A paused world skips the throttle entirely and settles.
  await page.getByRole('button', { name: 'Pause' }).click()
  await settled(page)
  await expect(page.locator('canvas')).toHaveScreenshot(name, {
    // A frozen clock makes this near-exact; the allowance covers driver-level
    // dithering rather than anything anybody could see.
    maxDiffPixelRatio: 0.01,
    // Baked maps and cloud shells arrive from the worker after the geometry
    // has settled, so the triangle count goes quiet before the pixels do.
    // Playwright re-captures until two frames agree; this gives it room to
    // outlast the slowest bake rather than baselining a half-painted world.
    timeout: 25_000,
  })
}

async function visitPlanet(page: Page, name: string) {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Systems' }).click()
  await page.getByRole('button', { name: new RegExp(name) }).click()
}

test('a real planet in detail wears its own map', async ({ page }) => {
  // The bug this catches: detailed mode discarding the photograph and
  // inventing continents from the seed.
  await visitPlanet(page, 'Earth')
  await page.getByRole('tab', { name: 'Sculpt' }).click()
  await page.getByRole('button', { name: 'Detailed', exact: true }).click()
  await shot(page, 'earth-detailed.png')
})

test('a small rocky world reads as a planet, not an asteroid', async ({ page }) => {
  // The bug this catches: relief amplitude high enough to make the silhouette
  // visibly lumpy.
  await visitPlanet(page, 'Mercury')
  await page.getByRole('tab', { name: 'Sculpt' }).click()
  await page.getByRole('button', { name: 'Detailed', exact: true }).click()
  await shot(page, 'mercury-detailed.png')
})

test('a sculpted world keeps its handmade terrain', async ({ page }) => {
  // The other side of the same change: flattening everything would be just as
  // wrong as the asteroid was.
  await page.goto('/')
  await page.getByRole('button', { name: 'Detailed', exact: true }).click()
  await shot(page, 'sculpted-detailed.png')
})

test('the Solar System draws its planets and their moons', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Systems' }).click()
  await page.getByRole('button', { name: 'Orbit view' }).click()
  await shot(page, 'solar-orbit.png')
})

test('a system with one close-in planet is not framed inside its star', async ({ page }) => {
  // The bug this catches: scale mode parking the camera at the outermost
  // orbit, which put Alpha Centauri A inside its own sun.
  await page.goto('/')
  await page.getByRole('tab', { name: 'Systems' }).click()
  await page.getByRole('button', { name: 'Alpha Centauri A' }).click()
  await page.getByRole('button', { name: 'Orbit view' }).click()
  await page.getByRole('button', { name: 'To scale' }).click()
  await shot(page, 'alpha-centauri-scale.png')
})

test('a moon shows the planet it orbits, clear of it', async ({ page }) => {
  // The bug this catches: a satellite drawn inside its own planet, and a
  // parent planet drawn as a flat disc of its average colour.
  await visitPlanet(page, 'Jupiter')
  await page.getByRole('button', { name: 'Europa', exact: true }).click()
  await shot(page, 'europa-with-jupiter.png')
})
