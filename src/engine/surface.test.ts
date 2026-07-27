import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from '../lib/params'
import { makeSurface, noiseFor } from './surface'
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

  it('reproduces every captured sample', () => {
    const col = new THREE.Color()
    for (const g of SURFACE_GOLDENS) {
      const P = byCase.get(`${g.preset}:${g.seed}`)!
      const { n1, n2 } = noiseFor(P.seed)
      const surface = makeSurface(P, n1, n2)
      const r = surface.sample(g.dir[0], g.dir[1], g.dir[2], col)

      const where = `${g.preset}/${g.seed} at [${g.dir}]`
      expect(r, `radius for ${where}`).toBeCloseTo(g.r, 10)
      expect(col.r, `red for ${where}`).toBeCloseTo(g.c[0], 10)
      expect(col.g, `green for ${where}`).toBeCloseTo(g.c[1], 10)
      expect(col.b, `blue for ${where}`).toBeCloseTo(g.c[2], 10)
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
