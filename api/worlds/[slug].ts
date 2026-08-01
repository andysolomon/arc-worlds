import { eq } from 'drizzle-orm'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getDb } from '../../db/index.js'
import { worlds } from '../../db/schema.js'
import { cacheImmutable, fail } from '../_lib.js'
import { sanitize } from '../../src/lib/params.js'

const SLUG_RE = /^[A-Za-z0-9_-]{3,64}$/

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET')
    return fail(res, 405, 'Method not allowed')
  }

  const slug = Array.isArray(req.query.slug) ? req.query.slug[0] : req.query.slug
  if (!slug || !SLUG_RE.test(slug)) return fail(res, 400, 'Bad world id')

  try {
    const [row] = await getDb()
      .select({
        slug: worlds.slug,
        name: worlds.name,
        params: worlds.params,
        dot: worlds.dot,
        sub: worlds.sub,
        createdAt: worlds.createdAt,
      })
      .from(worlds)
      .where(eq(worlds.slug, slug))
      .limit(1)

    if (!row) return fail(res, 404, 'No such world')

    // A world never changes once saved, so this can cache hard.
    cacheImmutable(res)
    return res.status(200).json({ world: { ...row, params: sanitize(row.params) } })
  } catch (e) {
    console.error('[api/worlds/:slug]', e)
    return fail(res, 500, 'Could not load that world.')
  }
}
