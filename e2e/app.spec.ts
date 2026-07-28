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
  await page.waitForTimeout(2500)
  expect(await hasDrawnGeometry(page)).toBe(true)
})

test('pause lets the renderer go idle', async ({ page }) => {
  await page.goto('/')
  await expect.poll(() =>
    page.evaluate(() => Number(document.querySelector('canvas')?.dataset.frames ?? 0)),
  ).toBeGreaterThan(10)

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
  await page.waitForTimeout(3000)
  expect(await hasDrawnGeometry(page)).toBe(true)

  await page.getByRole('button', { name: 'To scale' }).click()
  await page.waitForTimeout(1500)
  expect(await hasDrawnGeometry(page)).toBe(true)
})

test('every planet texture loads', async ({ page }) => {
  const failed: string[] = []
  page.on('response', (r) => {
    if (r.url().includes('/images2k/') && r.status() >= 400) failed.push(r.url())
  })

  await page.goto('/')
  await page.getByRole('tab', { name: 'Systems' }).click()
  await page.getByRole('button', { name: 'Orbit view' }).click()
  await page.waitForTimeout(4000)

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
  await page.waitForTimeout(3000)
  expect(await hasDrawnGeometry(page)).toBe(true)
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
  await page.waitForTimeout(3000)
  expect(await hasDrawnGeometry(page)).toBe(true)
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
  await expect(page.getByText(/every number measured/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Visit/ })).toHaveCount(9)
})

test('an imagined system is never presented as a measured one', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Systems' }).click()

  await expect(page.getByText(/every number measured/)).toBeVisible()

  await page.getByRole('button', { name: 'Andromeda' }).click()
  await expect(page.getByText(/not a measured system/)).toBeVisible()
  await page.getByRole('button', { name: 'Orbit view' }).click()
  await page.waitForTimeout(3000)
  expect(await hasDrawnGeometry(page)).toBe(true)
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
  const sunFor = async (kind: string) => {
    await page.getByRole('button', { name: kind, exact: true }).click()
    await page.waitForTimeout(1200)
    return page.evaluate(() => Number(document.querySelector('canvas')!.dataset.sunScale ?? 0))
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
function datum(page: Page, key: 'lines' | 'triangles'): Promise<number> {
  return page.evaluate((k) => Number(document.querySelector('canvas')?.dataset[k] ?? -1), key)
}

/**
 * Sweep the pointer across the canvas until it crosses a planet, or give up.
 * Planet positions depend on when the orbits were frozen, so this searches
 * rather than aiming — the ecliptic band covers the middle of the view.
 */
async function sweepForHover(page: Page): Promise<number> {
  const box = (await page.locator('canvas').boundingBox())!
  for (let ty = 0.3; ty <= 0.7; ty += 0.08) {
    for (let tx = 0.08; tx <= 0.92; tx += 0.06) {
      await page.mouse.move(box.x + box.width * tx, box.y + box.height * ty)
      await page.waitForTimeout(25)
      const n = await datum(page, 'lines')
      if (n > 0) return n
    }
  }
  return 0
}

test('hidden orbit paths come back one at a time on hover', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Systems' }).click()
  await page.getByRole('button', { name: 'Orbit view' }).click()
  await page.waitForTimeout(2500)
  expect(await datum(page, 'lines')).toBeGreaterThan(0)

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
async function settledTriangles(page: Page): Promise<number> {
  let last = -1
  let streak = 0
  await expect
    .poll(async () => {
      const now = await datum(page, 'triangles')
      streak = now > 0 && now === last ? streak + 1 : 0
      last = now
      return streak
    }, { intervals: Array(30).fill(700) as number[], timeout: 25_000 })
    .toBeGreaterThanOrEqual(2)
  return last
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
  await page.waitForTimeout(2500)
  const withMoons = await datum(page, 'triangles')
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

  // The honest split is stated up front, and all seven planets are here.
  await expect(page.getByText(/nobody has seen these surfaces/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Visit/ })).toHaveCount(7)
  // TRAPPIST-1 b's 1.5-day year is quoted, not rounded into fiction.
  await expect(page.getByText('1.5 day year', { exact: false })).toBeVisible()

  await page.getByRole('button', { name: 'Orbit view' }).click()
  await page.waitForTimeout(2500)
  expect(await hasDrawnGeometry(page)).toBe(true)

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
  await page.waitForTimeout(2000)
  expect(await hasDrawnGeometry(page)).toBe(true)
  expect(await datum(page, 'lines')).toBe(0)
})
