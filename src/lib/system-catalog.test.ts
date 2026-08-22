import { describe, expect, it } from 'vitest'
import {
  buildSystemCatalog, matchesSystemQuery, type SystemCatalogGroup,
} from './system-catalog'
import { BUILT_IN_SYSTEMS, MILKY_WAY } from '../data/systems'
import { emptySystem } from './systems'
import type { SavedSystem } from './api'

const saved = (name: string, slug: string): SavedSystem => ({
  slug,
  name,
  def: { ...emptySystem(1), name },
  dot: '#ffd9a0',
  sub: 'a system of my own',
  createdAt: '2026-08-09T00:00:00.000Z',
})

const group = (groups: SystemCatalogGroup[], key: string) => groups.find((g) => g.key === key)
const names = (groups: SystemCatalogGroup[], key: string) =>
  group(groups, key)?.systems.map((s) => s.name) ?? []

describe('buildSystemCatalog', () => {
  it('puts every built-in system into exactly one category', () => {
    const groups = buildSystemCatalog([])
    const all = groups.flatMap((g) => g.systems)
    expect(new Set(all.map((s) => s.id)).size).toBe(all.length)

    // The panel claims to show every system the app ships with, so a system
    // added to data/systems that nobody remembers to categorise fails here
    // rather than silently going missing from the tab.
    expect(all).toHaveLength(BUILT_IN_SYSTEMS.length)
    for (const def of BUILT_IN_SYSTEMS) expect(all.map((s) => s.name)).toContain(def.name)
  })

  it('keeps the measured system apart from the observed and the invented', () => {
    const groups = buildSystemCatalog([])
    expect(names(groups, 'measured')).toEqual([MILKY_WAY.name])
    expect(names(groups, 'observed')).toContain('TRAPPIST-1')
    expect(names(groups, 'observed')).toContain('Kepler-452')
    expect(names(groups, 'imagined')).toContain('Andromeda')
    expect(names(groups, 'observed')).not.toContain('Andromeda')
  })

  it('calls a system built on a real star imagined when its worlds are a story', () => {
    // 40 Eridani and Tau Ceti wear real star masses under invented worlds.
    // Origin is the authority, not the star's realness.
    const groups = buildSystemCatalog([])
    expect(names(groups, 'imagined')).toContain('40 Eridani')
    expect(names(groups, 'imagined')).toContain('Tau Ceti')
  })

  it('drops empty categories rather than showing a heading over nothing', () => {
    expect(group(buildSystemCatalog([]), 'saved')).toBeUndefined()
    expect(group(buildSystemCatalog([saved('Kestrel Reach', 'kestrel')]), 'saved')).toBeDefined()
  })

  it('lists your saved systems first, under one heading with the unsaved one', () => {
    const working = { ...emptySystem(2), name: 'Halfway House' }
    const groups = buildSystemCatalog([saved('Kestrel Reach', 'kestrel')], working)
    expect(groups[0].key).toBe('saved')
    // The one being edited leads: it is the system actually in hand.
    expect(names(groups, 'saved')).toEqual(['Halfway House', 'Kestrel Reach'])
    expect(group(groups, 'saved')?.systems[0].working).toBe(true)
    expect(group(groups, 'saved')?.systems[0].sub).toContain('not saved yet')
  })

  it('ignores a working system that is only a read-only built-in on screen', () => {
    // Sitting on the Solar System must not clone it into Your systems.
    const groups = buildSystemCatalog([], MILKY_WAY)
    expect(group(groups, 'saved')).toBeUndefined()
    expect(names(groups, 'measured')).toEqual([MILKY_WAY.name])
  })

  it('carries what a card shows: star, world count, and a colour', () => {
    const trappist = buildSystemCatalog([])
      .flatMap((g) => g.systems)
      .find((s) => s.name === 'TRAPPIST-1')!
    expect(trappist.star).toBe('TRAPPIST-1')
    expect(trappist.worlds).toBe(trappist.def.bodies.length)
    expect(trappist.dot).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('matchesSystemQuery', () => {
  const find = (name: string) =>
    buildSystemCatalog([]).flatMap((g) => g.systems).find((s) => s.name === name)!

  it('matches nothing away when the query is empty', () => {
    expect(matchesSystemQuery(find('Andromeda'), '   ')).toBe(true)
  })

  it('matches on name, description, and the star at the centre', () => {
    expect(matchesSystemQuery(find('Alpha Centauri A'), 'pandora')).toBe(true)
    expect(matchesSystemQuery(find('Andromeda'), 'halcyon')).toBe(true)
    expect(matchesSystemQuery(find('Andromeda'), 'TRAPPIST')).toBe(false)
  })

  it('is case-insensitive', () => {
    expect(matchesSystemQuery(find('TRAPPIST-1'), 'trappist')).toBe(true)
  })
})
