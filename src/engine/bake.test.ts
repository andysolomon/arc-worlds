import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from '../lib/params'
import { bakeCloudPixels, bakeWorldPixels } from './bake'
import { v2CloudCoverage, v2CloudMask } from './v2/clouds'

describe('off-thread texture inputs', () => {
  it('bakes a deterministic opaque world map', () => {
    const a = bakeWorldPixels(DEFAULT_PARAMS, 12, 6)
    const b = bakeWorldPixels(DEFAULT_PARAMS, 12, 6)

    expect(a).toEqual(b)
    expect(a).toHaveLength(12 * 6 * 4)
    for (let i = 3; i < a.length; i += 4) expect(a[i]).toBe(255)
  })

  it('bakes a transparent cloud field that responds to coverage', () => {
    const clear = bakeCloudPixels(DEFAULT_PARAMS.seed, 0, 16, 8)
    const covered = bakeCloudPixels(DEFAULT_PARAMS.seed, 1, 16, 8)
    const alpha = (bytes: Uint8Array) =>
      bytes.filter((_, index) => index % 4 === 3).reduce((sum, value) => sum + value, 0)

    expect(alpha(covered)).toBeGreaterThan(alpha(clear))
    expect(covered).toHaveLength(16 * 8 * 4)
  })

  it('keeps the sharper v2 Meadow cloud field deterministic and opt-in', () => {
    const classic = bakeCloudPixels(DEFAULT_PARAMS.seed, 0.5, 32, 16)
    const meadow = bakeCloudPixels(DEFAULT_PARAMS.seed, 0.5, 32, 16, 'v2')
    const meadowAgain = bakeCloudPixels(DEFAULT_PARAMS.seed, 0.5, 32, 16, 'v2')

    expect(meadow).toEqual(meadowAgain)
    expect(meadow).not.toEqual(classic)
  })

  it('uses the exact v2 orbit weather field for the detailed cloud shell', () => {
    const width = 16
    const height = 8
    const cover = 0.65
    const liquidWater = 0.72
    const pixels = bakeCloudPixels(DEFAULT_PARAMS.seed, cover, width, height, 'v2', liquidWater)
    const column = 5
    const row = 3
    const phi = ((row + 0.5) / height) * Math.PI
    const theta = ((column + 0.5) / width) * Math.PI * 2
    const expected = v2CloudMask(
      DEFAULT_PARAMS.seed,
      v2CloudCoverage(cover, liquidWater),
      Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta),
    )
    expect(pixels[(row * width + column) * 4 + 3]).toBe(Math.round(expected * 255))
  })
})
