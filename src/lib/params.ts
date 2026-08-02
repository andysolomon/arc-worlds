/**
 * World params: defaults, validation, and randomisation.
 *
 * A world is entirely described by this object — under 1KB of JSON — so it is
 * also exactly what gets stored and shared. Everything visual regenerates from
 * it, which is why there are no thumbnails anywhere in this project.
 */
import { mulberry32 } from '../engine/noise.js'
import { PRESETS } from '../data/presets.js'
import {
  CURRENT_GENERATOR_VERSION,
  LEGACY_GENERATOR_VERSION,
  type PlanetParams,
  type PresetKey,
} from '../engine/types.js'

/** Whimsical two-syllable world names, occasionally with a regnal suffix. */
export function genName(r: () => number): string {
  const A = ['Blu', 'Mira', 'Twee', 'Nim', 'Pova', 'Zola', 'Cori', 'Fen', 'Lum', 'Tobo', 'Wim', 'Peri', 'Glim', 'Osha', 'Bram', 'Sula']
  const B = ['belle', 'wick', 'moss', 'pip', 'dora', 'loo', 'va', 'kin', 'dust', 'fern', 'bee', 'nook', 'puff', 'tide', 'glow', 'pond']
  let n = A[(r() * A.length) | 0] + B[(r() * B.length) | 0]
  if (r() < 0.25) n += ' ' + ['II', 'III', 'IV', 'Minor', 'Prime'][(r() * 5) | 0]
  return n.charAt(0).toUpperCase() + n.slice(1)
}

export const DEFAULT_PARAMS: PlanetParams = {
  // This is also the compatibility baseline for hand-authored and persisted
  // payloads. New rolls opt into v2 below; an absent field must never rewrite
  // an existing world's geography as the generator evolves.
  generatorVersion: LEGACY_GENERATOR_VERSION,
  seed: 31174,
  preset: 'temperate',
  mountains: 0.5,
  water: 0.55,
  roughness: 0.5,
  clouds: 0.5,
  glow: 0.5,
  ice: 0.25,
  lightAz: 0.107,
  lightEl: 0.639,
  spinDir: 1,
  spinSpeed: 0.5,
  rings: false,
  ringN: 2,
  ringInner: 0.24,
  ringTilt: 0.5,
  ringWidth: 0.5,
  ringGap: 0.35,
  ringOpacity: 0.7,
  ringColor: null,
  moons: 0,
  atmoColor: null,
  texture: null,
  cloudTexture: null,
  terrainType: 'fractal',
  terrainAmplitude: 1,
  terrainSharpness: 2.6,
  terrainOffset: 0,
  terrainPeriod: 0.6,
  terrainPersistence: 0.48,
  terrainLacunarity: 1.8,
  terrainOctaves: 6,
  terrainLayers: [
    { transition: 0, blend: 0.2, color: 0x123a61 },
    { transition: 0.22, blend: 0.3, color: 0x2b7f7d },
    { transition: 0.46, blend: 0.36, color: 0x78ad58 },
    { transition: 0.68, blend: 0.26, color: 0x8d8069 },
    { transition: 0.86, blend: 0.2, color: 0xe6ebe2 },
  ],
  bumpStrength: 0.72,
  bumpOffset: 0.001,
}

/** Baseline for every new/bundled world; DEFAULT_PARAMS remains the v1 loader fallback. */
export const CURRENT_PARAMS: PlanetParams = {
  ...DEFAULT_PARAMS,
  generatorVersion: CURRENT_GENERATOR_VERSION,
}

const UNIT_KEYS = [
  'mountains', 'water', 'roughness', 'clouds', 'glow', 'ice',
  'lightAz', 'lightEl', 'spinSpeed', 'ringInner', 'ringTilt',
  'ringWidth', 'ringGap', 'ringOpacity',
] as const

const TERRAIN_TYPES = new Set(['fractal', 'ridged', 'plates'])

function finiteIn(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.min(max, Math.max(min, n))
}

function sanitizeLayers(input: unknown): NonNullable<PlanetParams['terrainLayers']> {
  const source = Array.isArray(input) ? input : []
  const defaults = DEFAULT_PARAMS.terrainLayers!
  return defaults.map((fallback, index) => {
    const raw = (source[index] ?? {}) as Record<string, unknown>
    return {
      transition: finiteIn(raw.transition, fallback.transition, 0, 1),
      blend: finiteIn(raw.blend, fallback.blend, 0, 1),
      color: Math.round(finiteIn(raw.color, fallback.color, 0, 0xffffff)),
    }
  })
}

const PRESET_KEYS = new Set<string>([
  ...PRESETS.map((p) => p.key),
  'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto',
  'archean', 'proterozoic', 'noachian',
  'erid', 'adrian', 'pandora',
  'luna', 'io', 'europa', 'ganymede', 'titan', 'enceladus', 'triton',
])

/**
 * Clamp any real number into 0..1. Infinities clamp to the nearest bound
 * rather than falling back, so an out-of-range value behaves the same way
 * whether it is 5 or Infinity; only NaN and non-numbers use the default.
 */
const clamp01 = (v: unknown, fallback: number) =>
  typeof v === 'number' && !Number.isNaN(v) ? Math.min(1, Math.max(0, v)) : fallback

/**
 * Coerce arbitrary input into valid params. Used both on load from
 * localStorage and on the server for anything arriving over the wire, so a
 * malformed or hostile payload can never reach the renderer.
 */
export function sanitize(input: unknown): PlanetParams {
  const raw = (input ?? {}) as Record<string, unknown>
  const out: PlanetParams = { ...DEFAULT_PARAMS }

  // Old saved worlds predate the field, so missing and malformed values are
  // deliberately legacy v1. Only an explicit 2 opts into the new generator.
  out.generatorVersion = raw.generatorVersion === CURRENT_GENERATOR_VERSION
    ? CURRENT_GENERATOR_VERSION
    : LEGACY_GENERATOR_VERSION

  const seed = Number(raw.seed)
  out.seed = Number.isFinite(seed) ? Math.abs(Math.floor(seed)) % 1_000_000 : DEFAULT_PARAMS.seed

  out.preset = (typeof raw.preset === 'string' && PRESET_KEYS.has(raw.preset)
    ? raw.preset
    : DEFAULT_PARAMS.preset) as PresetKey

  for (const k of UNIT_KEYS) out[k] = clamp01(raw[k], DEFAULT_PARAMS[k])

  out.terrainType = TERRAIN_TYPES.has(raw.terrainType as string)
    ? raw.terrainType as NonNullable<PlanetParams['terrainType']>
    : DEFAULT_PARAMS.terrainType
  out.terrainAmplitude = finiteIn(raw.terrainAmplitude, DEFAULT_PARAMS.terrainAmplitude!, 0, 2)
  out.terrainSharpness = finiteIn(raw.terrainSharpness, DEFAULT_PARAMS.terrainSharpness!, 0.1, 6)
  out.terrainOffset = finiteIn(raw.terrainOffset, DEFAULT_PARAMS.terrainOffset!, -1, 1)
  out.terrainPeriod = finiteIn(raw.terrainPeriod, DEFAULT_PARAMS.terrainPeriod!, 0.08, 3)
  out.terrainPersistence = finiteIn(raw.terrainPersistence, DEFAULT_PARAMS.terrainPersistence!, 0.05, 1)
  out.terrainLacunarity = finiteIn(raw.terrainLacunarity, DEFAULT_PARAMS.terrainLacunarity!, 1, 4)
  out.terrainOctaves = Math.round(finiteIn(raw.terrainOctaves, DEFAULT_PARAMS.terrainOctaves!, 1, 10))
  out.terrainLayers = sanitizeLayers(raw.terrainLayers)
  out.bumpStrength = finiteIn(raw.bumpStrength, DEFAULT_PARAMS.bumpStrength!, 0, 2)
  out.bumpOffset = finiteIn(raw.bumpOffset, DEFAULT_PARAMS.bumpOffset!, 0, 0.2)

  out.spinDir = raw.spinDir === -1 ? -1 : 1
  out.rings = raw.rings === true
  out.ringN = Math.min(4, Math.max(1, Math.floor(Number(raw.ringN)) || DEFAULT_PARAMS.ringN))
  out.moons = Math.min(3, Math.max(0, Math.floor(Number(raw.moons)) || 0))
  out.ringColor = typeof raw.ringColor === 'number' ? raw.ringColor : null
  out.atmoColor = typeof raw.atmoColor === 'number' ? raw.atmoColor : null

  // Textures are asset paths, so only ever accept our own known-good ones.
  out.texture = safeTexture(raw.texture)
  out.cloudTexture = safeTexture(raw.cloudTexture)

  return out
}

const TEXTURE_RE = /^images2k\/[a-z]+\.(jpg|png)$/

/** Asset paths are only ever accepted if they name one of our own textures. */
export function safeTexture(v: unknown): string | null {
  return typeof v === 'string' && TEXTURE_RE.test(v) ? v : null
}

/**
 * A random world, plus a name to match.
 *
 * Rather than randomising every slider independently — which mostly produces
 * mud — this picks a world type and jitters that type's defaults by ±0.2, so
 * the result still reads as a coherent Meadow or Ember world.
 */
export function surprise(seed = (Math.random() * 99999) | 0, forced?: PresetKey) {
  const r = mulberry32(seed * 2654435761)
  const preset = (forced && PRESETS.find((p) => p.key === forced)) || PRESETS[(r() * PRESETS.length) | 0]
  const def = preset.def
  const j = (v: number | undefined) => Math.max(0, Math.min(1, (v ?? 0.5) + (r() - 0.5) * 0.4))

  const params: PlanetParams = {
    ...DEFAULT_PARAMS,
    generatorVersion: CURRENT_GENERATOR_VERSION,
    seed,
    preset: preset.key,
    mountains: j(def.mountains),
    water: j(def.water),
    roughness: j(def.roughness),
    clouds: j(def.clouds),
    glow: j(def.glow),
    ice: j(def.ice),
    rings: r() < 0.18,
    moons: (r() * 2.6) | 0,
    atmoColor: null,
    texture: null,
    cloudTexture: null,
  }
  return { params, name: genName(r) }
}

/** Stable JSON for storage and sharing — key order is fixed. */
export function serialize(p: PlanetParams): string {
  const ordered: Record<string, unknown> = {}
  for (const k of Object.keys(DEFAULT_PARAMS).sort()) ordered[k] = p[k as keyof PlanetParams]
  return JSON.stringify(ordered)
}
