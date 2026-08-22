/**
 * Every system the app knows about, in one list.
 *
 * The Systems tab used to open on a single flat row of chips — nine built-in
 * systems side by side with no hint that one of them is measured, four are
 * real orbits around real stars, and four were invented — with the systems
 * saved in this browser stranded in a separate list at the far bottom of the
 * panel. Worlds solved the same problem by category (see `lib/catalog`), and
 * this is that solution applied to systems, sharing its vocabulary so the two
 * tabs cannot disagree about what "observed" means.
 *
 * Nothing here restates a system. Category comes from each system's own
 * `origin`, so a system added to `data/systems` appears in this catalog
 * without anyone remembering to list it twice.
 */
import { BUILT_IN_SYSTEMS } from '../data/systems'
import { starDot } from './systems'
import type { SavedSystem } from './api'
import type { SystemDef } from '../engine/types'

export type SystemKind = 'saved' | 'measured' | 'observed' | 'imagined'

export interface CatalogSystem {
  /** Stable across renders; the React key and the test hook. */
  id: string
  name: string
  sub: string
  dot: string
  kind: SystemKind
  /** The star at the centre, named on the card. */
  star: string
  /** How many worlds orbit in it, moons included. */
  worlds: number
  /** The system itself, for selecting it. */
  def: SystemDef
  /** The gallery entry behind a saved card, for Open. */
  saved: SavedSystem | null
  /** The unsaved system being edited right now — there is at most one. */
  working: boolean
}

export interface SystemCatalogGroup {
  key: SystemKind
  label: string
  /** One line on what this category is, so the honesty is visible. */
  note: string
  systems: CatalogSystem[]
}

/**
 * A system's category is its origin, with one rename: a `custom` system is
 * one of yours, and "Your systems" is what the reader is looking for.
 */
function kindOf(def: SystemDef): SystemKind {
  return def.origin === 'custom' ? 'saved' : def.origin
}

const GROUP_META: Array<[SystemKind, string, string]> = [
  ['saved', 'Your systems', 'Saved in this browser. Each one rebuilds from its definition, so a link opens the system itself rather than a picture of it.'],
  ['measured', 'The Solar System', 'Measured — every orbit, year and radius in it comes from observation.'],
  ['observed', 'Observed exoplanets', 'Real orbits around real stars; every surface is imagined.'],
  ['imagined', 'Imagined systems', 'Invented outright — including the ones wearing a real star, where the story is not a measurement.'],
]

/**
 * Assemble the catalog.
 *
 * `saved` comes from the gallery and `working` is whatever unsaved system is
 * being edited, so both are passed in rather than imported — this stays a
 * pure function of its inputs and is testable without a network.
 */
export function buildSystemCatalog(
  saved: SavedSystem[],
  working: SystemDef | null = null,
): SystemCatalogGroup[] {
  const systems: CatalogSystem[] = []

  // The system being edited has no slug yet, so it would vanish from the list
  // the moment it was created — the one system you are actually holding.
  if (working && working.origin === 'custom') {
    systems.push({
      id: 'working',
      name: working.name,
      sub: `${working.sub} · not saved yet`,
      dot: starDot(working),
      kind: 'saved',
      star: working.star.name,
      worlds: working.bodies.length,
      def: working,
      saved: null,
      working: true,
    })
  }

  for (const s of saved) {
    systems.push({
      id: `saved:${s.slug}`,
      name: s.name,
      sub: s.sub,
      dot: s.dot,
      kind: 'saved',
      star: s.def.star.name,
      worlds: s.def.bodies.length,
      def: s.def,
      saved: s,
      working: false,
    })
  }

  for (const def of BUILT_IN_SYSTEMS) {
    systems.push({
      id: def.id,
      name: def.name,
      sub: def.sub,
      dot: starDot(def),
      kind: kindOf(def),
      star: def.star.name,
      worlds: def.bodies.length,
      def,
      saved: null,
      working: false,
    })
  }

  return GROUP_META.map(([key, label, note]) => ({
    key,
    label,
    note,
    systems: systems.filter((s) => s.kind === key),
  })).filter((g) => g.systems.length > 0)
}

/** Case-insensitive match across the parts of a card a reader can actually see. */
export function matchesSystemQuery(s: CatalogSystem, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    s.name.toLowerCase().includes(q) ||
    s.sub.toLowerCase().includes(q) ||
    s.star.toLowerCase().includes(q)
  )
}
