import { eq } from 'drizzle-orm'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getDb } from '../../db/index.js'
import { systems } from '../../db/schema.js'
import { cacheFor, fail } from '../_lib.js'

const SLUG_RE = /^[A-Za-z0-9_-]{3,64}$/

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET')
    return fail(res, 405, 'Method not allowed')
  }

  const slug = Array.isArray(req.query.slug) ? req.query.slug[0] : req.query.slug
  if (!slug || !SLUG_RE.test(slug)) return fail(res, 400, 'Bad system id')

  try {
    const [row] = await getDb()
      .select({
        slug: systems.slug,
        name: systems.name,
        def: systems.def,
        dot: systems.dot,
        sub: systems.sub,
        createdAt: systems.createdAt,
      })
      .from(systems)
      .where(eq(systems.slug, slug))
      .limit(1)

    if (!row) return fail(res, 404, 'No such system')

    // A system never changes once saved, so this can cache hard.
    cacheFor(res, 300)
    return res.status(200).json({ system: row })
  } catch (e) {
    console.error('[api/systems/:slug]', e)
    return fail(res, 500, 'Could not load that system.')
  }
}
