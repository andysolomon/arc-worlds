import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from '../lib/params'
import { AMP, makeSurface, noiseFor } from './surface'
import { isGas, PALETTES } from './palettes'
import { SURFACE_GOLDENS } from './surface.goldens'
import type { PlanetParams, PresetKey } from './types'

/**
 * The goldens were captured from the renderer before the surface maths moved
 * out of the viewport, so these assertions are about a refactor not changing
 * anyone's saved world — a world is stored as params, and params only mean
 * anything if they keep rendering the same way.
 */
describe('makeSurface', () => {
  const byCase = new Map<string, PlanetParams>()
  for (const g of SURFACE_GOLDENS) {
    const key = `${g.preset}:${g.seed}`
    if (!byCase.has(key)) byCase.set(key, buildParams(g.preset as PresetKey, g.seed))
  }

  /**
   * The amplitude the goldens were captured at. Relief was reduced on
   * 2026-07-29 because every world was arriving with a visibly lumpy horizon
   * — Earth's tallest mountain is 0.14% of its radius, and 0.12 is some
   * eighty-five times the hundredfold exaggeration that was already generous.
   *
   * The goldens are deliberately not re-captured: their own header forbids
   * it, and rightly, since regenerating them from the current code would
   * assert nothing. Instead the relationship to them is asserted exactly.
   * That is a stronger claim than the original equality, because it says
   * precisely what changed and proves nothing else did.
   */
  const GOLDEN_AMP = 0.12

  it('reproduces every captured colour exactly', () => {
    // Colour is read from the elevation field, and the amplitude is applied
    // only to the radius that field returns. So a change in relief height
    // cannot move a coastline, and every world already saved keeps the
    // geography it was saved with. This is the assertion that guarantees it.
    const col = new THREE.Color()
    for (const g of SURFACE_GOLDENS) {
      const P = byCase.get(`${g.preset}:${g.seed}`)!
      const { n1, n2 } = noiseFor(P.seed)
      makeSurface(P, n1, n2).sample(g.dir[0], g.dir[1], g.dir[2], col)

      const where = `${g.preset}/${g.seed} at [${g.dir}]`
      expect(col.r, `red for ${where}`).toBeCloseTo(g.c[0], 10)
      expect(col.g, `green for ${where}`).toBeCloseTo(g.c[1], 10)
      expect(col.b, `blue for ${where}`).toBeCloseTo(g.c[2], 10)
    }
  })

  it('reproduces every captured elevation, scaled only by the amplitude', () => {
    // Rocky displacement is 1 + e·AMP, so recovering e from a golden and from
    // the current sampler compares the elevation fields themselves. Equal
    // fields mean the only thing that moved is how tall the relief is drawn.
    // Gas giants never used AMP — their banding carries its own small, far
    // gentler displacement — so for them the radius is unchanged outright.
    const col = new THREE.Color()
    for (const g of SURFACE_GOLDENS) {
      const P = byCase.get(`${g.preset}:${g.seed}`)!
      const { n1, n2 } = noiseFor(P.seed)
      const r = makeSurface(P, n1, n2).sample(g.dir[0], g.dir[1], g.dir[2], col)

      const where = `${g.preset}/${g.seed} at [${g.dir}]`
      if (isGas(PALETTES[P.preset])) {
        expect(r, `gas radius for ${where}`).toBeCloseTo(g.r, 10)
      } else {
        expect((r - 1) / AMP, `elevation for ${where}`).toBeCloseTo((g.r - 1) / GOLDEN_AMP, 10)
      }
    }
  })

  it('covers both rocky and gas paths', () => {
    const presets = new Set(SURFACE_GOLDENS.map((g) => g.preset))
    expect(presets.size).toBeGreaterThanOrEqual(8)
    expect([...presets].some((p) => p.startsWith('gas'))).toBe(true)
  })

  it('raises sea level as the water slider rises', () => {
    const { n1, n2 } = noiseFor(DEFAULT_PARAMS.seed)
    const at = (water: number) => makeSurface({ ...DEFAULT_PARAMS, water }, n1, n2).seaRadius
    expect(at(0)).toBeLessThan(at(0.5))
    expect(at(0.5)).toBeLessThan(at(1))
    // The datum is the halfway mark, so a dry world's sea sits inside it.
    expect(at(0)).toBeLessThan(1)
    expect(at(1)).toBeGreaterThan(1)
  })
})

/** The param combinations the goldens were captured with. */
function buildParams(preset: PresetKey, seed: number): PlanetParams {
  const cases: Record<string, Partial<PlanetParams>> = {
    'temperate:31174': { mountains: 0.5, water: 0.55, roughness: 0.5, ice: 0.25 },
    'temperate:4242': { mountains: 0.9, water: 0.2, roughness: 0.15, ice: 0 },
    'desert:7': { mountains: 0.45, water: 0.12, roughness: 0.6, ice: 0 },
    'ice:999': { mountains: 0.35, water: 0.5, roughness: 0.4, ice: 0.85 },
    'lava:55': { mountains: 0.7, water: 0.3, roughness: 0.7, ice: 0 },
    'candy:777': { mountains: 0.4, water: 0.5, roughness: 0.35, ice: 0.3 },
    'mars:12': { mountains: 0.6, water: 0, roughness: 0.6, ice: 0.1 },
    'gasAmber:3': { mountains: 0, water: 0, roughness: 0.5, ice: 0 },
    'gasMist:88': { mountains: 0, water: 0, roughness: 0.35, ice: 0 },
    'gasStorm:64': { mountains: 0, water: 0, roughness: 0.75, ice: 0 },
    'jupiter:55': { mountains: 0, water: 0, roughness: 0.5, ice: 0 },
  }
  const over = cases[`${preset}:${seed}`]
  if (!over) throw new Error(`no param set recorded for ${preset}:${seed}`)
  return { ...DEFAULT_PARAMS, preset, seed, ...over }
}
