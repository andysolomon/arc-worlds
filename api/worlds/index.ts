import { desc, eq } from 'drizzle-orm'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getDb } from '../../db/index.js'
import { worlds } from '../../db/schema.js'
import { cachePrivate, cleanName, fail, makeSlug, makeToken, readOwnerKey } from '../_lib.js'
import { sanitize } from '../../src/lib/params.js'
import { ANCIENT, PRESETS, SOLAR } from '../../src/data/presets.js'

const MAX_LIMIT = 48

/** The accent colour and caption shown on a gallery card. */
function describe(preset: string, seed: number) {
  const p =
    PRESETS.find((x) => x.key === preset) ??
    SOLAR.find((x) => x.key === preset) ??
    ANCIENT.find((x) => x.key === preset)
  return { dot: p?.dot ?? '#7fae62', sub: `${p?.label ?? 'Meadow'} · seed ${seed}` }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      const raw = Number(req.query.limit)
      const limit = Number.isFinite(raw) ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(raw))) : 24

      // A gallery is one browser's own worlds and nobody else's, so no key
      // means no gallery — an empty list rather than an error, because that is
      // the honest answer for a browser that has never saved anything.
      const ownerKey = readOwnerKey(req)
      cachePrivate(res)
      if (!ownerKey) return res.status(200).json({ worlds: [] })

      const rows = await getDb()
        .select({
          slug: worlds.slug,
          name: worlds.name,
          params: worlds.params,
          dot: worlds.dot,
          sub: worlds.sub,
          createdAt: worlds.createdAt,
        })
        .from(worlds)
        .where(eq(worlds.ownerKey, ownerKey))
        .orderBy(desc(worlds.createdAt))
        .limit(limit)

      return res.status(200).json({ worlds: rows })
    }

    if (req.method === 'POST') {
      const body = (req.body ?? {}) as { name?: unknown; params?: unknown }

      // Refused rather than saved ownerless: a world nobody owns would never
      // appear in the gallery it was saved from, which reads as data loss.
      const ownerKey = readOwnerKey(req)
      if (!ownerKey) return fail(res, 400, 'Missing or malformed owner key.')

      // Never trust the client: params are re-sanitized with the same function
      // the UI uses, so a hand-crafted payload cannot inject an asset path or
      // out-of-range value into anyone else's renderer.
      const params = sanitize(body.params)
      const name = cleanName(body.name)
      const { dot, sub } = describe(params.preset, params.seed)

      const slug = makeSlug()
      const editToken = makeToken()

      const [row] = await getDb()
        .insert(worlds)
        .values({ slug, name, params, dot, sub, editToken, ownerKey })
        .returning({
          slug: worlds.slug,
          name: worlds.name,
          params: worlds.params,
          dot: worlds.dot,
          sub: worlds.sub,
          createdAt: worlds.createdAt,
        })

      // editToken is returned only here, to the creator, and never listed.
      return res.status(201).json({ world: row, editToken })
    }

    res.setHeader('allow', 'GET, POST')
    return fail(res, 405, 'Method not allowed')
  } catch (e) {
    console.error('[api/worlds]', e)
    return fail(res, 500, 'Something went wrong saving that world.')
  }
}
