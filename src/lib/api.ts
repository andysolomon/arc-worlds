import type { PlanetParams } from '../engine/types'

export interface SavedWorld {
  slug: string
  name: string
  params: PlanetParams
  dot: string
  sub: string
  createdAt: string
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `Request failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

/** Most recently saved worlds, for the gallery. */
export async function listWorlds(limit = 24): Promise<SavedWorld[]> {
  const res = await fetch(`/api/worlds?limit=${limit}`)
  const body = await json<{ worlds: SavedWorld[] }>(res)
  return body.worlds
}

export async function getWorld(slug: string): Promise<SavedWorld> {
  const res = await fetch(`/api/worlds/${encodeURIComponent(slug)}`)
  const body = await json<{ world: SavedWorld }>(res)
  return body.world
}

export async function saveWorld(name: string, params: PlanetParams): Promise<SavedWorld> {
  const res = await fetch('/api/worlds', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, params }),
  })
  const body = await json<{ world: SavedWorld }>(res)
  return body.world
}
