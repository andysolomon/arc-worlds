import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from '../lib/params'
import { bakeCloudPixels, bakeWorldPixels } from './bake'
import { createV2CloudField, sampleV2CloudMask, v2CloudCoverage } from './v2/clouds'

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

  it('gives Pandora broken, translucent weather systems instead of solid white continents', () => {
    const width = 128
    const height = 64
    const pixels = bakeCloudPixels(2009, 0.5, width, height, 'v2', 1)
    const alpha = Array.from({ length: width * height }, (_, pixel) => pixels[pixel * 4 + 3])
    const fraction = (predicate: (value: number) => boolean) =>
      alpha.filter(predicate).length / alpha.length
    let neighbourDifference = 0
    let comparisons = 0
    for (let row = 0; row < height; row++) {
      for (let column = 0; column < width; column++) {
        const value = alpha[row * width + column]
        neighbourDifference += Math.abs(value - alpha[row * width + (column + 1) % width])
        comparisons++
        if (row + 1 < height) {
          neighbourDifference += Math.abs(value - alpha[(row + 1) * width + column])
          comparisons++
        }
      }
    }

    expect(fraction((value) => value > 16)).toBeGreaterThan(0.3)
    expect(fraction((value) => value > 16)).toBeLessThan(0.7)
    expect(fraction((value) => value > 16 && value < 220)).toBeGreaterThan(0.35)
    expect(fraction((value) => value > 250)).toBeLessThan(0.05)
    expect(neighbourDifference / comparisons).toBeGreaterThan(20)
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
    const field = createV2CloudField(DEFAULT_PARAMS.seed)
    const expected = sampleV2CloudMask(
      field,
      v2CloudCoverage(cover, liquidWater),
      Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta),
    )
    expect(pixels[(row * width + column) * 4 + 3]).toBe(Math.round(expected * 255))
  })
})
