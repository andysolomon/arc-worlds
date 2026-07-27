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
}

/** name, a (AU), period (yr), eccentricity, inclination, node, perihelion, radius (Earth radii). */
export type OrbitRow = [string, number, number, number, number, number, number, number]
