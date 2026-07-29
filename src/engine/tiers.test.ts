import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from '../lib/params'
import { effectiveTier } from './tiers'
import type { PlanetParams } from './types'

function paramsFor(partial: Partial<PlanetParams>): PlanetParams {
  return { ...DEFAULT_PARAMS, ...partial }
}

describe('effectiveTier', () => {
  it('lets each world pick when nothing is forced', () => {
    // A photograph has no height to displace; the gas pipeline is the
    // animated one; sculpted rock is what the sculptor has always drawn.
    expect(effectiveTier(paramsFor({ preset: 'mars', texture: 'images2k/mars.jpg' }))).toBe('flat')
    expect(effectiveTier(paramsFor({ preset: 'gasAmber' }))).toBe('flat')
    expect(effectiveTier(paramsFor({ preset: 'gasStorm' }))).toBe('flat')
    expect(effectiveTier(paramsFor({ preset: 'temperate' }))).toBe('detailed')
    expect(effectiveTier(paramsFor({ preset: 'pluto' }))).toBe('detailed')
    expect(effectiveTier(paramsFor({ preset: 'pandora' }))).toBe('detailed')
  })

  it('an explicit choice always wins', () => {
    expect(effectiveTier(paramsFor({ preset: 'temperate', tier: 'flat' }))).toBe('flat')
    expect(
      effectiveTier(paramsFor({ preset: 'mars', texture: 'images2k/mars.jpg', tier: 'detailed' })),
    ).toBe('detailed')
    expect(effectiveTier(paramsFor({ preset: 'gasAmber', tier: 'detailed' }))).toBe('detailed')
  })

  it('is a render control: sanitised params never carry it', async () => {
    // The tier must never enter a world's saved identity — the sanitiser is
    // what stands between the app and storage, so it is the thing to pin.
    const { sanitize } = await import('../lib/params')
    const out = sanitize({ ...DEFAULT_PARAMS, tier: 'flat' })
    expect('tier' in out).toBe(false)
  })
})
