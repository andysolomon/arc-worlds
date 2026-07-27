import { desc } from 'drizzle-orm'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getDb } from '../../db/index.js'
import { systems } from '../../db/schema.js'
import { cacheFor, cleanName, fail, makeSlug, makeToken } from '../_lib.js'
import { sanitizeSystem, starDot } from '../../src/lib/systems.js'

const MAX_LIMIT = 48

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      const raw = Number(req.query.limit)
      const limit = Number.isFinite(raw) ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(raw))) : 24

      const rows = await getDb()
        .select({
          slug: systems.slug,
          name: systems.name,
          def: systems.def,
          dot: systems.dot,
          sub: systems.sub,
          createdAt: systems.createdAt,
        })
        .from(systems)
        .orderBy(desc(systems.createdAt))
        .limit(limit)

      cacheFor(res, 10)
      return res.status(200).json({ systems: rows })
    }

    if (req.method === 'POST') {
      const body = (req.body ?? {}) as { def?: unknown }

      // Re-sanitized with the same function the UI uses. Beyond the usual
      // clamping this forces `origin` back to `custom`, so no payload can
      // present its invented orbits as measured ones.
      const def = sanitizeSystem(body.def)
      if (def.bodies.length === 0) return fail(res, 400, 'A system needs at least one world.')

      def.name = cleanName(def.name)
      const sub = `${def.star.name} · ${def.bodies.length} world${def.bodies.length === 1 ? '' : 's'}`

      const slug = makeSlug()
      const editToken = makeToken()

      const [row] = await getDb()
        .insert(systems)
        .values({ slug, name: def.name, def, dot: starDot(def), sub, editToken })
        .returning({
          slug: systems.slug,
          name: systems.name,
          def: systems.def,
          dot: systems.dot,
          sub: systems.sub,
          createdAt: systems.createdAt,
        })

      // editToken is returned only here, to the creator, and never listed.
      return res.status(201).json({ system: row, editToken })
    }

    res.setHeader('allow', 'GET, POST')
    return fail(res, 405, 'Method not allowed')
  } catch (e) {
    console.error('[api/systems]', e)
    return fail(res, 500, 'Something went wrong saving that system.')
  }
}
