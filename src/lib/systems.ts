/**
 * Systems: validation, generation and editing.
 *
 * A system is a star plus a list of bodies, and a body is a world plus an
 * orbit. Like a world it is entirely described by its data — a few kilobytes
 * of JSON — so the same object is what gets stored, shared and rendered.
 */
import { mulberry32 } from '../engine/noise.js'
import { periodFor } from '../engine/scale.js'
import type {
  PlanetParams, PresetKey, RingConfig, Star, SystemBody, SystemDef,
} from '../engine/types.js'
import { PRESETS } from '../data/presets.js'
import { genName, safeTexture, sanitize, serialize, surprise } from './params.js'

/** Enough for a generous system without letting one payload get silly. */
export const MAX_BODIES = 12

export const A_MIN = 0.04
export const A_MAX = 90
export const MASS_MIN = 0.08
export const MASS_MAX = 3

const num = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === 'number' && !Number.isNaN(v) ? Math.min(hi, Math.max(lo, v)) : fallback

const int = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : fallback

const rgb = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(0xffffff, Math.max(0, Math.floor(v))) : fallback

// Control characters, including DEL — a system name is user-supplied and is
// rendered straight into the gallery.
// oxlint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g

function text(v: unknown, fallback: string, max: number): string {
  const s = typeof v === 'string' ? v.replace(CONTROL_CHARS, '').trim() : ''
  return (s || fallback).slice(0, max)
}

/**
 * A ring config feeds a shader directly, so every field is re-checked rather
 * than trusted. Anything malformed drops the ring instead of half-applying it.
 */
function safeRing(v: unknown): RingConfig | null {
  if (!v || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  if (typeof r.inner !== 'number' || typeof r.outer !== 'number') return null

  const inner = num(r.inner, 1.01, 12, 1.2)
  const outer = num(r.outer, inner + 0.01, 14, inner + 0.6)
  const out: RingConfig = {
    inner,
    outer,
    color: rgb(r.color, 0xffffff),
    opacity: num(r.opacity, 0, 1, 0.7),
    profile: int(r.profile, 0, 6, 0),
  }

  const map = safeTexture(r.map)
  if (map) out.map = map

  if (Array.isArray(r.bands)) {
    const bands = r.bands
      .filter((b): b is number[] => Array.isArray(b) && b.length === 4 && b.every((n) => typeof n === 'number'))
      .slice(0, 8)
      .map((b) => [num(b[0], 0, 1, 0), num(b[1], 0, 1, 1), num(b[2], 0, 1, 0.7), num(b[3], 0, 1, 1)] as [number, number, number, number])
    if (bands.length) out.bands = bands
  }
  return out
}

function sanitizeBody(input: unknown, index: number, mass: number): SystemBody {
  const b = (input ?? {}) as Record<string, unknown>
  const params = sanitize(b.params)
  const a = num(b.a, A_MIN, A_MAX, 0.4 + index * 0.9)

  return {
    name: text(b.name, `Body ${index + 1}`, 40),
    a,
    // The period is never taken from the client: it is a consequence of the
    // distance and the star, and deriving it stops a saved system from
    // orbiting at a speed its own geometry cannot justify.
    period: periodFor(a, mass),
    e: num(b.e, 0, 0.7, 0),
    inc: num(b.inc, -40, 40, 0),
    node: num(b.node, 0, 360, 0),
    peri: num(b.peri, 0, 360, 0),
    radius: num(b.radius, 0.15, 16, 1),
    tilt: num(b.tilt, -180, 180, 0),
    flattening: num(b.flattening, 0, 0.25, 0.003),
    day: num(b.day, -2000, 2000, 24) || 24,
    params,
    texture: safeTexture(b.texture),
    ring: safeRing(b.ring),
  }
}

/**
 * Coerce arbitrary input into a valid system. Used on load from storage and on
 * the server for anything arriving over the wire.
 *
 * Origin is always forced to `custom`: a payload must never be able to claim
 * that its invented numbers are measured ones.
 */
export function sanitizeSystem(input: unknown): SystemDef {
  const raw = (input ?? {}) as Record<string, unknown>
  const rawStar = (raw.star ?? {}) as Record<string, unknown>
  const star: Star = {
    name: text(rawStar.name, 'Unnamed star', 40),
    color: rgb(rawStar.color, 0xffd9a0),
    mass: num(rawStar.mass, MASS_MIN, MASS_MAX, 1),
  }

  const list = Array.isArray(raw.bodies) ? raw.bodies.slice(0, MAX_BODIES) : []
  const bodies = list.map((b, i) => sanitizeBody(b, i, star.mass))

  return {
    id: text(raw.id, 'custom', 64).replace(/[^A-Za-z0-9_-]/g, '') || 'custom',
    name: text(raw.name, 'Untitled system', 60),
    sub: text(raw.sub, 'a system of your own', 90),
    origin: 'custom',
    star,
    bodies: sortByDistance(bodies),
  }
}

/* --- editing ------------------------------------------------------------- */

/** Bodies always read outward from the star, however they were added. */
export function sortByDistance(bodies: SystemBody[]): SystemBody[] {
  return [...bodies].sort((x, y) => x.a - y.a)
}

/** Re-derive every period. Call after the star's mass changes. */
export function retime(def: SystemDef): SystemDef {
  return {
    ...def,
    bodies: def.bodies.map((b) => ({ ...b, period: periodFor(b.a, def.star.mass) })),
  }
}

/**
 * Start an editable copy. The copy is `custom` even when the original was the
 * measured Solar System — once you can move Jupiter, it is not a record of
 * anything any more.
 */
export function duplicateSystem(def: SystemDef, name?: string): SystemDef {
  return {
    ...def,
    id: 'custom',
    name: name ?? `${def.name} (copy)`,
    sub: def.origin === 'measured' ? 'built from the Solar System' : 'a system of your own',
    origin: 'custom',
    star: { ...def.star },
    bodies: def.bodies.map((b) => ({ ...b, params: { ...b.params }, ring: b.ring ? { ...b.ring } : null })),
  }
}

/** Sensible orbital elements for a world being dropped into a system. */
export function bodyFromWorld(
  name: string,
  params: PlanetParams,
  a: number,
  mass: number,
): SystemBody {
  const gas = PRESETS.find((p) => p.key === params.preset)?.gas === true
  const r = mulberry32((params.seed | 0) + 1013904223)
  return {
    name,
    a,
    period: periodFor(a, mass),
    e: r() * 0.06,
    inc: (r() - 0.5) * 6,
    node: r() * 360,
    peri: r() * 360,
    radius: gas ? 5 + r() * 6 : 0.5 + r() * 1.2,
    tilt: (r() - 0.5) * 60,
    flattening: gas ? 0.04 + r() * 0.05 : 0.002 + r() * 0.006,
    day: dayFor(params),
    params,
    texture: params.texture ?? null,
    ring: null,
  }
}

/**
 * A sidereal day, in hours, from the sculptor's spin controls — so a world
 * that turns quickly under your hands also turns quickly in orbit.
 */
export function dayFor(params: PlanetParams): number {
  const hours = 6 + (1 - (params.spinSpeed ?? 0.5)) * 42
  return params.spinDir === -1 ? -hours : hours
}

/** Where a newly added body should go: comfortably outside everything else. */
export function nextDistance(def: SystemDef): number {
  const outer = def.bodies.reduce((m, b) => Math.max(m, b.a), 0)
  if (!outer) return 0.6
  // Geometric spacing runs out of room before the world limit does — at 1.7×
  // a step, the eleventh world is already past the outer edge — and clamping
  // would stack the last few at exactly the same distance. Past that point
  // each new world closes half the remaining gap instead, so every orbit stays
  // distinct however full the system gets.
  const next = outer * 1.7
  return next <= A_MAX ? next : outer + (A_MAX - outer) / 2
}

/** True while the system will still take another world. */
export function hasRoom(def: SystemDef): boolean {
  return def.origin === 'custom' && def.bodies.length < MAX_BODIES
}

/**
 * Make a system editable, if it is not already.
 *
 * The measured Solar System and the invented Andromeda are both read-only, so
 * adding a world to either can only mean adding it to a copy. The alternative
 * is refusing the click, which from the world gallery — where the system you
 * are adding to is not even on screen — would be inexplicable.
 */
export function editableCopy(def: SystemDef): SystemDef {
  return def.origin === 'custom' ? def : duplicateSystem(def)
}

/**
 * Put a world into a system, on an orbit outside everything already there.
 *
 * Every route into a system comes through here — the sculptor, the world
 * types, the gallery — so a world joins a system in exactly one way however
 * you asked for it. A full system is returned untouched rather than quietly
 * dropping the world or, worse, copying a read-only system to no purpose.
 */
/**
 * Whether this exact world is already orbiting in the system.
 *
 * Identity is the sanitized, serialized params — the same under-1KB object
 * that gets saved and shared — so a renamed copy still counts as the same
 * world and a reshaped one does not. Used to warn before a silent duplicate,
 * never to refuse one: duplicates are allowed, just always deliberate.
 */
export function worldInSystem(def: SystemDef, params: PlanetParams): boolean {
  const id = serialize(sanitize(params))
  return def.bodies.some((b) => serialize(sanitize(b.params)) === id)
}

export function addWorld(def: SystemDef, name: string, params: PlanetParams): SystemDef {
  const s = editableCopy(def)
  if (!hasRoom(s)) return def
  const world = { ...params }
  const body = bodyFromWorld(text(name, 'Untitled world', 40), world, nextDistance(s), s.star.mass)
  return { ...s, bodies: sortByDistance([...s.bodies, body]) }
}

/**
 * Roll a fresh world straight into the system, of a given type or of any.
 *
 * This is the one that removes the round trip: a system can be populated
 * without a world ever passing through the sculptor.
 */
export function addRolledWorld(def: SystemDef, preset?: PresetKey, seed?: number): SystemDef {
  const { params, name } = surprise(seed, preset)
  return addWorld(def, name, params)
}

/** The regnal suffixes world names already carry, in order. */
const REGNAL = ['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
const REGNAL_SUFFIX = new RegExp(` (?:${REGNAL.join('|')})$`)

/**
 * The next name in a line: Mirabelle, then Mirabelle II, then Mirabelle III.
 *
 * Names here already come with regnal suffixes now and then, so a copy reads
 * as another world in the same family rather than as “Mirabelle (copy)”. The
 * search starts after the suffix the world already carries — a copy of
 * Wimpond III is Wimpond IV — and only wraps back to the start of the line if
 * everything above is taken.
 */
function nextInLine(name: string, taken: Set<string>): string {
  const base = name.replace(REGNAL_SUFFIX, '')
  const at = REGNAL.indexOf(name.slice(base.length + 1))
  return [...REGNAL.slice(at + 1), ...REGNAL]
    .map((r) => `${base} ${r}`)
    .find((n) => !taken.has(n)) ?? base
}

/**
 * Copy a world already in orbit onto a new orbit further out — another one
 * like that, ready to be changed, without a trip back through the sculptor.
 */
export function duplicateBody(def: SystemDef, index: number): SystemDef {
  const b = def.bodies[index]
  if (!b || !hasRoom(def)) return def
  const a = nextDistance(def)
  const copy: SystemBody = {
    ...b,
    name: nextInLine(b.name, new Set(def.bodies.map((x) => x.name))),
    a,
    period: periodFor(a, def.star.mass),
    params: { ...b.params },
    ring: b.ring ? { ...b.ring } : null,
  }
  return { ...def, bodies: sortByDistance([...def.bodies, copy]) }
}

/* --- generation ---------------------------------------------------------- */

export interface StarKind {
  label: string
  color: number
  mass: number
}

/** Roughly the main sequence, warm to hot, with plausible masses. */
export const STAR_KINDS: StarKind[] = [
  { label: 'red dwarf', color: 0xff8a5c, mass: 0.28 },
  { label: 'orange dwarf', color: 0xffb478, mass: 0.78 },
  { label: 'yellow dwarf', color: 0xffffff, mass: 1 },
  { label: 'white star', color: 0xdfe6ff, mass: 1.6 },
  { label: 'blue-white star', color: 0xb9ccff, mass: 2.4 },
]

const STAR_NAMES = [
  'Halcyon', 'Veth', 'Orin', 'Sable', 'Quill', 'Marrow', 'Tessel', 'Bram',
  'Corvid', 'Lumen', 'Ashling', 'Pike', 'Ferrow', 'Gale', 'Nettle',
]

const ROCKY: PresetKey[] = ['temperate', 'desert', 'ice', 'lava', 'candy']
const GAS: PresetKey[] = ['gasAmber', 'gasMist', 'gasStorm']

/**
 * Roll a whole system from one seed.
 *
 * Distances grow geometrically outward, and gas giants get likelier the
 * further out you go — not a physical model, but it produces systems that read
 * as systems rather than as a random pile of planets.
 */
export function rollSystem(seed = (Math.random() * 99999) | 0): SystemDef {
  const r = mulberry32(seed * 2654435761)
  const kind = STAR_KINDS[(r() * STAR_KINDS.length) | 0]
  const starName = STAR_NAMES[(r() * STAR_NAMES.length) | 0]
  const mass = Math.max(MASS_MIN, kind.mass * (0.85 + r() * 0.3))
  const count = 3 + ((r() * 5) | 0)

  const bodies: SystemBody[] = []
  let a = 0.14 + r() * 0.4
  for (let i = 0; i < count; i++) {
    const outward = i / Math.max(1, count - 1)
    const gas = r() < 0.12 + outward * 0.6
    const pool = gas ? GAS : ROCKY
    const preset = pool[(r() * pool.length) | 0]

    const bodySeed = ((seed * 31 + i * 7919) % 999983) | 0
    const { params, name } = surprise(bodySeed, preset)
    const body = bodyFromWorld(name, params, Math.min(A_MAX, a), mass)
    // Giants far enough out to be cold are the ones that keep bright rings.
    body.ring = null
    body.params.rings = gas && a > 2.2 && r() < 0.55
    bodies.push(body)

    a *= 1.45 + r() * 1.25
  }

  return {
    id: 'custom',
    name: `${starName} ${['Reach', 'System', 'Cluster', 'Span', 'Fields'][(r() * 5) | 0]}`,
    sub: `imagined · ${kind.label}, ${count} worlds`,
    origin: 'custom',
    star: { name: starName, color: kind.color, mass },
    bodies,
  }
}

/** An empty system to start from. */
export function emptySystem(seed = (Math.random() * 99999) | 0): SystemDef {
  const r = mulberry32(seed * 2654435761)
  const name = genName(r)
  return {
    id: 'custom',
    name: `${name} System`,
    sub: 'a system of your own',
    origin: 'custom',
    star: { name, color: 0xffd9a0, mass: 1 },
    bodies: [],
  }
}

/** Accent colour for a gallery card — the star itself. */
export function starDot(def: SystemDef): string {
  return `#${def.star.color.toString(16).padStart(6, '0')}`
}
