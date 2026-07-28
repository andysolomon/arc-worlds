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

  // Each world orbits further out than the last, so a year gets longer too.
  await page.getByRole('button', { name: 'Body list' }).click()
  const cards = page.locator('.card .sub')
  const au = await cards.evaluateAll((els) =>
    els.map((e) => Number(/([\d.]+) AU/.exec(e.textContent ?? '')?.[1] ?? NaN)),
  )
  expect(au.length).toBeGreaterThanOrEqual(3)
  for (let i = 1; i < au.length; i++) expect(au[i]).toBeGreaterThan(au[i - 1])
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
  expect(widths.length).toBe(5)
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
