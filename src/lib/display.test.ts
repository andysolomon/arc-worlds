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
  it('starts from the defaults: paths and moons on, labels off, tier auto', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    expect(loadDisplay()).toEqual({ paths: true, labels: false, moons: true, tier: 'auto' })
  })

  it('round-trips what was saved', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    saveDisplay({ paths: false, labels: true, moons: false, tier: 'flat' })
    expect(loadDisplay()).toEqual({ paths: false, labels: true, moons: false, tier: 'flat' })
  })

  it('rejects a tier value it does not recognise', () => {
    const store = fakeStorage()
    store.map.set('little-worlds.display', JSON.stringify({ tier: 'ultra' }))
    vi.stubGlobal('localStorage', store)
    expect(loadDisplay().tier).toBe('auto')
  })

  it('falls back to defaults on a corrupt stored value', () => {
    const store = fakeStorage()
    store.map.set('little-worlds.display', '{not json')
    vi.stubGlobal('localStorage', store)
    expect(loadDisplay()).toEqual(DEFAULT_DISPLAY)
  })

  it('fills in fields missing from an older stored shape', () => {
    // A phase-1 blob has no tier; it must load with tier defaulted, not fail.
    const store = fakeStorage()
    store.map.set('little-worlds.display', JSON.stringify({ paths: false }))
    vi.stubGlobal('localStorage', store)
    expect(loadDisplay()).toEqual({ paths: false, labels: false, moons: true, tier: 'auto' })
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
