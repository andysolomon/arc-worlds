/**
 * The anonymous identity behind a private gallery.
 *
 * There are no accounts here, so "who saved this" is a random key the browser
 * issues to itself on first save and keeps in localStorage. The server stores it
 * alongside each world and filters lists by it, so one visitor never sees
 * another's worlds.
 *
 * What this deliberately does not do: travel between browsers or devices, or
 * survive clearing site data. Losing the key does not destroy anything — every
 * saved world still lives at its own /w/:slug link — it only empties the list.
 */

const STORAGE_KEY = 'little-worlds.owner-key'

/** Sent on every list and save request. */
export const OWNER_HEADER = 'x-owner-key'

/** Matches what {@link mint} produces; the server validates the same shape. */
export const OWNER_KEY_RE = /^[A-Za-z0-9_-]{16,64}$/

function mint(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  // base64url, so the key is safe in a header without any escaping.
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * A key held for this page only, used when localStorage is unavailable — in
 * private browsing, or with site data blocked. Saving still works and the
 * gallery still fills up; it just resets on reload rather than failing outright.
 */
let memoryKey: string | null = null

/** The key for this browser, minting and persisting one on first call. */
export function ownerKey(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && OWNER_KEY_RE.test(stored)) return stored

    const key = mint()
    localStorage.setItem(STORAGE_KEY, key)
    return key
  } catch {
    memoryKey ??= mint()
    return memoryKey
  }
}

/** Header pair for a request that should be scoped to this browser. */
export function ownerHeaders(): Record<string, string> {
  return { [OWNER_HEADER]: ownerKey() }
}
