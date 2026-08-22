/**
 * Every world the app knows about, in one list.
 *
 * The Worlds tab used to be a private shelf — only the worlds saved in this
 * browser. But the app ships with dozens: the measured planets and moons, the
 * deep-time reconstructions, the observed exoplanets, the invented worlds of
 * Andromeda, and the homages. They were reachable only by digging through the
 * Systems tab, one system at a time. This assembles all of them, plus your
 * own, into named categories so Worlds home can show the whole collection.
 *
 * Nothing here restates a world. Every entry is read from the same tables the
 * canvas builds from, so a world added to a system or a preset appears in this
 * catalog without anyone remembering to list it twice.
 */
import { ANCIENT, FICTION, MOONS, PRESETS, SOLAR, typeOf } from '../data/presets'
import { BUILT_IN_SYSTEMS, MILKY_WAY_ID } from '../data/systems'
import { CURRENT_PARAMS } from './params'
import type { SavedWorld } from './api'
import type { PlanetParams, PresetKey, SystemDef } from '../engine/types'

export type CatalogKind =
  | 'saved'
  | 'planet'
  | 'moon'
  | 'ancient'
  | 'observed'
  | 'imagined'
  | 'fiction'
  | 'type'

export interface CatalogWorld {
  /** Stable across renders; the React key and the test hook. */
  id: string
  name: string
  sub: string
  dot: string
  kind: CatalogKind
  /** The system it belongs to, for the worlds that orbit something. */
  system: string | null
  /** A world type has no world of its own yet — it starts one. */
  preset: PresetKey | null
  /** The world itself, for everything that is a world rather than a type. */
  params: PlanetParams | null
  /** The gallery entry behind a saved card, for Link and Add. */
  saved: SavedWorld | null
}

export interface CatalogGroup {
  key: CatalogKind
  label: string
  /** One line on what this category is, so the honesty is visible. */
  note: string
  worlds: CatalogWorld[]
}

/** The canonical worlds, by the identity rule the whole app uses: key + seed. */
const CANONICAL = [...SOLAR, ...ANCIENT, ...FICTION, ...MOONS]

function canonicalFor(params: Pick<PlanetParams, 'preset' | 'seed'>) {
  return CANONICAL.find((w) => w.key === params.preset && w.params.seed === params.seed) ?? null
}

const isFiction = (params: Pick<PlanetParams, 'preset' | 'seed'>) =>
  FICTION.some((f) => f.key === params.preset && f.params.seed === params.seed)

/**
 * What category a body in a built-in system belongs to.
 *
 * Derived from the system's own `origin` rather than a hand-kept list, so the
 * catalog cannot disagree with what the system says about itself. Fiction is
 * checked first: a homage world sits in an `imagined` system, and calling it
 * merely invented would lose the thing that makes it worth showing.
 */
function kindOfBody(system: SystemDef, body: { params: PlanetParams; orbits?: string }): CatalogKind {
  if (system.id === MILKY_WAY_ID) return body.orbits ? 'moon' : 'planet'
  if (isFiction(body.params)) return 'fiction'
  return system.origin === 'observed' ? 'observed' : 'imagined'
}

function subFor(system: SystemDef, params: PlanetParams, orbits?: string): string {
  const canonical = canonicalFor(params)
  if (canonical) return canonical.sub
  const type = typeOf(params.preset).label.toLowerCase()
  const where = orbits ? `orbits ${orbits}` : system.name
  return `${where} · ${type} world`
}

const GROUP_META: Array<[CatalogKind, string, string]> = [
  ['saved', 'Your worlds', 'Saved in this browser. Each one rebuilds from its seed, so a link opens the world itself rather than a picture of it.'],
  ['planet', 'The Solar System', 'Measured worlds — every number in these comes from observation.'],
  ['moon', 'Moons', 'Satellites that are worlds in their own right, measured like the planets.'],
  ['ancient', 'Ancient worlds', 'Deep-time reconstructions, rebuilt from evidence rather than measured.'],
  ['observed', 'Observed exoplanets', 'Real orbits around real stars; every surface is imagined.'],
  ['imagined', 'Imagined worlds', 'Invented outright — nothing here claims to be a measurement.'],
  ['fiction', 'From fiction', 'Original interpretations of worlds from stories, labelled that way wherever they scan.'],
  ['type', 'Start a new world', 'The eight world types. Opening one rolls a fresh seed and hands you the sliders.'],
]

/**
 * Assemble the catalog.
 *
 * `saved` comes from the gallery, so it is passed in rather than imported —
 * this stays a pure function of its inputs and is testable without a network.
 */
export function buildCatalog(saved: SavedWorld[]): CatalogGroup[] {
  const worlds: CatalogWorld[] = []

  for (const w of saved) {
    worlds.push({
      id: `saved:${w.slug}`,
      name: w.name,
      sub: w.sub,
      dot: w.dot,
      kind: 'saved',
      system: null,
      preset: null,
      params: w.params,
      saved: w,
    })
  }

  for (const system of BUILT_IN_SYSTEMS) {
    for (const body of system.bodies) {
      worlds.push({
        id: `${system.id}:${body.name}`,
        name: body.name,
        sub: subFor(system, body.params, body.orbits),
        dot: canonicalFor(body.params)?.dot ?? typeOf(body.params.preset).dot,
        kind: kindOfBody(system, body),
        system: system.name,
        preset: null,
        params: body.params,
        saved: null,
      })
    }
  }

  // The reconstructions belong to no system — they are Earth and Mars at
  // another moment, not other places — so they are added from their own table.
  for (const a of ANCIENT) {
    worlds.push({
      id: `ancient:${a.key}`,
      name: a.name,
      sub: a.sub,
      dot: a.dot,
      kind: 'ancient',
      system: null,
      preset: null,
      params: { ...CURRENT_PARAMS, ...a.params, preset: a.key } as PlanetParams,
      saved: null,
    })
  }

  for (const p of PRESETS) {
    worlds.push({
      id: `type:${p.key}`,
      name: p.label,
      sub: p.gas ? 'a gas giant to shape from scratch' : 'a world type to shape from scratch',
      dot: p.dot,
      kind: 'type',
      system: null,
      preset: p.key,
      params: null,
      saved: null,
    })
  }

  return GROUP_META.map(([key, label, note]) => ({
    key,
    label,
    note,
    worlds: worlds.filter((w) => w.kind === key),
  })).filter((g) => g.worlds.length > 0)
}

/** Case-insensitive match across the parts of a card a reader can actually see. */
export function matchesQuery(w: CatalogWorld, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    w.name.toLowerCase().includes(q) ||
    w.sub.toLowerCase().includes(q) ||
    (w.system?.toLowerCase().includes(q) ?? false)
  )
}
