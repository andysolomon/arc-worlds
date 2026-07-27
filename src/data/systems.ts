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
import { DEFAULT_PARAMS } from '../lib/params'
import { PRESETS, SOLAR } from './presets'

export const MILKY_WAY_ID = 'milky-way'
export const ANDROMEDA_ID = 'andromeda'

/** Our own, from measured data. */
export const MILKY_WAY: SystemDef = {
  id: MILKY_WAY_ID,
  name: 'The Solar System',
  sub: 'ours · every number measured',
  origin: 'measured',
  star: { name: 'The Sun', color: 0xffffff, mass: 1 },
  bodies: ORBITS.map((o, i) => {
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
      params: { ...DEFAULT_PARAMS, ...s.params, preset: s.key } as PlanetParams,
    } satisfies SystemBody
  }),
}

/** A sculpted world, at the defaults for its type. */
function world(preset: PresetKey, seed: number, over: Partial<PlanetParams> = {}): PlanetParams {
  const def = PRESETS.find((p) => p.key === preset)?.def ?? {}
  return { ...DEFAULT_PARAMS, ...def, preset, seed, ...over }
}

const HALCYON_MASS = 0.78

/** An orange dwarf and five invented worlds. Every number here is made up. */
export const ANDROMEDA: SystemDef = {
  id: ANDROMEDA_ID,
  name: 'Andromeda',
  sub: 'imagined · not a measured system',
  origin: 'imagined',
  star: { name: 'Halcyon', color: 0xffb478, mass: HALCYON_MASS },
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
): SystemBody {
  return {
    name,
    a,
    period: periodFor(a, HALCYON_MASS),
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

export const BUILT_IN_SYSTEMS: SystemDef[] = [MILKY_WAY, ANDROMEDA]

export function builtInSystem(id: string): SystemDef | null {
  return BUILT_IN_SYSTEMS.find((s) => s.id === id) ?? null
}
