import { describe, expect, it } from 'vitest'
import { PLANET_PAGES, VENUS_PAGE } from './registry'

describe('planet page registry', () => {
  it('keeps page keys and canonical paths unique', () => {
    expect(new Set(PLANET_PAGES.map((page) => page.key)).size).toBe(PLANET_PAGES.length)
    expect(new Set(PLANET_PAGES.map((page) => page.path)).size).toBe(PLANET_PAGES.length)
  })

  it('defines the fixed Venus beat order and accessible titles', () => {
    expect(VENUS_PAGE.beatIds).toEqual([
      'veil',
      'crush',
      'heat-trap',
      'missing-water',
      'radar-world',
      'scan',
    ])
    expect(VENUS_PAGE.beatTitles).toEqual([
      'The Veil',
      'The Crush',
      'The Heat Trap',
      'The Missing Water',
      'The Radar World',
      'Scan: Why Venus Is Hell',
    ])
    expect(new Set(VENUS_PAGE.beatIds).size).toBe(VENUS_PAGE.beatIds.length)
  })

  it('keeps provenance, licensing, transformation, caption, and alt text beside every asset', () => {
    expect(VENUS_PAGE.assets).toHaveLength(2)
    for (const asset of VENUS_PAGE.assets) {
      expect(asset.source).toMatch(/^https:\/\//)
      expect(asset.credit).toBeTruthy()
      expect(asset.licence.label).toBeTruthy()
      expect(asset.licence.url).toMatch(/^https:\/\//)
      expect(asset.transformation).toBeTruthy()
      expect(asset.caption).toBeTruthy()
      expect(asset.alt).toBeTruthy()
      expect(asset.sources.avif).toContain('.avif')
      expect(asset.sources.webp).toContain('.webp')
    }
  })
})
