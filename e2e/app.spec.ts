import { expect, test, type Page } from '@playwright/test'

/**
 * True once the renderer has actually put geometry on the GPU.
 *
 * The canvas cannot simply be read back: WebGL discards its drawing buffer
 * after compositing, so drawImage() of a live WebGL canvas returns blank. The
 * engine therefore publishes frame and triangle counts onto the canvas
 * dataset, which is a truthful signal rather than a proxy for one.
 */
async function hasDrawnGeometry(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const cv = document.querySelector('canvas')
    if (!cv) return false
    const frames = Number(cv.dataset.frames ?? 0)
    const tris = Number(cv.dataset.triangles ?? 0)
    return frames > 10 && tris > 100
  })
}

/**
 * Wait for geometry to reach the GPU, rather than for a length of time.
 *
 * Every one of these used to be a fixed sleep long enough for a cold machine,
 * which made the suite both slow and — under parallel contention, where a
 * worker can lose more than its budget — flaky. Polling the signal the engine
 * already publishes is faster when the machine is quick and patient when it
 * is not.
 */
async function awaitGeometry(page: Page): Promise<void> {
  await expect.poll(() => hasDrawnGeometry(page), { timeout: 30_000 }).toBe(true)
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(String(e)))
  // Surface unexpected errors on failure without asserting on every test.
  ;(page as unknown as { __errors: string[] }).__errors = errors
})

test('renders a planet on first load', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Peachmoss' })).toBeVisible()
  await expect(page.locator('canvas')).toBeVisible()
  await awaitGeometry(page)
})

test('pause lets the renderer go idle', async ({ page }) => {
  await page.goto('/')
  // The setup wants 10 rendered frames before pausing. Under full-suite
  // contention a cold renderer once managed only 9 inside the default 5 s,
  // so the poll gets room to spare — the assertion under test is below.
  await expect.poll(() =>
    page.evaluate(() => Number(document.querySelector('canvas')?.dataset.frames ?? 0)),
  { timeout: 20_000 }).toBeGreaterThan(10)

  await page.getByRole('button', { name: 'Pause' }).click()
  await page.waitForTimeout(500)
  const settled = await page.evaluate(() =>
    Number(document.querySelector('canvas')?.dataset.frames ?? 0),
  )
  await page.waitForTimeout(700)
  const after = await page.evaluate(() =>
    Number(document.querySelector('canvas')?.dataset.frames ?? 0),
  )
  expect(after).toBe(settled)
})

test('sculpting a world updates its identity', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Ember' }).click()
  await expect(page.getByText(/ember world/)).toBeVisible()

  await page.getByLabel('World name').fill('Cinder')
  await expect(page.getByRole('heading', { name: 'Cinder' })).toBeVisible()
})

test('surprise me produces a different world', async ({ page }) => {
  await page.goto('/')
  const seed = page.getByLabel('Seed', { exact: true })
  const before = await seed.inputValue()
  await page.getByRole('button', { name: 'Surprise me' }).click()
  await expect(seed).not.toHaveValue(before)
})

test('the spectrometer reports a real planet with its measured profile', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Systems' }).click()
  await page.getByRole('button', { name: /Saturn/ }).click()
  await expect(page.getByRole('heading', { name: 'Saturn' })).toBeVisible()

  await page.getByRole('tab', { name: 'Scan' }).click()
  await page.getByRole('button', { name: /Run spectrometer on Saturn/ }).click()

  // The sweep animation is deliberately ~2.1s before the reading lands.
  await expect(page.getByText('no surface')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Hydrogen', { exact: false }).first()).toBeVisible()

  await page.getByRole('button', { name: 'Light' }).click()
  await expect(page.locator('.spectrum')).toBeVisible()
})

test('the orbit view renders the solar system', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Systems' }).click()
  await page.getByRole('button', { name: 'Orbit view' }).click()
  await expect(page.getByRole('heading', { name: 'The Solar System' })).toBeVisible()
  await awaitGeometry(page)

  await page.getByRole('button', { name: 'To scale' }).click()
  await awaitGeometry(page)
})

test('every planet texture loads', async ({ page }) => {
  const failed: string[] = []
  page.on('response', (r) => {
    if (r.url().includes('/images2k/') && r.status() >= 400) failed.push(r.url())
  })

  await page.goto('/')
  await page.getByRole('tab', { name: 'Systems' }).click()
  await page.getByRole('button', { name: 'Orbit view' }).click()
  // Poll until every map has been requested rather than guessing how long
  // eight fetches take on a loaded machine.
  const mapsRequested = () =>
    page.evaluate(() =>
      performance.getEntriesByType('resource').filter((r) => r.name.includes('/images2k/')).length,
    )
  await expect.poll(mapsRequested, { timeout: 30_000 }).toBeGreaterThanOrEqual(8)

  const loaded = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .filter((r) => r.name.includes('/images2k/'))
      .map((r) => r.name.split('/').pop()),
  )

  expect(failed).toEqual([])
  // All eight planet maps are requested by the orbit view.
  for (const f of ['mercury.jpg', 'venus.jpg', 'earth.jpg', 'mars.jpg', 'jupiter.jpg', 'saturn.jpg', 'uranus.jpg', 'neptune.jpg']) {
    expect(loaded).toContain(f)
  }
})

test('a system built from your own worlds renders in orbit', async ({ page }) => {
  // Three sculpt round trips make this the longest test in the suite; under
  // 6-worker contention it finishes within a second of the default cap.
  test.slow()
  const workerUrls: string[] = []
  page.on('worker', (worker) => workerUrls.push(worker.url()))
  await page.goto('/')
  await page.getByRole('tab', { name: 'Systems' }).click()
  await page.getByRole('button', { name: 'New, empty' }).click()

  // Nothing orbits it yet, so there is nothing to save.
  await expect(page.getByRole('button', { name: /Save & share/ })).toBeDisabled()

  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: /^\+ Add/ }).click()
    await page.getByRole('button', { name: 'Surprise me' }).click()
    await page.getByRole('tab', { name: 'Systems' }).click()
  }

  await expect(page.getByLabel('Name of world 3')).toBeVisible()
  await expect(page.getByRole('button', { name: /Save & share/ })).toBeEnabled()

  await page.getByRole('button', { name: 'Orbit view' }).click()
  await awaitGeometry(page)
  expect(workerUrls.some((url) => /bake\.worker-.*\.js$/.test(url))).toBe(true)

  // Each world orbits further out than the last, so a year gets longer too.
  await page.getByRole('button', { name: 'Body list' }).click()
  const cards = page.locator('.card .sub')
  const au = await cards.evaluateAll((els) =>
    els.map((e) => Number(/([\d.]+) AU/.exec(e.textContent ?? '')?.[1] ?? NaN)),
  )
  expect(au.length).toBeGreaterThanOrEqual(3)
  for (let i = 1; i < au.length; i++) expect(au[i]).toBeGreaterThan(au[i - 1])
})

test('a system can be filled without ever leaving the Systems tab', async ({ page }) => {
  test.slow() // same pressure as its neighbour: ~27 s under 6-worker contention
  await page.goto('/')
  await page.getByRole('tab', { name: 'Systems' }).click()
  await page.getByRole('button', { name: 'New, empty' }).click()
  await expect(page.getByRole('button', { name: /Save & share/ })).toBeDisabled()

  // One click per world, and not one trip through the sculptor.
  for (const type of ['Meadow', 'Frost', 'Storm giant']) {
    await page.getByRole('button', { name: type, exact: true }).click()
  }
  await page.getByTitle('Roll a new world of any type into orbit').click()

  await expect(page.getByLabel('Name of world 4')).toBeVisible()
  await expect(page.getByRole('button', { name: /Save & share/ })).toBeEnabled()

  // A duplicate joins the same line of worlds, on its own orbit further out.
  // Rolled names sometimes already carry a regnal suffix, and the line
  // continues from there — a copy of Wimpond III is Wimpond IV — so the
  // expectation follows the family rather than hardcoding "II".
  const first = await page.getByLabel('Name of world 1').inputValue()
  const base = first.replace(/ (?:II|III|IV)$/, '')
  await page.locator('.scan-card').first().getByRole('button', { name: /^Duplicate/ }).click()
  await expect(page.getByLabel('Name of world 5')).toHaveValue(
    new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (?:II|III|IV|V)$`),
  )

  await page.getByRole('button', { name: 'Orbit view' }).click()
  await awaitGeometry(page)
})

test('adding a world never edits a read-only system in place', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Systems' }).click()

  // The Solar System offers no way to add to it at all …
  await expect(page.getByRole('button', { name: 'Meadow', exact: true })).toHaveCount(0)

  // … and duplicating it is what makes those controls appear.
  await page.getByRole('button', { name: 'Duplicate & edit' }).click()
  await expect(page.getByText(/The Solar System \(copy\)/).first()).toBeVisible()
  await page.getByRole('button', { name: 'Meadow', exact: true }).click()
  await expect(page.getByLabel('Name of world 10')).toBeVisible()

  // The original is still there, still measured, still nine bodies.
  await page.getByRole('button', { name: 'The Solar System', exact: true }).click()
  // Choosing a system now opens the orbit view; its provenance and body list
  // both live one click away.
  await page.getByRole('button', { name: 'Body list' }).click()
  await expect(page.getByText(/every number measured/)).toBeVisible()
  // Nine planets, plus the seven moons that are worlds in their own right.
  await expect(page.getByRole('button', { name: /Visit/ })).toHaveCount(16)
})

test('moving Earth to the sixth-planet orbit freezes its water and biosphere', async ({ page }) => {
  test.slow() // system edit, a fresh v2 terrain artifact, and the scan sweep
  await page.goto('/')
  await page.getByRole('tab', { name: 'Systems' }).click()
  await expect(page.getByRole('button', { name: /^Earth/ })).toContainText(/surface water/)

  await page.getByRole('button', { name: 'Duplicate & edit' }).click()
  const earthEditor = page.locator('.scan-card').filter({
    has: page.getByLabel('Name of world 3'),
  })
  await expect(earthEditor.getByLabel('Name of world 3')).toHaveValue('Earth')

  // The logarithmic distance slider's 0.69 position is 5.33 AU, effectively
  // Jupiter's 5.20 AU sixth-planet orbit for this first-order climate model.
  await earthEditor.getByLabel('Distance').fill('0.69')
  await expect(earthEditor).toContainText('globally frozen')
  await expect(earthEditor).toContainText(/outside/i)

  await page.getByRole('button', { name: 'Body list' }).click()
  await page.getByRole('button', { name: /^Earth/ }).click()
  await expect(page.getByRole('heading', { name: 'Earth' })).toBeVisible()
  await awaitGeometry(page)

  await page.getByRole('tab', { name: 'Scan' }).click()
  await page.getByRole('button', { name: /Run spectrometer on Earth/ }).click()
  await expect(page.getByText(/globally frozen/)).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Surface & water' }).click()
  await expect(page.getByText(/Water — frozen, everywhere/)).toBeVisible()
  await expect(page.getByText('No biosignature', { exact: true })).toBeVisible()
})

test('an imagined system is never presented as a measured one', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Systems' }).click()

  await expect(page.getByText(/every number measured/)).toBeVisible()

  await page.getByRole('button', { name: 'Andromeda' }).click()
  // Choosing a system now opens the orbit view; its provenance is stated on
  // the body list, which is a click away.
  await page.getByRole('button', { name: 'Body list' }).click()
  await expect(page.getByText(/not a measured system/)).toBeVisible()
  await page.getByRole('button', { name: 'Orbit view' }).click()
  await awaitGeometry(page)
})

test('a heavier star is drawn as a bigger one', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Systems' }).click()
  await page.getByRole('button', { name: 'New, empty' }).click()

  // Picking a star is really picking a mass, so the swatches cannot all match.
  const widths = await page.locator('.chip', { hasText: /dwarf|star/ }).evaluateAll((els) =>
    els.map((e) => e.querySelector('.dot')!.getBoundingClientRect().width),
  )
  expect(widths.length).toBe(6)
  for (let i = 1; i < widths.length; i++) expect(widths[i]).toBeGreaterThan(widths[i - 1])

  // And the renderer agrees with the swatch rather than drawing one fixed sun.
  await page.getByRole('button', { name: 'Orbit view' }).click()
  const sunScale = () =>
    page.evaluate(() => Number(document.querySelector('canvas')!.dataset.sunScale ?? 0))
  const sunFor = async (kind: string) => {
    // Not the first change: choosing a star re-times every orbit, which blanks
    // the size mode, which resizes the star a second time. Waiting for the
    // published radius to settle takes both steps into account.
    const before = await sunScale()
    await page.getByRole('button', { name: kind, exact: true }).click()
    return settledValue(sunScale, { accept: (v) => v > 0 && v !== before })
  }
  const dwarf = await sunFor('red dwarf')
  const blue = await sunFor('blue-white star')
  expect(dwarf).toBeGreaterThan(0)
  expect(blue).toBeGreaterThan(dwarf * 1.5)

  // Each star kind recompiles nothing, but it does drive fresh values through
  // the star shader; a broken one shows up here rather than as a black sun.
  const errors = (page as unknown as { __errors: string[] }).__errors
  expect(errors.filter((e) => /shader|glsl|webgl|program/i.test(e))).toEqual([])
})

test('the gallery degrades gracefully when the API is unavailable', async ({ page }) => {
  await page.route('**/api/worlds*', (r) => r.abort())
  await page.goto('/')
  await page.getByRole('tab', { name: 'Worlds' }).click()
  // It must say something useful rather than hanging on a spinner.
  await expect(page.getByText(/Could not reach the gallery|Nothing here yet/)).toBeVisible({
    timeout: 10_000,
  })
})

/**
 * The gallery is scoped server-side by this header, so if the browser ever stops
 * sending one — or two browsers send the same one — every visitor is back to
 * sharing a single gallery. This asserts the client half of that; the server
 * filters on the same key.
 */
test('each browser asks for its own gallery', async ({ browser }) => {
  async function keyFor() {
    const context = await browser.newContext()
    const page = await context.newPage()

    let key: string | null = null
    await page.route('**/api/worlds*', async (route) => {
      key ??= route.request().headers()['x-owner-key'] ?? null
      await route.fulfill({ status: 200, json: { worlds: [] } })
    })

    await page.goto('/')
    await page.getByRole('tab', { name: 'Worlds' }).click()
    await expect(page.getByText(/Nothing here yet/)).toBeVisible({ timeout: 10_000 })

    await context.close()
    return key
  }

  const [first, second] = [await keyFor(), await keyFor()]

  expect(first).toMatch(/^[A-Za-z0-9_-]{16,64}$/)
  expect(second).toMatch(/^[A-Za-z0-9_-]{16,64}$/)
  expect(first).not.toBe(second)
})

/** The engine publishes draw counts on the canvas; orbit paths render as lines. */
function datum(page: Page, key: 'lines' | 'triangles' | 'points'): Promise<number> {
  return page.evaluate((k) => Number(document.querySelector('canvas')?.dataset[k] ?? -1), key)
}

/**
 * Sweep the pointer across the canvas until it crosses a planet, or give up.
 * Planet positions depend on when the orbits were frozen, so this searches
 * rather than aiming — the ecliptic band covers the middle of the view. The
 * coarse pass misses every disc perhaps once in a dozen runs, so a staggered
 * finer pass covers the gaps between its sample points before giving up.
 */
async function sweepForHover(page: Page): Promise<number> {
  const box = (await page.locator('canvas').boundingBox())!
  const passes: Array<{ y0: number; dy: number; x0: number; dx: number }> = [
    { y0: 0.3, dy: 0.08, x0: 0.08, dx: 0.06 },
    { y0: 0.26, dy: 0.04, x0: 0.05, dx: 0.03 },
  ]
  for (const s of passes) {
    for (let ty = s.y0; ty <= 0.74; ty += s.dy) {
      for (let tx = s.x0; tx <= 0.95; tx += s.dx) {
        await page.mouse.move(box.x + box.width * tx, box.y + box.height * ty)
        await page.waitForTimeout(25)
        const n = await datum(page, 'lines')
        if (n > 0) return n
      }
    }
  }
  return 0
}

test('hidden orbit paths come back one at a time on hover', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Systems' }).click()
  await page.getByRole('button', { name: 'Orbit view' }).click()
  await expect.poll(() => datum(page, 'lines')).toBeGreaterThan(0)

  await page.getByRole('button', { name: 'Orbit paths' }).click()
  await expect.poll(() => datum(page, 'lines')).toBe(0)

  // Freeze the planets, then find one with the pointer; only its own path
  // fades back in while every other one stays hidden.
  await page.getByRole('button', { name: 'Pause' }).click()
  expect(await sweepForHover(page)).toBeGreaterThan(0)
})

/**
 * The freshly opened orbit view keeps adding geometry for a moment — baked
 * maps land, late meshes appear — and how long that takes depends on machine
 * load. Wait for the triangle count to hold still rather than trusting a
 * fixed sleep, or a busy CI runner captures a stale baseline.
 */
/**
 * Read a published value once it has stopped moving.
 *
 * Polling for the first change is not enough for anything the engine reaches
 * in more than one step: clicking a star kind, for instance, republishes the
 * star's drawn radius when the orbits re-time and again when the size mode is
 * reapplied, so the first change is an intermediate value. Waiting for three
 * equal samples takes whatever the machine needs and no longer.
 */
async function settledValue(
  read: () => Promise<number>,
  { accept = (v: number) => v > 0, step = 300, timeout = 25_000 } = {},
): Promise<number> {
  let last = Number.NaN
  let streak = 0
  await expect
    .poll(async () => {
      const now = await read()
      streak = accept(now) && now === last ? streak + 1 : 0
      last = now
      return streak
    }, { intervals: Array(Math.ceil(timeout / step)).fill(step) as number[], timeout })
    .toBeGreaterThanOrEqual(2)
  return last
}

function settledTriangles(page: Page): Promise<number> {
  return settledValue(() => datum(page, 'triangles'), { step: 700 })
}

test('labels are opt-in and add geometry only while they are on', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Systems' }).click()
  await page.getByRole('button', { name: 'Orbit view' }).click()
  const before = await settledTriangles(page)

  // Labels draw as sprites, so the triangle count is a truthful signal.
  await page.getByRole('button', { name: 'Labels' }).click()
  await expect.poll(() => datum(page, 'triangles')).toBeGreaterThan(before)

  await page.getByRole('button', { name: 'Labels' }).click()
  await expect.poll(() => datum(page, 'triangles')).toBe(before)
})

test('turning moons off skips their geometry and their paths', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Systems' }).click()
  await page.getByRole('button', { name: /Saturn/ }).click()
  await expect(page.getByRole('heading', { name: 'Saturn' })).toBeVisible()
  const withMoons = await settledTriangles(page)
  expect(withMoons).toBeGreaterThan(0)
  // Six moons, six coloured paths.
  expect(await datum(page, 'lines')).toBeGreaterThan(0)

  await page.getByRole('tab', { name: 'Systems' }).click()
  await page.getByRole('button', { name: 'Moons' }).click()
  await expect.poll(() => datum(page, 'triangles')).toBeLessThan(withMoons)
  await expect.poll(() => datum(page, 'lines')).toBe(0)
})

test('Pluto is there, odd orbit and all, and scans as itself', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Systems' }).click()

  // Far and slow: the body list states the measured distance and period.
  await expect(page.getByText('39.5 AU · 248 year orbit')).toBeVisible()

  await page.getByRole('button', { name: /Pluto/ }).click()
  await expect(page.getByRole('heading', { name: 'Pluto' })).toBeVisible()

  // No photographic map exists for it, so the procedural renderer carries it —
  // and its measured identity survives that, all the way into the spectrometer.
  await page.getByRole('tab', { name: 'Scan' }).click()
  await page.getByRole('button', { name: /Run spectrometer on Pluto/ }).click()
  await expect(page.getByText('Thin nitrogen, seasonally alive')).toBeVisible({ timeout: 15_000 })

  // The heart lives in the surface reading, and the panel opens on Atmosphere.
  await page.getByRole('button', { name: 'Surface & water' }).click()
  await expect(page.getByText('Sputnik Planitia', { exact: false }).first()).toBeVisible()
})

test('the Worlds tab aims Add at any saved system, and warns before a duplicate', async ({ page }) => {
  // Fixtures via route interception, so the flow is deterministic and needs
  // no database: one saved world, and one saved system already holding it.
  const params = {
    seed: 12321, preset: 'temperate', mountains: 0.5, water: 0.55, roughness: 0.5,
    clouds: 0.5, glow: 0.5, ice: 0.25, lightAz: 0.107, lightEl: 0.639, spinDir: 1,
    spinSpeed: 0.5, rings: false, ringN: 2, ringInner: 0.24, ringTilt: 0.5,
    ringWidth: 0.5, ringGap: 0.35, ringOpacity: 0.7, ringColor: null, moons: 0,
    atmoColor: null, texture: null, cloudTexture: null,
  }
  const world = {
    slug: 'wtest', name: 'Testball', params, dot: '#7fae62',
    sub: 'meadow world · seed 12321', createdAt: '2026-07-28T00:00:00Z',
  }
  const fixture = {
    slug: 'stest', name: 'Fixture System', dot: '#ffb478', sub: '1 world',
    createdAt: '2026-07-28T00:00:00Z',
    def: {
      id: 'fixture', name: 'Fixture System', sub: 'a system of your own', origin: 'custom',
      star: { name: 'Halcyon', color: 0xffb478, mass: 1 },
      bodies: [{
        name: 'Testball', a: 1, period: 1, e: 0, inc: 0, node: 0, peri: 0,
        radius: 1, tilt: 0, flattening: 0.003, day: 24, params, texture: null, ring: null,
      }],
    },
  }
  await page.route('**/api/worlds*', (r) => r.fulfill({ json: { worlds: [world] } }))
  await page.route('**/api/systems*', (r) => r.fulfill({ json: { systems: [fixture] } }))

  await page.goto('/')
  await page.getByRole('tab', { name: 'Worlds' }).click()

  // The default destination is whatever the Systems tab is showing — the
  // read-only Solar System, so Add promises an editable copy and delivers one.
  await expect(page.getByText(/read-only, so you will get an editable copy/)).toBeVisible()
  const addToCurrent = page.getByRole('button', { name: 'Add Testball to The Solar System' })
  await addToCurrent.click()
  await expect(addToCurrent).toHaveText('Added')
  await page.getByRole('tab', { name: 'Systems' }).click()
  await expect(page.getByText(/The Solar System \(copy\)/).first()).toBeVisible()

  // Aim at the saved system instead. Testball already orbits there, so Add
  // warns; Cancel stands down.
  await page.getByRole('tab', { name: 'Worlds' }).click()
  await page.getByLabel('System to add worlds to').selectOption('stest')
  await page.getByRole('button', { name: 'Add Testball to Fixture System' }).click()
  await expect(page.getByText(/already orbiting in Fixture System/)).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByText(/already orbiting/)).toHaveCount(0)

  // Asked again and confirmed, the duplicate goes through — allowed, not silent.
  await page.getByRole('button', { name: 'Add Testball to Fixture System' }).click()
  await page.getByRole('button', { name: 'Add anyway' }).click()
  await page.getByRole('tab', { name: 'Systems' }).click()
  await expect(page.getByRole('button', { name: /Fixture System/, pressed: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Visit/ })).toHaveCount(2)
})

test('TRAPPIST-1 wears measured orbits on imagined worlds', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Systems' }).click()
  await page.getByRole('button', { name: 'TRAPPIST-1' }).click()
  // Choosing a system now opens the orbit view; the body list is a click away.
  await page.getByRole('button', { name: 'Body list' }).click()

  // The honest split is stated up front, and all seven planets are here.
  await expect(page.getByText(/nobody has seen these surfaces/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Visit/ })).toHaveCount(7)
  // TRAPPIST-1 b's 1.5-day year is quoted, not rounded into fiction.
  await expect(page.getByText('1.5 day year', { exact: false })).toBeVisible()

  await page.getByRole('button', { name: 'Orbit view' }).click()
  await awaitGeometry(page)

  await page.getByRole('button', { name: 'Body list' }).click()
  await page.getByRole('button', { name: /TRAPPIST-1 e/ }).click()
  await expect(page.getByRole('heading', { name: 'TRAPPIST-1 e' })).toBeVisible()
})

test('an ancient world loads whole and scans as a reconstruction', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Archean Earth' }).click()
  await expect(page.getByRole('heading', { name: 'Archean Earth' })).toBeVisible()
  await expect(page.getByText(/archean world/)).toBeVisible()

  // The reconstruction says it is one, in its first breath.
  await page.getByRole('tab', { name: 'Scan' }).click()
  await page.getByRole('button', { name: /Run spectrometer on Archean Earth/ }).click()
  await expect(page.getByText('Reconstructed: anoxic, and orange')).toBeVisible({ timeout: 15_000 })

  // The biosignature verdict renders in the surface section, not the default.
  await page.getByRole('button', { name: 'Surface & water' }).click()
  await expect(page.getByText('Alive, but not advertising')).toBeVisible()
})

test('Pandora orbits Polyphemus, and is still a whole world', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Systems' }).click()
  await page.getByRole('button', { name: 'Alpha Centauri A' }).click()
  // Choosing a system now opens the orbit view; the body list is a click away.
  await page.getByRole('button', { name: 'Body list' }).click()
  await expect(page.getByText(/Pandora and the giant it orbits/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Visit/ })).toHaveCount(2)

  // It orbits its planet rather than the star, and the orbit view draws it
  // there — a satellite that is nonetheless visitable and scannable.
  await page.getByRole('button', { name: 'Orbit view' }).click()
  await awaitGeometry(page)

  await page.getByRole('button', { name: 'Body list' }).click()
  await page.getByRole('button', { name: /Pandora/ }).click()
  await expect(page.getByRole('heading', { name: 'Pandora' })).toBeVisible()

  await page.getByRole('tab', { name: 'Scan' }).click()
  await page.getByRole('button', { name: /Run spectrometer on Pandora/ }).click()
  await expect(page.getByText('Fiction: rich air, wrong for us')).toBeVisible({ timeout: 15_000 })

  await page.getByRole('button', { name: 'Surface & water' }).click()
  await expect(page.getByText('Strong — and networked')).toBeVisible()
})

test('the moons toggle drops every satellite from the orbit view', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Systems' }).click()
  await page.getByRole('button', { name: 'Orbit view' }).click()
  const withMoons = await settledTriangles(page)

  // Moons off is the performance lever, and satellites are moons: they are
  // not built at all, so the geometry actually leaves the scene.
  await page.getByRole('button', { name: 'Moons' }).click()
  await expect.poll(() => datum(page, 'triangles')).toBeLessThan(withMoons)

  await page.getByRole('button', { name: 'Moons' }).click()
  await expect.poll(() => datum(page, 'triangles')).toBe(withMoons)
})

test('single worlds always use the detailed presentation with no tier control', async ({ page }) => {
  await page.goto('/')
  const detailed = await settledTriangles(page)
  expect(detailed).toBeGreaterThan(20_000)
  await expect(page.getByText('Rendering', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^(Auto|Flat|Detailed)$/ })).toHaveCount(0)
})

test('a gas giant keeps its specialized animated atmosphere without a tier choice', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Amber giant' }).click()
  expect(await settledTriangles(page)).toBeGreaterThan(10_000)
  await expect(page.getByRole('button', { name: /^(Auto|Flat|Detailed)$/ })).toHaveCount(0)
})

test('the universe is yours to tune, and the sky survives a reload', async ({ page }) => {
  await page.goto('/')
  // The classic sky is exactly half the pool — the default draws the same
  // 1400 stars the app has always drawn.
  await expect.poll(() => datum(page, 'points')).toBe(1400)

  await page.getByRole('tab', { name: 'Systems' }).click()
  await page.getByLabel('Star density').focus()
  await page.keyboard.press('End')
  await expect.poll(() => datum(page, 'points')).toBe(2800)

  // The nebula is CSS behind the transparent canvas — free to the GPU.
  await page.getByRole('button', { name: 'Violet' }).click()
  await expect(page.locator('[data-nebula="on"]')).toBeVisible()

  // A viewer preference, so it persists per browser.
  await page.reload()
  await expect.poll(() => datum(page, 'points')).toBe(2800)
  await expect(page.locator('[data-nebula="on"]')).toBeVisible()
})

test('a moon is a world you can visit and scan', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Systems' }).click()
  await page.getByRole('button', { name: /Jupiter/ }).click()
  await expect(page.getByRole('heading', { name: 'Jupiter' })).toBeVisible()

  // The Galilean moons orbit Jupiter on the canvas and are clickable there,
  // but they are also offered as buttons — a few pixels of moving sprite is
  // no way to be the only way in.
  await page.getByRole('button', { name: 'Europa', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Europa' })).toBeVisible()

  // It arrives as a world in its own right, scanning from measured prose
  // rather than from the sliders.
  await page.getByRole('tab', { name: 'Scan' }).click()
  await page.getByRole('button', { name: /Run spectrometer on Europa/ }).click()
  await expect(page.getByText('Thin oxygen, made by radiation')).toBeVisible({ timeout: 15_000 })

  // The ocean is the headline, and it lives in the surface section.
  await page.getByRole('button', { name: 'Surface & water' }).click()
  await expect(page.getByText('a global ocean, under the ice')).toBeVisible()

  // Reseeding detaches it into an ordinary icy world, exactly like Pluto.
  await page.getByRole('tab', { name: 'Sculpt' }).click()
  await page.getByLabel('Seed', { exact: true }).fill('12345')
  await page.getByRole('tab', { name: 'Scan' }).click()
  await page.getByRole('button', { name: /Run spectrometer on Europa/ }).click()
  await expect(page.getByText('Thin oxygen, made by radiation')).toHaveCount(0, { timeout: 15_000 })
})

test('you can give a world of your own a moon', async ({ page }) => {
  test.slow() // a sculpt round trip plus an orbit render
  await page.goto('/')
  await page.getByRole('tab', { name: 'Systems' }).click()
  await page.getByRole('button', { name: 'New, empty' }).click()
  await page.getByRole('button', { name: 'Amber giant', exact: true }).click()

  // The giant is the only world here, so it is the only thing a moon could
  // orbit — and the button says so.
  const giant = page.getByLabel('Name of world 1')
  const name = await giant.inputValue()
  await page.getByRole('button', { name: `Add a moon to ${name}` }).click()

  // The moon arrives as a second world, orbiting the first rather than the
  // star, with its distance quoted in the planet's own radii.
  await expect(page.getByLabel('Name of world 2')).toBeVisible()
  const moon = page.getByLabel('Name of world 2')
  const moonName = await moon.inputValue()
  await expect(page.getByLabel(`What ${moonName} orbits`)).toHaveValue(name)
  await expect(page.getByText(/radii/).first()).toBeVisible()

  // A planet carrying a moon cannot itself become one.
  await expect(page.getByLabel(`What ${name} orbits`)).toBeDisabled()

  // It draws where it belongs, and hands the moon back to the star cleanly.
  await page.getByRole('button', { name: 'Orbit view' }).click()
  await awaitGeometry(page)

  await page.getByRole('button', { name: 'Body list' }).click()
  await page.getByLabel(`What ${moonName} orbits`).selectOption('')
  await expect(page.getByLabel(`What ${name} orbits`)).toBeEnabled()
  await expect(page.getByText(/radii/)).toHaveCount(0)
})

test('display choices survive a reload', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Systems' }).click()
  await page.getByRole('button', { name: 'Orbit paths' }).click()
  await expect(page.getByRole('button', { name: 'Orbit paths' })).toHaveAttribute(
    'aria-pressed', 'false',
  )

  await page.reload()
  await page.getByRole('tab', { name: 'Systems' }).click()
  await expect(page.getByRole('button', { name: 'Orbit paths' })).toHaveAttribute(
    'aria-pressed', 'false',
  )

  // The renderer honours the remembered choice, not just the chip.
  await page.getByRole('button', { name: 'Orbit view' }).click()
  await awaitGeometry(page)
  expect(await datum(page, 'lines')).toBe(0)
})

test('the offer to join a system is one the button keeps', async ({ page }) => {
  await page.goto('/')
  // A freshly sculpted world belongs to nothing, so back has nowhere to go —
  // and offers a destination instead of a return.
  const back = page.locator('.btn-back')
  await expect(back).toHaveText('‹ Add to The Solar System')

  await back.click()
  // Read-only systems are never edited in place, so the world lands in a copy
  // — and the view that opens is the one it has just joined.
  await expect(page.getByRole('heading', { name: 'The Solar System (copy)' })).toBeVisible()
  await awaitGeometry(page)

  await page.getByRole('button', { name: 'Body list' }).click()
  await expect(page.locator('input[value="Peachmoss"]')).toBeVisible()
  // Having joined, it has somewhere to go back to, so the offer is withdrawn.
  await expect(back).toHaveText('‹ The Solar System (copy)')
})

test('the planet in a moon\u2019s sky is a place you can travel to', async ({ page }) => {
  test.slow() // the planet has to come round before it can be clicked
  await page.goto('/')
  await page.getByRole('tab', { name: 'Systems' }).click()
  await page.getByRole('button', { name: /Saturn/ }).click()
  await page.getByRole('button', { name: 'Titan', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Titan' })).toBeVisible()
  await awaitGeometry(page)

  const box = (await page.locator('canvas').boundingBox())!
  // Saturn wheels around Titan as the moon turns — one face always inward —
  // so for part of every turn it is off the side of the view entirely. Wind
  // time forward until it is somewhere clickable, then stop the clock so it
  // is still there when the click lands. Where it is drawn is published for
  // the same reason the frame counts are: the canvas cannot be read back.
  const drawnAt = async () => {
    const at = await page.evaluate(() => document.querySelector('canvas')?.dataset.parent)
    return at ? (at.split(',').map(Number) as [number, number]) : null
  }
  const clickable = (at: [number, number] | null) =>
    !!at && at[0] > 80 && at[0] < box.width - 80 && at[1] > 80 && at[1] < box.height - 80

  await page.getByRole('button', { name: '20×' }).click()
  await expect.poll(async () => clickable(await drawnAt()), { timeout: 60_000 }).toBe(true)
  await page.getByRole('button', { name: 'Pause' }).click()

  const at = await drawnAt()
  // Stopped means stopped: whatever was in reach a moment ago still is.
  expect(clickable(at)).toBe(true)
  await page.mouse.click(box.x + at![0], box.y + at![1])
  await expect(page.getByRole('heading', { name: 'Saturn' })).toBeVisible()
})

test('holding on hover stops the clock, and only while asked', async ({ page }) => {
  await page.goto('/')
  await awaitGeometry(page)
  const box = (await page.locator('canvas').boundingBox())!
  const onTheWorld = () => page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  const offIt = () => page.mouse.move(box.x + 8, box.y + 8)
  const frames = () =>
    page.evaluate(() => Number(document.querySelector('canvas')?.dataset.frames ?? 0))

  /**
   * Wait for the clock to prove it is running.
   *
   * The counter is published every tenth frame, so a fixed 900 ms window at the
   * 30 fps passive cadence holds only two or three ticks of it — and on a busy
   * machine, sometimes none. That made this test fail for reasons that had
   * nothing to do with hovering. Polling asserts the same thing without a
   * stopwatch: sooner or later, a running clock advances.
   */
  const expectRunning = async () => {
    const from = await frames()
    await expect.poll(frames, { timeout: 15_000 }).toBeGreaterThan(from)
  }

  // Off by default: resting on the world changes nothing.
  await onTheWorld()
  await expectRunning()

  await page.getByRole('button', { name: 'Hold on hover' }).click()
  // Leave and return, so the engine sees the pointer arrive with the option on.
  await offIt()
  await page.waitForTimeout(300)
  await onTheWorld()
  // Held is the assertion that has to stay on a stopwatch: proving something
  // never happens means watching for a while and seeing it not happen.
  await page.waitForTimeout(900)
  const held = await frames()
  await page.waitForTimeout(1500)
  expect(await frames()).toBe(held)

  // The sky is not a body: moving off the world starts it again.
  await offIt()
  await expectRunning()
})

test('the Moon stands in front of the sun, and the Earth wears the shadow', async ({ page }) => {
  test.slow() // eclipses arrive in seasons, and a season has to come round
  await page.goto('/')
  await page.getByRole('tab', { name: 'Systems' }).click()
  await page.getByRole('button', { name: 'Body list' }).click()
  await page.getByRole('button', { name: /^Earth/ }).click()
  await expect(page.getByRole('heading', { name: 'Earth' })).toBeVisible()
  await awaitGeometry(page)

  // A shadow is geometry, not decoration — and the drawing buffer is gone by
  // the time a test could look at it, so the engine publishes how many times a
  // moon has stood between the sun and the world. Wound forward, the Moon's
  // orbit precesses into line with the sunlight and the shadows start falling.
  const eclipses = () =>
    page.evaluate(() => Number(document.querySelector('canvas')?.dataset.eclipses ?? 0))
  await page.getByRole('button', { name: '20×' }).click()
  await expect.poll(eclipses, { timeout: 90_000 }).toBeGreaterThan(0)

  // And it is the Moon casting it. With no moon there is nothing in the sky to
  // cast one, so the count stops where it stood.
  await page.getByRole('tab', { name: 'Systems' }).click()
  await page.getByRole('button', { name: 'Moons' }).click()
  const stopped = await eclipses()
  await page.waitForTimeout(3000)
  expect(await eclipses()).toBe(stopped)
})

test('a world’s own sky, at the size the sun really looks from it', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Systems' }).click()
  await page.getByRole('button', { name: 'Sky' }).click()
  await page.getByRole('button', { name: 'Body list' }).click()

  // The angle is the claim. The Sun is half a degree across from Earth and a
  // hundredth of one from Pluto, and no count of triangles reaching the GPU
  // can tell you whether that came out right — so the engine publishes it,
  // for the same reason it publishes everything else here.
  const sunAcross = async () => {
    const raw = await page.evaluate(() => document.querySelector('canvas')?.dataset.sky ?? '')
    return Number(raw.split('|')[1] ?? 0)
  }
  // The published angle survives the walk back out to the system, so a reading
  // taken too early is the last planet's. Wait for it to become this one's.
  let previous = 0
  const visit = async (name: string) => {
    await page.getByRole('button', { name: new RegExp(`^${name}`) }).click()
    await expect(page.getByRole('heading', { name })).toBeVisible()
    await awaitGeometry(page)
    await expect
      .poll(async () => (await sunAcross()) !== previous && (await sunAcross()) > 0, {
        timeout: 20_000,
      })
      .toBe(true)
    const deg = await sunAcross()
    previous = deg
    // Read before leaving: back out to the system and the sky is not drawn at
    // all, so the signal is gone with it.
    const bodies = await page.evaluate(
      () => Number((document.querySelector('canvas')?.dataset.sky ?? '').split('|')[0]),
    )
    await page.getByRole('button', { name: '‹ The Solar System' }).click()
    await page.getByRole('tab', { name: 'Systems' }).click()
    await page.getByRole('button', { name: 'Body list' }).click()
    return { deg, bodies }
  }

  // Mercury's sun swings between 1.14° and 1.73° across its own eccentric
  // orbit; Earth's holds near half a degree; Pluto's is a spark.
  expect((await visit('Mercury')).deg).toBeGreaterThan(1.1)
  const earth = await visit('Earth')
  expect(earth.deg).toBeCloseTo(0.53, 1)
  expect((await visit('Pluto')).deg).toBeLessThan(0.02)

  // And what is up there: the star, plus every planet but the one underfoot.
  expect(earth.bodies).toBe(9)
})

test('a sculpted world is nowhere in particular, and has no sky to draw', async ({ page }) => {
  // The option only means something for a world with a place. Peachmoss was
  // made in the sculptor and is not in orbit around anything.
  await page.goto('/')
  await page.getByRole('tab', { name: 'Systems' }).click()
  await page.getByRole('button', { name: 'Sky' }).click()
  await awaitGeometry(page)
  await page.waitForTimeout(1200)
  expect(await page.evaluate(() => document.querySelector('canvas')?.dataset.sky)).toBeUndefined()
})
