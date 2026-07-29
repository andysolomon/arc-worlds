import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from '../lib/params'
import { bakeCloudPixels, bakeWorldPixels } from './bake'

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
})
