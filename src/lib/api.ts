import type { PlanetParams, SystemDef } from '../engine/types'

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

/* --- systems ------------------------------------------------------------- */

export interface SavedSystem {
  slug: string
  name: string
  def: SystemDef
  dot: string
  sub: string
  createdAt: string
}

export async function listSystems(limit = 24): Promise<SavedSystem[]> {
  const res = await fetch(`/api/systems?limit=${limit}`)
  const body = await json<{ systems: SavedSystem[] }>(res)
  return body.systems
}

export async function getSystem(slug: string): Promise<SavedSystem> {
  const res = await fetch(`/api/systems/${encodeURIComponent(slug)}`)
  const body = await json<{ system: SavedSystem }>(res)
  return body.system
}

export async function saveSystem(def: SystemDef): Promise<SavedSystem> {
  const res = await fetch('/api/systems', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ def }),
  })
  const body = await json<{ system: SavedSystem }>(res)
  return body.system
}
