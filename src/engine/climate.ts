/**
 * Deterministic first-order orbital climate.
 *
 * This is deliberately an energy-balance model, not a general circulation
 * model. It connects the quantities the app actually owns — stellar
 * luminosity, orbit, eccentricity, planet class, water inventory, radius and
 * tilt — and labels every result as modeled. Geography stays seed-stable.
 */
import { isGas, PALETTES } from './palettes.js'
import type {
  OrbitalClimate, PlanetParams, PresetKey, Star, SystemBody, SystemDef,
} from './types.js'

const CLIMATE_SCHEMA = 'arc-worlds-orbital-climate-1' as const
const EARTH_RADIUS_AU = 6371 / 149_597_870.7

interface SurfaceProfile {
  albedo: number
  greenhouseK: number
  atmosphere: number
  biosphere: number
  polarFrostK: number
}

const DEFAULT_PROFILE: SurfaceProfile = {
  albedo: 0.3, greenhouseK: 24, atmosphere: 0.8, biosphere: 0.5, polarFrostK: 258,
}

const PROFILES: Partial<Record<PresetKey, SurfaceProfile>> = {
  temperate: { albedo: 0.306, greenhouseK: 33, atmosphere: 1, biosphere: 1, polarFrostK: 258 },
  desert: { albedo: 0.25, greenhouseK: 8, atmosphere: 0.2, biosphere: 0.04, polarFrostK: 250 },
  ice: { albedo: 0.58, greenhouseK: 7, atmosphere: 0.2, biosphere: 0, polarFrostK: 258 },
  lava: { albedo: 0.12, greenhouseK: 90, atmosphere: 0.9, biosphere: 0, polarFrostK: 250 },
  candy: { albedo: 0.34, greenhouseK: 28, atmosphere: 0.8, biosphere: 0.35, polarFrostK: 258 },
  mercury: { albedo: 0.119, greenhouseK: 0, atmosphere: 0, biosphere: 0, polarFrostK: 110 },
  venus: { albedo: 0.75, greenhouseK: 505, atmosphere: 1, biosphere: 0, polarFrostK: 250 },
  mars: { albedo: 0.25, greenhouseK: 5, atmosphere: 0.03, biosphere: 0, polarFrostK: 185 },
  pluto: { albedo: 0.5, greenhouseK: 1, atmosphere: 0.01, biosphere: 0, polarFrostK: 55 },
  archean: { albedo: 0.27, greenhouseK: 42, atmosphere: 1, biosphere: 0.2, polarFrostK: 258 },
  proterozoic: { albedo: 0.3, greenhouseK: 36, atmosphere: 1, biosphere: 0.65, polarFrostK: 258 },
  noachian: { albedo: 0.25, greenhouseK: 24, atmosphere: 0.65, biosphere: 0.03, polarFrostK: 245 },
  erid: { albedo: 0.42, greenhouseK: 120, atmosphere: 1, biosphere: 0, polarFrostK: 250 },
  adrian: { albedo: 0.3, greenhouseK: 65, atmosphere: 1, biosphere: 0.1, polarFrostK: 250 },
  pandora: { albedo: 0.3, greenhouseK: 34, atmosphere: 1, biosphere: 1, polarFrostK: 258 },
  luna: { albedo: 0.12, greenhouseK: 0, atmosphere: 0, biosphere: 0, polarFrostK: 110 },
  io: { albedo: 0.63, greenhouseK: 0, atmosphere: 0.01, biosphere: 0, polarFrostK: 90 },
  europa: { albedo: 0.67, greenhouseK: 0, atmosphere: 0.01, biosphere: 0, polarFrostK: 100 },
  ganymede: { albedo: 0.43, greenhouseK: 0, atmosphere: 0.01, biosphere: 0, polarFrostK: 100 },
  titan: { albedo: 0.27, greenhouseK: 12, atmosphere: 1, biosphere: 0, polarFrostK: 85 },
  enceladus: { albedo: 0.81, greenhouseK: 0, atmosphere: 0.01, biosphere: 0, polarFrostK: 90 },
  triton: { albedo: 0.76, greenhouseK: 1, atmosphere: 0.01, biosphere: 0, polarFrostK: 45 },
}

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v))
const smoothstep = (lo: number, hi: number, v: number) => {
  const t = clamp((v - lo) / Math.max(1e-9, hi - lo))
  return t * t * (3 - 2 * t)
}

/** Main-sequence fallback; measured/invented systems may provide luminosity. */
export function stellarLuminosity(star: Pick<Star, 'mass' | 'luminosity'>): number {
  if (typeof star.luminosity === 'number' && Number.isFinite(star.luminosity)) {
    return clamp(star.luminosity, 0.00001, 100)
  }
  const mass = clamp(star.mass, 0.08, 3)
  if (mass < 0.43) return 0.23 * Math.pow(mass, 2.3)
  if (mass < 2) return Math.pow(mass, 4)
  return 1.5 * Math.pow(mass, 3.5)
}

/** Conservative solar-flux edges; spectral refinements can replace this API. */
export function habitableZoneFor(star: Pick<Star, 'mass' | 'luminosity'>) {
  const luminosity = stellarLuminosity(star)
  return {
    innerAU: Math.sqrt(luminosity / 1.06),
    outerAU: Math.sqrt(luminosity / 0.36),
  }
}

function equilibriumTemperature(flux: number, albedo: number): number {
  // 278.5 K is a zero-albedo, fully redistributed Earth-flux blackbody.
  return 278.5 * Math.pow(Math.max(1e-9, flux) * (1 - clamp(albedo, 0, 0.95)), 0.25)
}

function stellarOrbit(system: SystemDef, body: SystemBody): SystemBody {
  if (!body.orbits) return body
  return system.bodies.find((candidate) => candidate.name === body.orbits) ?? body
}

function tidalHeatingK(system: SystemDef, body: SystemBody): number {
  if (!body.orbits) return 0
  const parent = system.bodies.find((candidate) => candidate.name === body.orbits)
  if (!parent) return 0
  const distanceInParentRadii = body.a / Math.max(EARTH_RADIUS_AU, parent.radius * EARTH_RADIUS_AU)
  const forcing = (Math.abs(body.e) / 0.004) * Math.pow(6 / Math.max(2.5, distanceInParentRadii), 6)
    * Math.pow(Math.max(0.2, parent.radius / 11.2), 1.5)
  return 14 * clamp(forcing)
}

function climateRegime(temperatureK: number, gas: boolean): OrbitalClimate['regime'] {
  if (gas) return 'gas'
  if (temperatureK >= 370) return 'scorching'
  if (temperatureK >= 315) return 'hot'
  if (temperatureK >= 270) return 'temperate'
  if (temperatureK >= 225) return 'cold'
  return 'frozen'
}

export function climateForBody(system: SystemDef, body: SystemBody): OrbitalClimate {
  const orbit = stellarOrbit(system, body)
  const profile = PROFILES[body.params.preset] ?? DEFAULT_PROFILE
  const gas = isGas(PALETTES[body.params.preset] ?? PALETTES.temperate)
  const luminosity = stellarLuminosity(system.star)
  const eccentricity = clamp(Math.abs(orbit.e), 0, 0.95)
  const meanDistance = Math.max(0.001, orbit.a)
  const stellarFlux = luminosity / (meanDistance * meanDistance * Math.sqrt(1 - eccentricity * eccentricity))
  const albedo = clamp(profile.albedo + (body.params.clouds - 0.5) * 0.06 + body.params.ice * 0.04, 0.03, 0.9)
  const greenhouseK = profile.greenhouseK
  const tidal = gas ? 0 : tidalHeatingK(system, body)
  const equilibrium = equilibriumTemperature(stellarFlux, albedo)
  const meanSurface = equilibrium + greenhouseK + tidal
  const perihelionFlux = luminosity / Math.pow(meanDistance * (1 - eccentricity), 2)
  const aphelionFlux = luminosity / Math.pow(meanDistance * (1 + eccentricity), 2)
  const perihelionTemperature = equilibriumTemperature(perihelionFlux, albedo) + greenhouseK + tidal
  const aphelionTemperature = equilibriumTemperature(aphelionFlux, albedo) + greenhouseK + tidal

  const equatorTemperature = meanSurface + 12
  const poleGradient = 42 + Math.abs(Math.sin((body.tilt * Math.PI) / 180)) * 8
  const frostRatio = (equatorTemperature - profile.polarFrostK) / poleGradient
  const iceLineLatitudeDeg = frostRatio <= 0
    ? 0
    : frostRatio >= 1
      ? 90
      : Math.asin(Math.pow(frostRatio, 1 / 1.35)) * 180 / Math.PI
  const capArea = 1 - Math.sin((iceLineLatitudeDeg * Math.PI) / 180)
  const hotLoss = smoothstep(320, 390, meanSurface)
  const surfaceIce = gas
    ? 0
    : iceLineLatitudeDeg === 0
      ? 1
      : clamp(capArea * (0.35 + body.params.water * 0.65) * (1 - hotLoss))

  const melt = smoothstep(258, 278, meanSurface)
  const boil = smoothstep(330, 380, meanSurface)
  const liquidWater = gas ? 0 : clamp(melt * (1 - boil) * profile.atmosphere)
  const thermalLife = smoothstep(268, 285, meanSurface) * (1 - smoothstep(310, 340, meanSurface))
  const radiationLife = smoothstep(0.12, 0.35, stellarFlux) * (1 - smoothstep(1.3, 2.2, stellarFlux))
  const vegetationPotential = gas
    ? 0
    : clamp(profile.biosphere * liquidWater * thermalLife * radiationLife)
  const hz = habitableZoneFor(system.star)

  return {
    schema: CLIMATE_SCHEMA,
    source: 'modeled',
    stellarFlux,
    equilibriumTemperatureK: equilibrium,
    meanSurfaceTemperatureK: meanSurface,
    perihelionTemperatureK: perihelionTemperature,
    aphelionTemperatureK: aphelionTemperature,
    liquidWater,
    surfaceIce,
    vegetationPotential,
    iceLineLatitudeDeg,
    tidalHeatingK: tidal,
    habitableZoneInnerAU: hz.innerAU,
    habitableZoneOuterAU: hz.outerAU,
    inHabitableZone: meanDistance >= hz.innerAU && meanDistance <= hz.outerAU,
    regime: climateRegime(meanSurface, gas),
  }
}

/** Earth-like context for a standalone sculpted world with no orbit yet. */
export function standaloneClimate(params: PlanetParams): OrbitalClimate {
  const body: SystemBody = {
    name: 'Standalone world', a: 1, period: 1, e: 0.0167, inc: 0, node: 0, peri: 0,
    radius: 1, tilt: 23.44, flattening: 0.00335, day: 23.934, params,
  }
  return climateForBody({
    id: 'standalone', name: 'Standalone', sub: '', origin: 'custom',
    star: { name: 'Sun-like star', color: 0xffffff, mass: 1, luminosity: 1 }, bodies: [body],
  }, body)
}

export function withSystemClimates(system: SystemDef): SystemDef {
  return {
    ...system,
    bodies: system.bodies.map((body) => ({
      ...body,
      // A copied measured system is now a physical experiment. Photographs
      // cannot freeze or dry when their orbit changes, so editable copies use
      // the current procedural mechanism while the measured original retains
      // its observed imagery.
      ...(system.origin === 'custom' ? { texture: null } : null),
      params: {
        ...body.params,
        ...(system.origin === 'custom' ? { texture: null, cloudTexture: null } : null),
        climate: climateForBody(system, body),
      },
    })),
  }
}

export function formatClimate(climate: OrbitalClimate): string {
  const temperature = `${Math.round(climate.meanSurfaceTemperatureK)} K`
  if (climate.regime === 'gas') return `${temperature} · no solid surface`
  if (climate.surfaceIce > 0.85) return `${temperature} · globally frozen`
  if (climate.liquidWater > 0.5 && climate.vegetationPotential > 0.35) {
    return `${temperature} · surface water · biosphere-friendly`
  }
  if (climate.liquidWater > 0.25) return `${temperature} · some surface liquid possible`
  return `${temperature} · ${climate.regime}`
}
