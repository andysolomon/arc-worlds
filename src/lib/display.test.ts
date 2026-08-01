import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_DISPLAY, loadDisplay, saveDisplay } from './display'

/** A minimal localStorage; `throws` covers private browsing and blocked data. */
function fakeStorage(opts: { throws?: boolean } = {}) {
  const map = new Map<string, string>()
  return {
    getItem(k: string) {
      if (opts.throws) throw new Error('denied')
      return map.get(k) ?? null
    },
    setItem(k: string, v: string) {
      if (opts.throws) throw new Error('denied')
      map.set(k, v)
    },
    map,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('loadDisplay', () => {
  it('starts from the defaults: the exact look the app always drew', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    expect(loadDisplay()).toEqual({
      paths: true, labels: false, moons: true,
      starDensity: 0.5, starBright: 0.5, nebula: 'none', exposure: 0.5,
      pauseOnHover: false,
    })
  })

  it('round-trips what was saved', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    const chosen = {
      paths: false, labels: true, moons: false,
      starDensity: 0.9, starBright: 0.2, nebula: 'violet', exposure: 0.7,
      pauseOnHover: true,
    } as const
    saveDisplay(chosen)
    expect(loadDisplay()).toEqual(chosen)
  })

  it('clamps universe numbers and rejects an unknown nebula', () => {
    const store = fakeStorage()
    store.map.set(
      'little-worlds.display',
      JSON.stringify({ starDensity: 7, starBright: -2, nebula: 'plaid', exposure: 'high' }),
    )
    vi.stubGlobal('localStorage', store)
    const d = loadDisplay()
    expect(d.starDensity).toBe(1)
    expect(d.starBright).toBe(0)
    expect(d.nebula).toBe('none')
    expect(d.exposure).toBe(0.5)
  })

  it('ignores the retired rendering-tier preference', () => {
    const store = fakeStorage()
    store.map.set('little-worlds.display', JSON.stringify({ tier: 'flat' }))
    vi.stubGlobal('localStorage', store)
    expect(loadDisplay()).toEqual(DEFAULT_DISPLAY)
    expect('tier' in loadDisplay()).toBe(false)
  })

  it('falls back to defaults on a corrupt stored value', () => {
    const store = fakeStorage()
    store.map.set('little-worlds.display', '{not json')
    vi.stubGlobal('localStorage', store)
    expect(loadDisplay()).toEqual(DEFAULT_DISPLAY)
  })

  it('fills in fields missing from an older stored shape', () => {
    // A phase-1 blob has no universe fields; it must load with those defaulted.
    const store = fakeStorage()
    store.map.set('little-worlds.display', JSON.stringify({ paths: false }))
    vi.stubGlobal('localStorage', store)
    expect(loadDisplay()).toEqual({
      paths: false, labels: false, moons: true,
      starDensity: 0.5, starBright: 0.5, nebula: 'none', exposure: 0.5,
      pauseOnHover: false,
    })
  })

  it('still answers when localStorage is unavailable', () => {
    vi.stubGlobal('localStorage', fakeStorage({ throws: true }))
    expect(loadDisplay()).toEqual(DEFAULT_DISPLAY)
    // Saving must not throw either — the page state stays authoritative.
    expect(() => saveDisplay({ ...DEFAULT_DISPLAY, paths: false })).not.toThrow()
  })

  it('never returns the shared default object, so callers can mutate freely', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    expect(loadDisplay()).not.toBe(DEFAULT_DISPLAY)
  })
})
