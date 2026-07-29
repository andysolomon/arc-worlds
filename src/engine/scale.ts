/**
 * Scale models and orbital mechanics.
 *
 * Real distances in the solar system are unviewable: at true scale, either
 * Neptune is off-screen or Mercury is a subpixel. Everything here is a
 * deliberate, order-preserving compression — never a physical distance.
 */

/** Seconds of wall clock per planetary day (body spin). */
export const DAY_SEC = 14
/** Seconds of wall clock per day of moon orbital motion. */
export const MOON_DAY = 2.2
/** Seconds per Earth year in the orbit view. */
export const YEAR_SEC = 14

export const D2R = Math.PI / 180

/** Compressed but order-preserving moon distance, in planet radii. */
export function moonDist(a: number): number {
  return 2.35 + 0.62 * Math.log(a / 2.8)
}

/** Moon render radius. Sub-linear so Phobos stays visible next to Titan. */
export function moonRad(r: number): number {
  return Math.max(0.01, 0.03 * Math.pow(r / 0.02, 0.42))
}

/**
 * Long-period moons are eased in wall-clock time so Iapetus (79 days) and
 * Nereid (360 days) still visibly move without hurrying the inner moons.
 */
export function moonPeriodSec(P: number): number {
  const p = Math.abs(P)
  return MOON_DAY * (p <= 20 ? p : 20 + 18 * Math.log(1 + (p - 20) / 18))
}

/**
 * Kepler's third law: P² = a³ / M★, in years, AU and solar masses.
 *
 * Custom systems ask the user for a distance, not a period — a year is a
 * consequence of where you put a planet, so deriving it keeps invented systems
 * behaving like real ones instead of drifting into nonsense.
 */
export function periodFor(a: number, starMass = 1): number {
  return Math.sqrt(Math.pow(Math.max(1e-4, a), 3) / Math.max(0.02, starMass))
}

/**
 * Main-sequence mass–radius relation, in solar units.
 *
 * Below the Sun radius tracks mass almost exactly; above it the star swells
 * more slowly, roughly M^0.8. Across the star kinds on offer — 0.28 to 2.4
 * solar masses — that is a spread of about seven, which is why picking a star
 * cannot leave every star drawn the same size.
 */
export function starRadius(mass: number): number {
  const m = Math.max(0.02, mass)
  return m < 1 ? m : Math.pow(m, 0.8)
}

/**
 * Solve Kepler's equation M = E - e·sin(E) for eccentric anomaly E.
 * Newton-Raphson; five iterations is ample for e < 0.8.
 */
export function kepler(M: number, e: number): number {
  let E = M
  for (let i = 0; i < 5; i++) E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
  return E
}

/* --- Orbit-view scale models -------------------------------------------- */

const VIS_BASE = 11.0
const VIS_EXP = 0.62
const SIZE_MIN = 0.3
const SIZE_MAX = 2.8
const SUN_KM = 696340
const MIN_KM = 2440

/**
 * "To scale" radial remap: d = B·AU^0.62. Monotonic, so ordering and relative
 * spacing survive, but the outer system is pulled in far enough to frame.
 */
export function visDist(au: number): number {
  return VIS_BASE * Math.pow(au, VIS_EXP)
}

/** Logarithmic body-size map, so the Sun and Mercury are both visible. */
export function sizeMap(km: number): number {
  const t = (Math.log(km) - Math.log(MIN_KM)) / (Math.log(SUN_KM) - Math.log(MIN_KM))
  return SIZE_MIN + Math.min(1, Math.max(0, t)) * (SIZE_MAX - SIZE_MIN)
}

/**
 * How much bigger or smaller to draw a star than the Sun.
 *
 * Stars are sized against each other, never against their orbits: relative to
 * the distances here a star is already drawn enormously larger than life, so a
 * true sevenfold spread would leave a blue-white star sitting on top of its own
 * inner planets. A cube root keeps the ordering plain — roughly two to one end
 * to end — while leaving the innermost orbit clear. The clamps only bite past
 * the star kinds on offer, at the extremes of the mass slider. One solar mass
 * returns exactly 1, so the Solar System is left exactly as it was.
 */
export function starSize(mass: number): number {
  return Math.min(1.3, Math.max(0.62, Math.cbrt(starRadius(mass))))
}

/** "Same size" spacing — the cosier compressed model, every planet drawn alike. */
export function sameDist(au: number): number {
  return 1.9 + (2.9 * Math.log(1 + au * 3)) / Math.LN10
}

/* --- Compact systems ----------------------------------------------------- */

/** Where a compact system's outermost orbit is stretched out to, in AU. */
const COMPACT_TARGET_A = 5.2
/** The fastest a drawn orbit is allowed to be, in drawn years. */
const P_DRAW_MIN = 0.2

/**
 * Distance multiplier for a whole system. The drawn-distance maps were tuned
 * for Mercury-to-Neptune; a system that fits inside 1 AU — TRAPPIST-1 spans
 * 0.011 to 0.062 — lands in a sliver where seven orbits sit closer together
 * than one planet's drawn radius. One shared multiplier stretches the whole
 * system out to Jupiter's distance, which preserves ordering and relative
 * character through the log maps while letting it fill the frame the way the
 * Solar System does. Anything reaching past 1 AU is left exactly alone.
 */
export function systemStretch(aMax: number): number {
  return aMax > 0 && aMax < 1 ? COMPACT_TARGET_A / aMax : 1
}

/**
 * Clock multiplier for a whole system. A drawn year is 14 s, which reads well
 * from Mercury outward — but TRAPPIST-1 b's measured year is 1.5 days, an
 * invisible 60 ms blur per orbit. One shared multiplier slows the whole
 * system until its fastest orbit takes at least P_DRAW_MIN drawn years, so
 * every relative pace stays exact: h still orbits 12.4× slower than b.
 * Mercury's 0.24-year orbit already clears the floor, so the Solar System
 * keeps its exact historical pacing.
 */
export function tempoFor(pMin: number): number {
  return pMin > 0 && pMin < P_DRAW_MIN ? P_DRAW_MIN / pMin : 1
}

export { SIZE_MAX, SIZE_MIN }

/** Kilometres in an astronomical unit, for satellite distances. */
const AU_KM = 149597870.7
/** Kilometres in an Earth radius. */
const EARTH_KM = 6371

/** A satellite's true distance from its planet, in that planet's radii. */
export function satRadii(aAu: number, parentEarthRadii: number): number {
  return (aAu * AU_KM) / Math.max(1e-9, parentEarthRadii * EARTH_KM)
}

/** Nearest and furthest a satellite may be drawn, as multiples of its planet. */
const SAT_MIN_MULT = 1.3
const SAT_MAX_MULT = 4

/**
 * Where a satellite's orbit is drawn, as a multiple of its planet's drawn
 * radius.
 *
 * True distance is unusable here — the Moon at scale sits a third of a pixel
 * from Earth — so satellites are mapped into a band that starts clear of the
 * planet's own disc and stops before it reaches the neighbouring orbit.
 * `room` is how much space there actually is: half the distance to the
 * nearest other orbit, less the planet's drawn radius. In "to scale" mode
 * that is generous. In "same size" mode it is negative — every planet is
 * drawn 0.24 wide with 0.29 between orbits, so adjacent planets already
 * overlap at conjunction — and the band collapses to its floor, which keeps
 * the moon outside its planet and close to it.
 *
 * `t` is the satellite's rank within its own system of moons, 0 for the
 * innermost, so ordering and relative spacing survive.
 */
export function satMult(t: number, parentRadius: number, room: number): number {
  const head = room > 0 ? 1 + room / Math.max(1e-6, parentRadius) : SAT_MIN_MULT + 0.25
  const top = Math.min(SAT_MAX_MULT, Math.max(SAT_MIN_MULT + 0.25, head))
  return SAT_MIN_MULT + Math.min(1, Math.max(0, t)) * (top - SAT_MIN_MULT)
}

/** Rank a satellite by true distance, log-spaced so inner moons stay apart. */
export function satRank(radii: number, lo: number, hi: number): number {
  if (!(hi > lo)) return 1
  const l = Math.log(Math.max(1.01, radii))
  return (l - Math.log(Math.max(1.01, lo))) / (Math.log(Math.max(1.02, hi)) - Math.log(Math.max(1.01, lo)))
}
