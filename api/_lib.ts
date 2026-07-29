import { randomBytes } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'

/** URL-safe slug alphabet: no vowels, so no accidental words. */
const ALPHABET = '23456789bcdfghjkmnpqrstvwxyz'

export function makeSlug(len = 8): string {
  const bytes = randomBytes(len)
  let out = ''
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length]
  return out
}

export function makeToken(): string {
  return randomBytes(24).toString('base64url')
}

export function fail(res: VercelResponse, status: number, error: string) {
  return res.status(status).json({ error })
}

// Control characters, including DEL. Matching these is the whole point — a
// world name is user-supplied and ends up rendered in the gallery.
// oxlint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g

/** Trim to a sane display length and strip control characters. */
export function cleanName(v: unknown): string {
  const s = typeof v === 'string' ? v : ''
  const stripped = s.replace(CONTROL_CHARS, '').trim()
  return (stripped || 'Untitled world').slice(0, 60)
}

/** The header carrying a browser's self-issued identity; see src/lib/owner.ts. */
export const OWNER_HEADER = 'x-owner-key'

const OWNER_KEY_RE = /^[A-Za-z0-9_-]{16,64}$/

/**
 * Never store this response anywhere shared.
 *
 * List responses are scoped to one browser's owner key, so a CDN or proxy that
 * cached one would hand a visitor someone else's gallery. The lists deliberately
 * forgo the shared caching that per-slug reads still use, and must keep doing so.
 */
export function cachePrivate(res: VercelResponse) {
  res.setHeader('cache-control', 'private, no-store')
  res.setHeader('vary', OWNER_HEADER)
}

/**
 * The owner key on a request, or null when absent or malformed.
 *
 * Purely an opaque scoping key, not proof of anything: it says which gallery to
 * read from or write to, and is never echoed back in a response.
 */
export function readOwnerKey(req: Pick<VercelRequest, 'headers'>): string | null {
  const raw = req.headers[OWNER_HEADER]
  const value = Array.isArray(raw) ? raw[0] : raw
  return typeof value === 'string' && OWNER_KEY_RE.test(value) ? value : null
}

/** Saved share slugs are immutable, so browsers and the CDN may retain them. */
export function cacheImmutable(res: VercelResponse) {
  const year = 31_536_000
  res.setHeader('cache-control', `public, max-age=${year}, s-maxage=${year}, immutable`)
}
