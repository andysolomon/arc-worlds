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

/**
 * Enough for a generous system without letting one payload get silly. Raised
 * from 12 when moons became worlds: the Solar System alone carries nine
 * planets and seven satellites, and a copy of it has to survive intact.
 */
export const MAX_BODIES = 24

// Low enough for real compact systems: TRAPPIST-1 b orbits at 0.0115 AU, and
// a duplicated copy of it must survive sanitisation with its orbits intact.
export const A_MIN = 0.01
// A satellite's distance is measured from its planet: the Moon is 0.00257 AU
// from Earth, and Pandora closer still to Polyphemus.
export const A_SAT_MIN = 0.0001
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
  // A satellite's distance is measured from its planet, not the star, so it
  // sits far below the floor an ordinary orbit has to clear.
  const orbits = typeof b.orbits === 'string' ? text(b.orbits, '', 40) : ''
  const a = num(b.a, orbits ? A_SAT_MIN : A_MIN, A_MAX, 0.4 + index * 0.9)

  return {
    name: text(b.name, `Body ${index + 1}`, 40),
    a,
    ...(orbits ? { orbits } : null),
    // The period is never taken from the client: it is a consequence of the
    // distance and the star, and deriving it stops a saved system from
    // orbiting at a speed its own geometry cannot justify. A satellite orbits
    // its planet instead, whose mass we do not carry, so its own period is
    // kept — clamped to something a year could actually be.
    period: orbits ? num(b.period, 1e-5, 1e4, 0.1) : periodFor(a, mass),
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

/**
 * Bodies always read outward from the star, however they were added — and a
 * satellite reads directly after the planet it orbits rather than by its own
 * distance, which is measured from that planet and would otherwise sort it in
 * front of Mercury.
 */
export function sortByDistance(bodies: SystemBody[]): SystemBody[] {
  const planets = bodies.filter((b) => !b.orbits).sort((x, y) => x.a - y.a)
  const out: SystemBody[] = []
  for (const p of planets) {
    out.push(p)
    out.push(...bodies.filter((b) => b.orbits === p.name).sort((x, y) => x.a - y.a))
  }
  // Anything naming a parent that is not here keeps its place rather than
  // vanishing; it simply orbits the star like everything else.
  const orphans = bodies.filter((b) => !out.includes(b)).sort((x, y) => x.a - y.a)
  return [...out, ...orphans]
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
    sub:
      def.origin === 'measured'
        ? 'built from the Solar System'
        : def.origin === 'observed'
          ? `built from ${def.name}`
          : 'a system of your own',
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

/** Earth's mass in solar masses, for deriving a planet's pull on its moons. */
const EARTH_MASS = 3.003e-6
/** Gas giants are about a quarter of Earth's density; rocky worlds match it. */
const GAS_DENSITY = 0.24
/** A satellite orbit narrower than this would be inside its planet. */
export const A_SAT_MAX = 0.06

/**
 * A moon's year, from the size of the planet it orbits.
 *
 * The same principle the planets follow — a year is a consequence of where you
 * put a world — carried down one level. Mass is not stored anywhere, but a
 * radius is, and mass goes as the cube of it for a given density. Splitting
 * gas giants from rock at their real density ratio gets the Moon within half
 * a percent and Jupiter's within three. Saturn is half Jupiter's density, so
 * its moons come out about a third quick — which is a fair trade for one
 * constant, on systems that were invented anyway. The measured satellites
 * keep their measured years and never come through here.
 */
export function satPeriodFor(a: number, parentRadius: number, gas: boolean): number {
  const mass = EARTH_MASS * Math.pow(Math.max(0.05, parentRadius), 3) * (gas ? GAS_DENSITY : 1)
  // Not `periodFor`: that floors mass at 0.02 solar masses because it was
  // written for stars, and every planet is millions of times lighter.
  return Math.sqrt(Math.pow(Math.max(1e-6, a), 3) / Math.max(1e-12, mass))
}

/** True when a body's world is one of the gas-giant types. */
export function isGasBody(b: SystemBody): boolean {
  return PRESETS.find((p) => p.key === b.params.preset)?.gas === true
}

/** Where a newly added body should go: comfortably outside everything else. */
export function nextDistance(def: SystemDef): number {
  // Satellites are measured from their planet, not the star, so their
  // distances are a different quantity and have no place in this reckoning.
  const orbits = def.bodies.filter((b) => !b.orbits).map((b) => b.a).sort((x, y) => x - y)
  const outer = orbits.length ? orbits[orbits.length - 1] : 0
  if (!outer) return 0.6

  // Geometric spacing runs out of room before the world limit does — at 1.7×
  // a step, the eleventh world is already past the outer edge — and clamping
  // would stack the last few at exactly the same distance. Past that point
  // each new world closes half the remaining gap instead, so every orbit stays
  // distinct however full the system gets.
  const next = outer * 1.7
  let where = next <= A_MAX ? next : outer + (A_MAX - outer) / 2
  let widest = where / outer

  // But outside everything is only the right answer while it is the emptiest
  // place there is. Dropped on the end of a system that already reaches Pluto,
  // a new world lands at 67 AU with a 550-year year — which is Kepler being
  // right and the placement being useless, since at fourteen seconds to the
  // drawn year that is one lap every two hours and reads as not moving at all.
  // So the widest gap wins, measured as a ratio because orbits are spaced
  // geometrically, and the new world lands at its geometric middle. In the
  // Solar System that is the belt between Mars and Jupiter, which is both
  // watchable and the obvious place a missing planet goes.
  //
  // A gap has to beat the outward slot by a clear margin to win it, not by a
  // hair: a system grown by this very function has every gap at exactly 1.7,
  // and asking which of two identical numbers is larger is answered by
  // floating-point noise. Outside stays the default, so building a system up
  // from nothing works exactly as it always did.
  const CLEARLY_WIDER = 1.02
  for (let i = 1; i < orbits.length; i++) {
    const ratio = orbits[i] / orbits[i - 1]
    if (ratio > widest * CLEARLY_WIDER) {
      widest = ratio
      where = Math.sqrt(orbits[i - 1] * orbits[i])
    }
  }
  return where
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
/**
 * Put a world in orbit around one of the system's own bodies.
 *
 * A moon is an ordinary world that happens to be somewhere else, so this is
 * `addWorld` with a parent named and the distance measured from that parent
 * instead of from the star. Moons of moons are refused: one level is what the
 * renderer draws and what anybody expects.
 */
export function addMoon(
  def: SystemDef,
  parentIndex: number,
  preset?: PresetKey,
  seed?: number,
): SystemDef {
  const s = editableCopy(def)
  const parent = s.bodies[parentIndex]
  if (!parent || parent.orbits || !hasRoom(s)) return def

  const { params, name } = surprise(seed, preset)
  const taken = s.bodies.filter((b) => b.orbits === parent.name)
  // Each moon lands outside the last, in the band a real satellite occupies.
  const a = taken.length
    ? Math.min(A_SAT_MAX, taken.reduce((m, b) => Math.max(m, b.a), 0) * 1.6)
    : nextMoonDistance(parent)
  const gas = isGasBody(parent)

  const body: SystemBody = {
    ...bodyFromWorld(name, params, a, s.star.mass),
    period: satPeriodFor(a, parent.radius, gas),
    radius: Math.max(0.15, parent.radius * 0.27),
    orbits: parent.name,
  }
  return { ...s, bodies: sortByDistance([...s.bodies, body]) }
}

/** A first moon sits a few planet-radii out, where real ones tend to. */
function nextMoonDistance(parent: SystemBody): number {
  const km = parent.radius * 6371 * 8
  return Math.min(A_SAT_MAX, Math.max(A_SAT_MIN, km / 149597870.7))
}

/**
 * Change what a body orbits: the star, or one of the other bodies.
 *
 * Distances mean different things on either side of that line — from the star
 * or from the planet — so the body is given a sensible one for wherever it has
 * landed rather than keeping a number that no longer means anything. Anything
 * orbiting the body being demoted is returned to the star, since moons of
 * moons are not drawn.
 */
export function setParent(def: SystemDef, index: number, parentName: string): SystemDef {
  const b = def.bodies[index]
  if (!b) return def
  const parent = parentName ? def.bodies.find((x) => x.name === parentName) : null
  // Moons of moons are not drawn, so neither end of the relationship may
  // already be one: the parent cannot be a moon, and a body that carries
  // moons of its own cannot become one.
  if (parentName) {
    if (!parent || parent === b || parent.orbits) return def
    if (def.bodies.some((x) => x.orbits === b.name)) return def
  }

  const bodies = def.bodies.map((x, k) => {
    if (k !== index) return x
    if (!parent) {
      const { orbits: _drop, ...rest } = x
      const a = nextDistance({ ...def, bodies: def.bodies.filter((y) => !y.orbits) })
      return { ...rest, a, period: periodFor(a, def.star.mass) }
    }
    const a = nextMoonDistance(parent)
    return { ...x, orbits: parent.name, a, period: satPeriodFor(a, parent.radius, isGasBody(parent)) }
  })
  return { ...def, bodies: sortByDistance(bodies) }
}

/**
 * Remove a body, returning anything that orbited it to the star rather than
 * leaving it pointing at a planet that is no longer there.
 */
export function removeBodyAt(def: SystemDef, index: number): SystemDef {
  const gone = def.bodies[index]
  if (!gone) return def
  const rest = def.bodies.filter((_, k) => k !== index)
  const bodies = rest.map((b) => {
    if (b.orbits !== gone.name) return b
    const { orbits: _drop, ...kept } = b
    const a = nextDistance({ ...def, bodies: rest })
    return { ...kept, a, period: periodFor(a, def.star.mass) }
  })
  return { ...def, bodies: sortByDistance(bodies) }
}

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
  // Cool enough for the TRAPPIST-1 class; the drawn-size floor keeps it visible.
  { label: 'ember dwarf', color: 0xff7a4a, mass: 0.1 },
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
