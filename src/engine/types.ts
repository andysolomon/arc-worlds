/**
 * A terrain algorithm is part of geography, not presentation.  Persist it so
 * a shared seed keeps meaning the same thing after a newer generator ships.
 */
export const LEGACY_GENERATOR_VERSION = 1 as const
export const CURRENT_GENERATOR_VERSION = 2 as const
export type GeneratorVersion = typeof LEGACY_GENERATOR_VERSION | typeof CURRENT_GENERATOR_VERSION

/** The complete description of a world. Everything else is derived from this. */
export interface PlanetParams {
  /** Which deterministic terrain generator interprets this world's seed. */
  generatorVersion: GeneratorVersion
  seed: number
  preset: PresetKey
  mountains: number
  water: number
  roughness: number
  clouds: number
  glow: number
  ice: number
  /** Sun azimuth around the world, 0..1 of a full turn. */
  lightAz: number
  /** Sun elevation above the equator, 0..1 with 0.5 level. */
  lightEl: number
  spinDir: 1 | -1
  spinSpeed: number
  rings: boolean
  ringN: number
  ringInner: number
  ringTilt: number
  ringWidth: number
  ringGap: number
  ringOpacity: number
  ringColor: number | null
  moons: number
  atmoColor: number | null
  /** Set only when showing a real planet's photographic map. */
  texture?: string | null
  cloudTexture?: string | null
  /** Render controls, not part of a world's identity. */
  mode?: 'single' | 'system'
  sizeMode?: 'same' | 'scale'
  detail?: 'standard' | 'high'
  stars?: boolean
  autoRotate?: boolean
  timeScale?: number
  /** Stop the clock while the pointer rests on a planet or a moon. */
  pauseOnHover?: boolean
  /** Orbit paths for planets and moons. Hidden paths still show on hover. */
  showPaths?: boolean
  /** Planet names in the orbit view. */
  showLabels?: boolean
  /** Off skips building moons entirely, which is a performance lever. */
  showMoons?: boolean
  /**
   * Draw the real sky in the single-world view: the star this world orbits and
   * the other planets of its system, in the directions and at the angular sizes
   * they truly have from here. Only means anything for a world that is a body
   * of the loaded system — a sculpted world is nowhere in particular.
   */
  sky?: boolean
  /** Universe appearance, 0..1 each with 0.5 the look the app always drew. */
  starDensity?: number
  starBright?: number
  exposure?: number
  /**
   * Derived from the world-system relationship at render/scan time. Never
   * persisted as part of the seed: moving the same world changes its climate
   * without changing its canonical geography.
   */
  climate?: OrbitalClimate
}

export type ClimateRegime = 'scorching' | 'hot' | 'temperate' | 'cold' | 'frozen' | 'gas'

/** A deterministic energy-balance estimate, not an observed weather record. */
export interface OrbitalClimate {
  readonly schema: 'arc-worlds-orbital-climate-1'
  readonly source: 'modeled'
  /** Orbit-averaged incident energy, in present-day Earth solar constants. */
  readonly stellarFlux: number
  readonly equilibriumTemperatureK: number
  readonly meanSurfaceTemperatureK: number
  readonly perihelionTemperatureK: number
  readonly aphelionTemperatureK: number
  /** Fraction of the world's water inventory able to remain surface liquid. */
  readonly liquidWater: number
  /** Approximate fraction of the whole surface covered by persistent frost. */
  readonly surfaceIce: number
  /** Climate support for Earth-like photosynthetic land life, not a detection. */
  readonly vegetationPotential: number
  /** Latitude at which persistent polar frost begins; 0 is global, 90 none. */
  readonly iceLineLatitudeDeg: number
  readonly tidalHeatingK: number
  readonly habitableZoneInnerAU: number
  readonly habitableZoneOuterAU: number
  readonly inHabitableZone: boolean
  readonly regime: ClimateRegime
}

export type PresetKey =
  | 'temperate'
  | 'desert'
  | 'ice'
  | 'lava'
  | 'candy'
  | 'gasAmber'
  | 'gasMist'
  | 'gasStorm'
  | 'mercury'
  | 'venus'
  | 'mars'
  | 'jupiter'
  | 'saturn'
  | 'uranus'
  | 'neptune'
  | 'pluto'
  | 'archean'
  | 'proterozoic'
  | 'noachian'
  | 'erid'
  | 'adrian'
  | 'pandora'
  | 'luna'
  | 'io'
  | 'europa'
  | 'ganymede'
  | 'titan'
  | 'enceladus'
  | 'triton'

export interface RockyPalette {
  gas?: false
  water: number
  deep: number
  sand: number
  low: number
  mid: number
  high: number
  snow: number
  atmo: number
  waterOpacity: number
  cloudO: number
  emissive?: number
  cloudTint?: number
}

export interface GasPalette {
  gas: true
  bands: Array<[number, number]>
  atmo: number
  cloudO: number
}

export type Palette = RockyPalette | GasPalette

export interface Moon {
  /** Name. */
  n: string
  /** Radius in equatorial planet radii. */
  r: number
  /** Semi-major axis in equatorial planet radii. */
  a: number
  /** Orbital period in days; negative is retrograde. */
  P: number
  /** Inclination from the planet's equator, degrees. */
  inc: number
  /** Base colour. */
  c: number
  e?: number
  /** Non-spherical axis scaling for irregular bodies. */
  irr?: [number, number, number]
  /** Two-tone surface, as for Iapetus. */
  tone?: [number, number]
  /**
   * Where the dark half of a two-tone surface sits, in radians, measured from
   * the face that points away from the planet.
   *
   * A tidally locked moon has four distinguishable faces, and real ones are not
   * marked alike: our Moon's maria are on the near side, Iapetus's Cassini
   * Regio on the leading one. Without this they would all be painted in the
   * same place — the sort of detail nobody notices until it is wrong.
   * `Math.PI` faces the planet; `-Math.PI / 2` leads the orbit.
   */
  mark?: number
  /** Explicit render radius/distance, used by procedural moons. */
  rd?: number
  dd?: number
  /**
   * The world standing at this orbit, for moons that are worlds rather than
   * scenery. Only the identity lives here — preset and canonical seed — so
   * this table stays data with no dependency on params or presets. The
   * measured elements above remain the single source of where the moon is.
   */
  world?: { preset: PresetKey; seed: number }
}

export interface RingConfig {
  /** Inner radius in equatorial planet radii. */
  inner: number
  outer: number
  color: number
  opacity: number
  /** Selects a per-planet radial profile in the ring shader. */
  profile?: number
  map?: string
  bands?: Array<[number, number, number, number]>
}

export interface RealBody {
  /** Oblateness (flattening). */
  f: number
  /** Axial tilt, degrees. */
  ob: number
  /** Sidereal rotation period in hours; negative is retrograde. */
  day: number
  ring?: RingConfig
  moons: Moon[]
  /**
   * Canonical seed, for measured bodies that have no photographic map. A
   * textured body claims its measured identity through the texture; a
   * texture-less one (Pluto) claims it by carrying this exact seed, and
   * changing the seed detaches it — the same rule the sculptor applies.
   */
  seed?: number
}

/** name, a (AU), period (yr), eccentricity, inclination, node, perihelion, radius (Earth radii). */
export type OrbitRow = [string, number, number, number, number, number, number, number]

/**
 * One body in orbit: the world it is, and the path it takes.
 *
 * A world on its own has no position — `PlanetParams` describes a planet, not
 * a place. Everything that only means something relative to a star lives here
 * instead, which is why a world can be dropped into any system unchanged.
 */
export interface SystemBody {
  name: string
  /** Semi-major axis, AU. */
  a: number
  /** Orbital period in Earth years. */
  period: number
  /** Orbital eccentricity, 0 is circular. */
  e: number
  /** Inclination to the system's reference plane, degrees. */
  inc: number
  /** Longitude of ascending node, degrees. */
  node: number
  /** Longitude of perihelion, degrees. */
  peri: number
  /** Equatorial radius in Earth radii. */
  radius: number
  /** Axial tilt, degrees. */
  tilt: number
  /** Oblateness (flattening). */
  flattening: number
  /** Sidereal rotation period in hours; negative is retrograde. */
  day: number
  /** The world itself — what the sculptor edits and the spectrometer reads. */
  params: PlanetParams
  /** Measured bodies carry a photographic map; sculpted ones are baked. */
  texture?: string | null
  /** A hand-built ring, for measured bodies. Sculpted worlds derive theirs. */
  ring?: RingConfig | null
  /**
   * The name of the body this one orbits, for satellites. Everything above
   * keeps its usual meaning and its true value — `a` in AU and `period` in
   * years, both measured from the parent rather than from the star — so a
   * satellite is an ordinary world that happens to be somewhere else.
   *
   * The drawn orbit is not `a`: a moon at true scale is invisible beside its
   * planet, so the renderer maps it into a band just outside the parent's
   * drawn disc, exactly as the single-world view already compresses moons.
   */
  orbits?: string
}

export interface Star {
  name: string
  /** Tint applied to the star's surface shader. White leaves it as the Sun. */
  color: number
  /** Mass in solar masses. Sets how fast everything else orbits. */
  mass: number
  /** Bolometric luminosity in solar units; inferred from mass when omitted. */
  luminosity?: number
}

/**
 * Where a system's numbers come from. The Solar System is measured and this
 * project is careful about saying so, which means anything invented has to be
 * marked as invented rather than sitting alongside it unlabelled. `observed`
 * is the honest middle: real exoplanet systems whose orbits and years are
 * measured while every surface wearing them is imagined — nobody has seen one.
 */
export type SystemOrigin = 'measured' | 'observed' | 'imagined' | 'custom'

export interface SystemDef {
  id: string
  name: string
  /** One-line caption shown under the name. */
  sub: string
  origin: SystemOrigin
  star: Star
  bodies: SystemBody[]
}
