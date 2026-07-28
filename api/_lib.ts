import { randomBytes } from 'node:crypto'
import type { VercelResponse } from '@vercel/node'

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

/** Gallery responses are public and immutable per slug, so allow a short cache. */
export function cacheFor(res: VercelResponse, seconds: number) {
  res.setHeader('cache-control', `public, s-maxage=${seconds}, stale-while-revalidate=60`)
}

/** Saved share slugs are immutable, so browsers and the CDN may retain them. */
export function cacheImmutable(res: VercelResponse) {
  const year = 31_536_000
  res.setHeader('cache-control', `public, max-age=${year}, s-maxage=${year}, immutable`)
}
