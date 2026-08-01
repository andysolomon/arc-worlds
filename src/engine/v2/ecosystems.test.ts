import { describe, expect, it } from 'vitest'
import { ecosystemStyleFor } from './ecosystems'

describe('living-world ecosystem identity', () => {
  it('is deterministic while exposing many Meadow ecotypes', () => {
    const first = ecosystemStyleFor(42_424, 'temperate')
    expect(ecosystemStyleFor(42_424, 'temperate')).toEqual(first)

    const styles = new Set(
      Array.from({ length: 128 }, (_, seed) => ecosystemStyleFor(seed, 'temperate')?.key),
    )
    expect(styles.size).toBeGreaterThanOrEqual(8)
  })

  it('keeps Pandora in a separate alien biosphere family', () => {
    const meadow = ecosystemStyleFor(2_009, 'temperate')
    const pandora = ecosystemStyleFor(2_009, 'pandora')
    expect(pandora).not.toBeNull()
    expect(pandora?.key).not.toBe(meadow?.key)
    expect(pandora?.grass).not.toBe(meadow?.grass)
    expect(pandora?.waterShell).not.toBe(meadow?.waterShell)
  })

  it('does not recolor non-living profile families', () => {
    expect(ecosystemStyleFor(12, 'mars')).toBeNull()
    expect(ecosystemStyleFor(12, 'gasAmber')).toBeNull()
  })
})
