import { describe, expect, it } from 'vitest'
import { buildCatalog, matchesQuery, type CatalogGroup } from './catalog'
import { ANCIENT, FICTION, MOONS, PRESETS, SOLAR, isLittleWorldsOriginal } from '../data/presets'
import { BUILT_IN_SYSTEMS } from '../data/systems'
import { CURRENT_PARAMS } from './params'
import type { SavedWorld } from './api'

const saved = (name: string, slug: string): SavedWorld => ({
  slug,
  name,
  params: { ...CURRENT_PARAMS, seed: 777 },
  dot: '#72b350',
  sub: 'a world of my own',
  createdAt: '2026-08-09T00:00:00.000Z',
})

const group = (groups: CatalogGroup[], key: string) => groups.find((g) => g.key === key)
const names = (groups: CatalogGroup[], key: string) => group(groups, key)?.worlds.map((w) => w.name) ?? []

describe('buildCatalog', () => {
  it('puts every world the app ships with into exactly one category', () => {
    const groups = buildCatalog([])
    const all = groups.flatMap((g) => g.worlds)
    expect(new Set(all.map((w) => w.id)).size).toBe(all.length)

    // Every body of every built-in system is somewhere in the catalog. This is
    // the claim the panel makes — "every world in Little Worlds" — so a new
    // system that nobody remembers to list fails here rather than silently.
    const bodies = BUILT_IN_SYSTEMS.flatMap((s) => s.bodies.map((b) => b.name))
    for (const name of bodies) expect(all.map((w) => w.name)).toContain(name)
  })

  it('separates measured planets from their moons', () => {
    const groups = buildCatalog([])
    expect(names(groups, 'planet')).toEqual(SOLAR.map((s) => s.name))
    expect(names(groups, 'moon')).toHaveLength(MOONS.length)
    expect(names(groups, 'moon')).toContain('Europa')
    expect(names(groups, 'planet')).not.toContain('Europa')
  })

  it('calls a homage world fiction even though it lives in an imagined system', () => {
    const groups = buildCatalog([])
    const fiction = names(groups, 'fiction')
    for (const f of FICTION) expect(fiction).toContain(f.name)
    // Polyphemus shares Pandora's system but is nobody's story world.
    expect(fiction).not.toContain('Polyphemus')
    expect(names(groups, 'imagined')).toContain('Polyphemus')
  })

  it('keeps observed exoplanets apart from invented ones', () => {
    const groups = buildCatalog([])
    expect(names(groups, 'observed')).toContain('TRAPPIST-1 e')
    expect(names(groups, 'observed')).toContain('Proxima Centauri b')
    expect(names(groups, 'imagined')).toContain('Cinderpip')
    expect(names(groups, 'observed')).not.toContain('Cinderpip')
  })

  it('lists the reconstructions, which belong to no system at all', () => {
    const groups = buildCatalog([])
    expect(names(groups, 'ancient')).toEqual(ANCIENT.map((a) => a.name))
  })

  it('offers every world type as a starting point', () => {
    const groups = buildCatalog([])
    expect(names(groups, 'type')).toEqual(PRESETS.map((p) => p.label))
    for (const w of group(groups, 'type')!.worlds) {
      expect(w.preset).not.toBeNull()
      expect(w.params).toBeNull()
    }
  })

  it('shows your own worlds first, and only when you have some', () => {
    expect(group(buildCatalog([]), 'saved')).toBeUndefined()
    const groups = buildCatalog([saved('Testball', 'testball')])
    expect(groups[0].key).toBe('saved')
    expect(groups[0].worlds[0].saved?.slug).toBe('testball')
  })

  /**
   * The lock the builder applies is derived from the params, so the catalog
   * must hand over params the identity rule still recognizes — otherwise
   * opening Earth from Worlds home would present a reference world as
   * editable, while opening it from Systems would not.
   */
  it('hands over params that still identify a reference world', () => {
    const groups = buildCatalog([])
    for (const key of ['planet', 'moon', 'ancient', 'fiction'] as const) {
      for (const w of group(groups, key)!.worlds) {
        expect(isLittleWorldsOriginal(w.params!) || !!w.params!.texture).toBe(true)
      }
    }
    // An invented world is nobody's reference and opens ready to edit.
    for (const w of group(groups, 'imagined')!.worlds) {
      expect(isLittleWorldsOriginal(w.params!) || !!w.params!.texture).toBe(false)
    }
  })

  it('describes a world with its own words where it has them', () => {
    const groups = buildCatalog([])
    const earth = group(groups, 'planet')!.worlds.find((w) => w.name === 'Earth')!
    expect(earth.sub).toBe(SOLAR.find((s) => s.key === 'temperate')!.sub)

    // An invented world has no subtitle on file, so it says where it is and
    // what kind of world it is rather than nothing at all.
    const cinderpip = group(groups, 'imagined')!.worlds.find((w) => w.name === 'Cinderpip')!
    expect(cinderpip.sub).toBe('Andromeda · ember world')

    const pandora = group(groups, 'fiction')!.worlds.find((w) => w.name === 'Pandora')!
    expect(pandora.system).toBe('Alpha Centauri A')
  })
})

describe('matchesQuery', () => {
  const [world] = buildCatalog([]).flatMap((g) => g.worlds.filter((w) => w.name === 'Titan'))

  it('matches an empty query', () => {
    expect(matchesQuery(world, '')).toBe(true)
    expect(matchesQuery(world, '   ')).toBe(true)
  })

  it('reads the name, the subtitle and the system, case-insensitively', () => {
    expect(matchesQuery(world, 'TIT')).toBe(true)
    expect(matchesQuery(world, 'rivers and seas')).toBe(true)
    expect(matchesQuery(world, 'solar system')).toBe(true)
    expect(matchesQuery(world, 'pandora')).toBe(false)
  })
})
