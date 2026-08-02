import { describe, expect, it } from 'vitest'
import { isLittleWorldsOriginal } from './presets'

describe('Little Worlds originals', () => {
  it('recognizes canonical planets, reconstructions, fiction, and moons', () => {
    expect(isLittleWorldsOriginal({ preset: 'temperate', seed: 4242 })).toBe(true)
    expect(isLittleWorldsOriginal({ preset: 'archean', seed: 3042 })).toBe(true)
    expect(isLittleWorldsOriginal({ preset: 'pandora', seed: 2009 })).toBe(true)
    expect(isLittleWorldsOriginal({ preset: 'europa', seed: 1611 })).toBe(true)
  })

  it('detaches a cloned or reseeded member of the same family', () => {
    expect(isLittleWorldsOriginal({ preset: 'temperate', seed: 4243 })).toBe(false)
    expect(isLittleWorldsOriginal({ preset: 'pandora', seed: 2010 })).toBe(false)
  })
})
