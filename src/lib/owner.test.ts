import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OWNER_HEADER, OWNER_KEY_RE } from './owner'

/**
 * A minimal localStorage. `throws` covers private browsing and blocked site
 * data, where touching localStorage raises rather than returning null.
 */
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

/** Fresh module each time, since the in-memory fallback key is module state. */
async function load() {
  vi.resetModules()
  return import('./owner')
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ownerKey', () => {
  it('mints a key of the shape the server accepts', async () => {
    vi.stubGlobal('localStorage', fakeStorage())
    const { ownerKey } = await load()

    expect(ownerKey()).toMatch(OWNER_KEY_RE)
  })

  it('reuses the stored key, so a reload keeps the same gallery', async () => {
    const store = fakeStorage()
    vi.stubGlobal('localStorage', store)
    const { ownerKey } = await load()

    const first = ownerKey()
    expect(ownerKey()).toBe(first)
    expect([...store.map.values()]).toEqual([first])
  })

  it('replaces a stored value that is not a usable key', async () => {
    const store = fakeStorage()
    store.map.set('little-worlds.owner-key', 'nope!')
    vi.stubGlobal('localStorage', store)
    const { ownerKey } = await load()

    const key = ownerKey()
    expect(key).toMatch(OWNER_KEY_RE)
    expect(key).not.toBe('nope!')
  })

  it('still issues a stable key when localStorage is unavailable', async () => {
    vi.stubGlobal('localStorage', fakeStorage({ throws: true }))
    const { ownerKey } = await load()

    const first = ownerKey()
    expect(first).toMatch(OWNER_KEY_RE)
    // Stable within the page, so saving twice does not split the gallery in two.
    expect(ownerKey()).toBe(first)
  })

  it('gives two browsers different keys', async () => {
    vi.stubGlobal('localStorage', fakeStorage())
    const a = (await load()).ownerKey()

    vi.stubGlobal('localStorage', fakeStorage())
    const b = (await load()).ownerKey()

    expect(a).not.toBe(b)
  })
})

describe('ownerHeaders', () => {
  it('sends the key under the header the API reads', async () => {
    vi.stubGlobal('localStorage', fakeStorage())
    const { ownerHeaders, ownerKey } = await load()

    // Loaded fresh, so read the header first and compare the key to it.
    const headers = ownerHeaders()
    expect(headers).toEqual({ [OWNER_HEADER]: ownerKey() })
  })
})
