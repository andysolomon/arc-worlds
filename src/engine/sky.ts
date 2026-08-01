/**
 * What the rest of the system looks like from one of its worlds.
 *
 * The single-world view has always drawn its world against a starfield of
 * invented stars. This is the other half of the sky: the star it actually
 * orbits, and the other planets, in the directions and at the sizes they really
 * occupy from where you are standing.
 *
 * Nothing here is compressed, which makes it the one part of the app drawn at
 * true scale. That is the point of it. The Sun is half a degree across from
 * Earth and one arcsecond from Neptune, and a viewer who has only ever seen the
 * orbit view — where Neptune is pulled in to eight times Mercury's distance
 * rather than seventy-seven — has never been shown what that means. Jupiter
 * from Earth is forty arcseconds: a point of light, and the honest way to draw
 * it is as a point of light.
 *
 * Everything is returned as directions and angles. Where the renderer puts them
 * is its business — they are effectively at infinity.
 */

import { kepler, starRadius } from './scale'
import type { SystemBody, SystemDef } from './types'

const AU_KM = 149597870.7
const EARTH_KM = 6371
const SUN_KM = 696340
const D2R = Math.PI / 180

/** A body as it appears in someone's sky. */
export interface SkyBody {
  name: string
  /** Its place in `def.bodies`, so a renderer can find its colours. */
  index: number
  /** Unit vector in the system's own frame. */
  dir: [number, number, number]
  /** Angular radius in radians. */
  ang: number
  /**
   * Apparent brightness, relative to the brightest thing in this sky other than
   * the star. Sunlight reflected off a disc, falling off with distance twice —
   * once on the way there and once on the way back — and dimmed by the phase
   * that is turned away. The comparison is what matters, not the unit.
   */
  bright: number
  /** How lit the disc is, 0 at new and 1 at full. */
  phase: number
}

export interface Sky {
  /** The star. Always present: something is always shining on you. */
  star: SkyBody
  /** Everything else in the system, nearest first. */
  bodies: SkyBody[]
}

/**
 * Where a body is, in AU, in the system's reference frame.
 *
 * The same elements and the same Kepler solve the orbit view uses, at their
 * measured values rather than the drawn ones — and the same starting angle, so
 * the two views agree about where everybody is at the moment the clock starts.
 * Their clocks then run at different compressions, as they always have: a year
 * takes fourteen seconds over there and a day takes fourteen seconds here.
 */
export function bodyAt(b: SystemBody, index: number, tYears: number): [number, number, number] {
  const M = ((index * 2.3994) % 6.2832) + (b.period > 0 ? (tYears * 6.2832) / b.period : 0)
  const E = kepler(M, b.e)
  const x = b.a * (Math.cos(E) - b.e)
  const z = b.a * Math.sqrt(1 - b.e * b.e) * Math.sin(E)
  // Argument of perihelion measured from the node, exactly as applyOrbits does.
  const w = (b.peri - b.node) * D2R
  const cw = Math.cos(w)
  const sw = Math.sin(w)
  const px = x * cw - z * sw
  const pz = x * sw + z * cw
  // Then the orbit plane itself: tipped by the inclination, swung round to the
  // longitude of its ascending node.
  const ci = Math.cos(b.inc * D2R)
  const si = Math.sin(b.inc * D2R)
  const y = pz * si
  const zz = pz * ci
  const cn = Math.cos(b.node * D2R)
  const sn = Math.sin(b.node * D2R)
  return [px * cn + zz * sn, y, -px * sn + zz * cn]
}

const sub = (a: number[], b: number[]): [number, number, number] =>
  [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const len = (v: number[]) => Math.hypot(v[0], v[1], v[2])
const unit = (v: number[]): [number, number, number] => {
  const l = len(v) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** Angular radius of a sphere of radius `r` seen from `d` away, both in AU. */
function angular(r: number, d: number): number {
  return d > r ? Math.asin(r / d) : Math.PI / 2
}

/**
 * The sky above one body of a system.
 *
 * A moon stands where its planet stands: our own is a fifth of a percent of the
 * way to the Sun, which moves nothing in this sky by as much as a pixel. The
 * planet it belongs to is the exception, and that one the view already draws
 * beside it, so it is left out here rather than drawn twice.
 */
export function skyFrom(def: SystemDef, viewerName: string, tYears: number): Sky | null {
  const i = def.bodies.findIndex((b) => b.name === viewerName)
  if (i < 0) return null
  const me = def.bodies[i]
  // A moon observes from its planet, and never lists it.
  const hostName = me.orbits ?? me.name
  const hostIndex = me.orbits ? def.bodies.findIndex((b) => b.name === me.orbits) : i
  if (hostIndex < 0) return null

  const eye = bodyAt(def.bodies[hostIndex], hostIndex, tYears)
  const starR = (SUN_KM * starRadius(def.star.mass)) / AU_KM
  const toStar = sub([0, 0, 0], eye)
  const dStar = len(toStar)

  const star: SkyBody = {
    name: def.star.name,
    index: -1,
    dir: unit(toStar),
    ang: angular(starR, dStar),
    bright: 1,
    phase: 1,
  }

  const bodies: SkyBody[] = []
  def.bodies.forEach((b, k) => {
    if (b.name === hostName || b.name === viewerName) return
    // A moon of another planet is a speck beside the planet it belongs to, and
    // is drawn at that planet's place anyway. One dot per neighbourhood.
    if (b.orbits) return
    const p = bodyAt(b, k, tYears)
    const rel = sub(p, eye)
    const d = len(rel)
    if (!(d > 0)) return
    const r = (b.radius * EARTH_KM) / AU_KM
    const dSun = len(p) || 1e-9
    // The phase angle, at the body: sun on one side, viewer on the other.
    const cosPhase = dot(unit(sub(eye, p)), unit(sub([0, 0, 0], p)))
    const phase = (1 + Math.max(-1, Math.min(1, cosPhase))) / 2
    bodies.push({
      name: b.name,
      index: k,
      dir: unit(rel),
      ang: angular(r, d),
      // Reflected sunlight: the disc it presents, lit by what reaches it, seen
      // from where you are, times the fraction of that disc facing you.
      bright: ((r * r) / (dSun * dSun * d * d)) * phase,
      phase,
    })
  })

  // Nearest first, so a renderer that has to drop some drops the far ones.
  bodies.sort((a, b) => b.bright - a.bright)
  return { star, bodies }
}
