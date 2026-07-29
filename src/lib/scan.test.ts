import { describe, expect, it } from 'vitest'
import { ANCIENT, FICTION, MOONS, SOLAR } from '../data/presets'
import type { PlanetParams } from '../engine/types'
import { DEFAULT_PARAMS } from './params'
import { computeScan } from './scan'

function paramsFor(partial: Partial<PlanetParams>): PlanetParams {
  return { ...DEFAULT_PARAMS, ...partial }
}

/** SOLAR keeps `preset` beside its params; the system assembly injects it. */
function solarParams(key: string): PlanetParams {
  const s = SOLAR.find((x) => x.key === key)!
  return paramsFor({ ...s.params, preset: s.key })
}

describe('measured profiles', () => {
  it('scans a textured real planet as itself', async () => {
    expect((await computeScan(solarParams('saturn'))).atmoTitle).toBe('Hydrogen under a hydrocarbon haze')
  })

  it('scans texture-less Pluto as itself through its canonical seed', async () => {
    const pluto = solarParams('pluto')
    expect(pluto.texture).toBeNull()
    expect((await computeScan(pluto)).atmoTitle).toBe('Thin nitrogen, seasonally alive')
  })

  it('detaches Pluto when the seed changes, deriving an icy reading instead', async () => {
    const pluto = solarParams('pluto')
    const reseeded = await computeScan({ ...pluto, seed: pluto.seed + 1 })
    expect(reseeded.atmoTitle).not.toBe('Thin nitrogen, seasonally alive')
  })
})

describe('ancient reconstructions', () => {
  it('reads every ancient world as a reconstruction, and says so', async () => {
    for (const a of ANCIENT) {
      const scan = await computeScan(paramsFor({ ...a.params, preset: a.key }))
      expect(scan.atmoTitle, a.name).toMatch(/^Reconstructed/)
    }
  })

  it('gives Archean Earth no free oxygen and a haze', async () => {
    const a = ANCIENT.find((x) => x.key === 'archean')!
    const scan = await computeScan(paramsFor({ ...a.params, preset: a.key }))
    expect(scan.gases.map((g) => g.n)).not.toContain('Oxygen')
    expect(scan.gases.map((g) => g.n)).toContain('Methane')
  })

  it('detaches on reseed into an ordinary world of its family', async () => {
    for (const a of ANCIENT) {
      const scan = await computeScan(paramsFor({ ...a.params, preset: a.key, seed: a.params.seed! + 1 }))
      expect(scan.atmoTitle, a.name).not.toMatch(/^Reconstructed/)
    }
  })
})

describe('story worlds', () => {
  it('reads every story world as fiction, and says so', async () => {
    for (const f of FICTION) {
      const scan = await computeScan(paramsFor({ ...f.params, preset: f.key }))
      expect(scan.atmoTitle, f.name).toMatch(/^Fiction:/)
    }
  })

  it('gives Erid the novel’s 29 bars and no visible surface', async () => {
    const f = FICTION.find((x) => x.key === 'erid')!
    const scan = await computeScan(paramsFor({ ...f.params, preset: f.key }))
    expect(scan.pressure).toMatch(/29 bar/)
    expect(scan.surfLabel).toMatch(/unobservable/)
  })

  it('fills Pandora’s air with xenon a human could not survive', async () => {
    const f = FICTION.find((x) => x.key === 'pandora')!
    const scan = await computeScan(paramsFor({ ...f.params, preset: f.key }))
    expect(scan.gases.map((g) => g.n)).toContain('Xenon')
  })

  it('detaches on reseed into an ordinary world of its family', async () => {
    for (const f of FICTION) {
      const scan = await computeScan(paramsFor({ ...f.params, preset: f.key, seed: f.params.seed! + 1 }))
      expect(scan.atmoTitle, f.name).not.toMatch(/^Fiction:/)
    }
  })
})

describe('moons that are worlds', () => {
  it('scans every promoted moon as itself, from measured prose', async () => {
    for (const m of MOONS) {
      const itself = await computeScan(paramsFor({ ...m.params, preset: m.key }))
      // Measured prose, not a reading derived from the sliders — which is
      // exactly what the same world reseeded off its canonical identity gets.
      const derived = await computeScan(
        paramsFor({ ...m.params, preset: m.key, seed: m.params.seed! + 1 }),
      )
      expect(itself.atmoTitle, m.name).not.toBe(derived.atmoTitle)
      expect(itself.compounds.length, m.name).toBeGreaterThan(0)
    }
  })

  it('gives Titan an atmosphere thicker than Earth’s, as measured', async () => {
    const t = MOONS.find((m) => m.key === 'titan')!
    const scan = await computeScan(paramsFor({ ...t.params, preset: t.key }))
    expect(scan.pressure).toBe('1.47 bar')
    expect(scan.gases[0].n).toBe('Nitrogen')
  })

  it('finds Europa’s ocean and Io’s complete lack of one', async () => {
    const eu = MOONS.find((m) => m.key === 'europa')!
    const io = MOONS.find((m) => m.key === 'io')!
    expect((await computeScan(paramsFor({ ...eu.params, preset: eu.key }))).water.state)
      .toMatch(/ocean/)
    expect((await computeScan(paramsFor({ ...io.params, preset: io.key }))).water.state)
      .toMatch(/none/)
  })

  it('detaches on reseed into an ordinary world of its family', async () => {
    for (const m of MOONS) {
      const scan = await computeScan(
        paramsFor({ ...m.params, preset: m.key, seed: m.params.seed! + 1 }),
      )
      expect(scan.note, m.name).toBeTruthy()
      // The measured note is unique to the body; a derived one comes from the
      // shared oddity list, so the two can never coincide.
      const asItself = await computeScan(paramsFor({ ...m.params, preset: m.key }))
      expect(scan.note, m.name).not.toBe(asItself.note)
    }
  })
})

describe('determinism', () => {
  it('scans the same world the same way every time', async () => {
    const p = paramsFor({ preset: 'temperate', seed: 555 })
    expect(JSON.stringify(await computeScan(p))).toBe(JSON.stringify(await computeScan(p)))
  })
})
