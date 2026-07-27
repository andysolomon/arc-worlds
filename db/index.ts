import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema.js'

type Db = ReturnType<typeof create>

function create() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  return drizzle(neon(url), { schema })
}

let cached: Db | null = null

/**
 * Lazily create the Drizzle client.
 *
 * Deliberately a function rather than a module-level `db` const: `neon()`
 * throws when DATABASE_URL is missing, and evaluating that at import time
 * breaks builds that run before the database is provisioned. Also deliberately
 * not a Proxy wrapper — those break libraries that introspect the client.
 */
export function getDb(): Db {
  if (!cached) cached = create()
  return cached
}

export { schema }
