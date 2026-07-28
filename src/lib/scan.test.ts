import { describe, expect, it } from 'vitest'
import { ANCIENT, SOLAR } from '../data/presets'
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

describe('determinism', () => {
  it('scans the same world the same way every time', async () => {
    const p = paramsFor({ preset: 'temperate', seed: 555 })
    expect(JSON.stringify(await computeScan(p))).toBe(JSON.stringify(await computeScan(p)))
  })
})
