/** The complete description of a world. Everything else is derived from this. */
export interface PlanetParams {
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
  /** Orbit paths for planets and moons. Hidden paths still show on hover. */
  showPaths?: boolean
  /** Planet names in the orbit view. */
  showLabels?: boolean
  /** Off skips building moons entirely, which is a performance lever. */
  showMoons?: boolean
  /**
   * Rendering tier for the single-world view. `flat` is the baked map on a
   * smooth sphere; `detailed` is displaced geometry with fluid shells.
   * Unset lets the world pick: photographs and gas giants render flat,
   * sculpted rock renders detailed. A quality choice, never identity.
   */
  tier?: 'flat' | 'detailed'
  /** Universe appearance, 0..1 each with 0.5 the look the app always drew. */
  starDensity?: number
  starBright?: number
  exposure?: number
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
}

export interface Star {
  name: string
  /** Tint applied to the star's surface shader. White leaves it as the Sun. */
  color: number
  /** Mass in solar masses. Sets how fast everything else orbits. */
  mass: number
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
