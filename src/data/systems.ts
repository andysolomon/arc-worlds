/**
 * The built-in systems.
 *
 * The Solar System is assembled from the measured tables in
 * `engine/planets.ts` rather than restated here, so there is still exactly one
 * place where a real orbital element lives. Everything else in this file is
 * invented, and says so.
 */
import { ORBITS, REAL, realKeyFor } from '../engine/planets'
import { periodFor } from '../engine/scale'
import type { PlanetParams, PresetKey, SystemBody, SystemDef } from '../engine/types'
import { CURRENT_PARAMS } from '../lib/params'
import { FICTION, MOONS, PRESETS, SOLAR } from './presets'

export const MILKY_WAY_ID = 'milky-way'
export const ANDROMEDA_ID = 'andromeda'

/** Our own, from measured data. */
/** Kilometres per AU and per Earth radius, for converting moon distances. */
const AU_KM = 149597870.7
const EARTH_KM = 6371
const DAYS_PER_YEAR = 365.25

/**
 * The moons that are worlds, as bodies orbiting their planets.
 *
 * Everything here is measured and already on file: `engine/planets.ts` holds
 * each moon's radius and distance in planet radii and its period in days, so
 * this only converts those into the units a `SystemBody` speaks — AU, years,
 * Earth radii — and names the planet it belongs to. Tidally locked, so the
 * sidereal day is the orbital period, sign and all.
 */
function satellitesOf(planet: string, planetRadius: number, key: string): SystemBody[] {
  const R = REAL[key]
  if (!R) return []
  return R.moons.flatMap((m) => {
    if (!m.world) return []
    const w = MOONS.find((x) => x.key === m.world!.preset)
    if (!w) return []
    const own = REAL[m.world.preset]
    return [{
      name: m.n,
      a: (m.a * planetRadius * EARTH_KM) / AU_KM,
      period: Math.abs(m.P) / DAYS_PER_YEAR,
      e: m.e ?? 0,
      inc: m.inc,
      node: 0,
      peri: 0,
      radius: m.r * planetRadius,
      tilt: own?.ob ?? 0,
      flattening: own?.f ?? 0,
      day: m.P * 24,
      params: { ...CURRENT_PARAMS, ...w.params, preset: w.key } as PlanetParams,
      texture: null,
      ring: null,
      orbits: planet,
    } satisfies SystemBody]
  })
}

export const MILKY_WAY: SystemDef = {
  id: MILKY_WAY_ID,
  name: 'The Solar System',
  sub: 'ours · every number measured',
  origin: 'measured',
  star: { name: 'The Sun', color: 0xffffff, mass: 1, luminosity: 1 },
  bodies: ORBITS.map((o, i): SystemBody => {
    const R = REAL[realKeyFor(o[0])]
    const s = SOLAR[i]
    return {
      name: s.name,
      a: o[1],
      period: o[2],
      e: o[3],
      inc: o[4],
      node: o[5],
      peri: o[6],
      radius: o[7],
      tilt: R.ob,
      flattening: R.f,
      day: R.day,
      texture: s.params.texture ?? null,
      ring: R.ring ?? null,
      params: { ...CURRENT_PARAMS, ...s.params, preset: s.key } as PlanetParams,
    } satisfies SystemBody
  }).concat(
    ORBITS.flatMap((o, i) => satellitesOf(SOLAR[i].name, o[7], realKeyFor(o[0]))),
  ),
}

/** A sculpted world, at the defaults for its type. */
function world(preset: PresetKey, seed: number, over: Partial<PlanetParams> = {}): PlanetParams {
  const def = PRESETS.find((p) => p.key === preset)?.def ?? {}
  return { ...CURRENT_PARAMS, ...def, preset, seed, ...over }
}

const HALCYON_MASS = 0.78

/** An orange dwarf and five invented worlds. Every number here is made up. */
export const ANDROMEDA: SystemDef = {
  id: ANDROMEDA_ID,
  name: 'Andromeda',
  sub: 'imagined · not a measured system',
  origin: 'imagined',
  star: { name: 'Halcyon', color: 0xffb478, mass: HALCYON_MASS, luminosity: 0.37 },
  bodies: [
    body('Cinderpip', 0.19, 0.62, world('lava', 8801, { glow: 0.85, clouds: 0.1 }), {
      e: 0.09, inc: 3.4, node: 22, peri: 118, tilt: 1.2, day: 620,
    }),
    body('Bluwick', 0.71, 1.04, world('temperate', 4177, { water: 0.62, clouds: 0.58 }), {
      e: 0.013, inc: 0.6, node: 74, peri: 254, tilt: 19.8, day: 21.4,
    }),
    body('Mirafern', 1.34, 0.83, world('desert', 6210, { mountains: 0.62, ice: 0.06 }), {
      e: 0.061, inc: 2.1, node: 138, peri: 47, tilt: 27.6, day: 30.2,
    }),
    body('Zolapuff', 4.2, 9.1, world('gasAmber', 3390, { rings: true, ringN: 3, ringWidth: 0.6 }), {
      e: 0.034, inc: 1.1, node: 201, peri: 311, tilt: 5.4, flattening: 0.071, day: 10.8,
    }),
    body('Perinook', 9.6, 2.4, world('ice', 9042, { ice: 0.92, clouds: 0.45 }), {
      e: 0.048, inc: 1.9, node: 296, peri: 172, tilt: 41.3, flattening: 0.021, day: -19.6,
    }),
  ],
}

function body(
  name: string,
  a: number,
  radius: number,
  params: PlanetParams,
  over: Partial<Omit<SystemBody, 'name' | 'a' | 'radius' | 'params'>> = {},
  mass: number = HALCYON_MASS,
): SystemBody {
  return {
    name,
    a,
    period: periodFor(a, mass),
    e: 0,
    inc: 0,
    node: 0,
    peri: 0,
    radius,
    tilt: 0,
    flattening: 0.003,
    day: 24,
    params,
    texture: null,
    ring: null,
    ...over,
  }
}

/**
 * A body with measured orbital elements and an imagined world wearing them.
 * `observed` systems keep their honesty in the split: distance, period,
 * eccentricity and radius are real; the params are pure invention, exactly
 * like a sculpted world, and derive their scans rather than claiming any.
 * Tidally locked worlds carry their orbital period as their day.
 */
function observed(
  name: string, a: number, period: number, e: number, radius: number,
  day: number, params: PlanetParams,
): SystemBody {
  return {
    name, a, period, e, inc: 0, node: 0, peri: 0, radius,
    tilt: 0, flattening: 0.003, day, params, texture: null, ring: null,
  }
}

/** Seven measured orbits around an ultracool dwarf, 40 light years out. */
export const TRAPPIST: SystemDef = {
  id: 'trappist-1',
  name: 'TRAPPIST-1',
  sub: 'observed · seven measured orbits, every surface imagined',
  origin: 'observed',
  star: { name: 'TRAPPIST-1', color: 0xff8659, mass: 0.0898, luminosity: 0.000553 },
  bodies: [
    observed('TRAPPIST-1 b', 0.01154, 0.004136, 0.00622, 1.116, 36.26, world('lava', 701, { glow: 0.4, clouds: 0.05, ice: 0 })),
    observed('TRAPPIST-1 c', 0.0158, 0.00663, 0.00654, 1.097, 58.12, world('desert', 702, { water: 0.02, clouds: 0.1 })),
    observed('TRAPPIST-1 d', 0.02227, 0.011087, 0.00837, 0.788, 97.19, world('desert', 703, { water: 0.2, ice: 0.08, clouds: 0.25 })),
    observed('TRAPPIST-1 e', 0.02925, 0.0167, 0.0051, 0.92, 146.39, world('temperate', 704, { water: 0.6, ice: 0.3, clouds: 0.45 })),
    observed('TRAPPIST-1 f', 0.03849, 0.025207, 0.01007, 1.045, 220.96, world('ice', 705, { water: 0.55, ice: 0.75 })),
    observed('TRAPPIST-1 g', 0.04683, 0.033822, 0.00208, 1.129, 296.49, world('ice', 706, { ice: 0.85 })),
    observed('TRAPPIST-1 h', 0.06189, 0.051382, 0.00567, 0.755, 450.41, world('ice', 707, { ice: 0.95, clouds: 0.1 })),
  ],
}

/** The nearest exoplanet there is. */
export const PROXIMA: SystemDef = {
  id: 'proxima-centauri',
  name: 'Proxima Centauri',
  sub: 'observed · the nearest exoplanet, surface imagined',
  origin: 'observed',
  star: { name: 'Proxima Centauri', color: 0xff9d6f, mass: 0.1221, luminosity: 0.0017 },
  bodies: [
    observed('Proxima Centauri b', 0.04857, 0.030628, 0.02, 1.1, 268.5, world('ice', 711, { water: 0.5, ice: 0.6, clouds: 0.3 })),
  ],
}

/** The first planet found around another Sun-like star, in 1995. */
export const PEGASI_51: SystemDef = {
  id: '51-pegasi',
  name: '51 Pegasi',
  sub: 'observed · the first exoplanet around a Sun-like star',
  origin: 'observed',
  star: { name: '51 Pegasi', color: 0xfff4e4, mass: 1.06, luminosity: 1.36 },
  bodies: [
    observed('51 Pegasi b', 0.0527, 0.011583, 0.008, 13.4, 101.5, world('gasAmber', 712, { rings: false, glow: 0.55 })),
  ],
}

/** An Earth-sized year around a Sun-like star. */
export const KEPLER_452: SystemDef = {
  id: 'kepler-452',
  name: 'Kepler-452',
  sub: 'observed · an Earth-length year around a Sun-like star',
  origin: 'observed',
  star: { name: 'Kepler-452', color: 0xfff8ec, mass: 1.037, luminosity: 1.2 },
  bodies: [
    observed('Kepler-452 b', 1.046, 1.0537, 0.01, 1.63, 24, world('temperate', 713, { water: 0.6, clouds: 0.5, ice: 0.2 })),
  ],
}

/** A homage world, loaded whole from its FICTION entry at its canonical seed. */
function storyWorld(key: PresetKey): PlanetParams {
  const f = FICTION.find((x) => x.key === key)
  return { ...CURRENT_PARAMS, ...(f?.params ?? {}), preset: key } as PlanetParams
}

/**
 * Project Hail Mary puts its planets at real stars, so these two systems wear
 * real star masses — 40 Eridani A and Tau Ceti — under invented worlds and
 * invented orbits. Origin stays `imagined`: a story is not a measurement.
 */
export const ERIDANI_40: SystemDef = {
  id: '40-eridani',
  name: '40 Eridani',
  sub: 'imagined · a real star wearing a story — Project Hail Mary',
  origin: 'imagined',
  star: { name: '40 Eridani A', color: 0xffc98a, mass: 0.78, luminosity: 0.46 },
  bodies: [
    body('Erid', 0.218, 1.9, storyWorld('erid'), { e: 0.01, inc: 0.4, node: 68, peri: 300, tilt: 2.8, day: 122, flattening: 0.006 }, 0.78),
  ],
}

export const TAU_CETI: SystemDef = {
  id: 'tau-ceti',
  name: 'Tau Ceti',
  sub: 'imagined · the Astrophage nursery from Project Hail Mary',
  origin: 'imagined',
  star: { name: 'Tau Ceti', color: 0xfff0d8, mass: 0.783, luminosity: 0.52 },
  bodies: [
    body('Adrian', 0.25, 1.15, storyWorld('adrian'), { e: 0.02, inc: 1.1, node: 190, peri: 88, tilt: 3.4, day: 700 }, 0.783),
  ],
}

const ALPHA_CEN_MASS = 1.08

/**
 * Avatar's Pandora is a moon of the gas giant Polyphemus, and now orbits it —
 * a satellite that is nonetheless a whole world, visitable and scannable like
 * any other. Its 2.7-day year around a Jupiter-sized planet is the fiction's.
 */
export const ALPHA_CENTAURI: SystemDef = {
  id: 'alpha-centauri-a',
  name: 'Alpha Centauri A',
  sub: 'imagined · Pandora and the giant it orbits',
  origin: 'imagined',
  star: { name: 'Alpha Centauri A', color: 0xfff6e0, mass: ALPHA_CEN_MASS, luminosity: 1.52 },
  bodies: [
    body('Polyphemus', 1.25, 11.5, world('gasMist', 2154, { rings: false, glow: 0.5, roughness: 0.6 }), { e: 0.02, inc: 0.8, node: 150, peri: 30, tilt: 7.6, flattening: 0.06, day: 16 }, ALPHA_CEN_MASS),
    // Pandora orbits Polyphemus, as the fiction has it. The distance and the
    // year are its own, measured from the planet rather than from the star.
    body('Pandora', 0.00169, 0.72, storyWorld('pandora'), {
      e: 0.015, inc: 1.2, node: 152, peri: 40, tilt: 18.5, day: 26,
      period: 0.0074, orbits: 'Polyphemus',
    }, ALPHA_CEN_MASS),
  ],
}

export const BUILT_IN_SYSTEMS: SystemDef[] = [
  MILKY_WAY, TRAPPIST, PROXIMA, PEGASI_51, KEPLER_452,
  ERIDANI_40, TAU_CETI, ALPHA_CENTAURI, ANDROMEDA,
]

export function builtInSystem(id: string): SystemDef | null {
  return BUILT_IN_SYSTEMS.find((s) => s.id === id) ?? null
}
