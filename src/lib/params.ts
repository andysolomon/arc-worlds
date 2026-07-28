/**
 * World params: defaults, validation, and randomisation.
 *
 * A world is entirely described by this object — under 1KB of JSON — so it is
 * also exactly what gets stored and shared. Everything visual regenerates from
 * it, which is why there are no thumbnails anywhere in this project.
 */
import { mulberry32 } from '../engine/noise.js'
import { PRESETS } from '../data/presets.js'
import type { PlanetParams, PresetKey } from '../engine/types.js'

/** Whimsical two-syllable world names, occasionally with a regnal suffix. */
export function genName(r: () => number): string {
  const A = ['Blu', 'Mira', 'Twee', 'Nim', 'Pova', 'Zola', 'Cori', 'Fen', 'Lum', 'Tobo', 'Wim', 'Peri', 'Glim', 'Osha', 'Bram', 'Sula']
  const B = ['belle', 'wick', 'moss', 'pip', 'dora', 'loo', 'va', 'kin', 'dust', 'fern', 'bee', 'nook', 'puff', 'tide', 'glow', 'pond']
  let n = A[(r() * A.length) | 0] + B[(r() * B.length) | 0]
  if (r() < 0.25) n += ' ' + ['II', 'III', 'IV', 'Minor', 'Prime'][(r() * 5) | 0]
  return n.charAt(0).toUpperCase() + n.slice(1)
}

export const DEFAULT_PARAMS: PlanetParams = {
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
}

const UNIT_KEYS = [
  'mountains', 'water', 'roughness', 'clouds', 'glow', 'ice',
  'lightAz', 'lightEl', 'spinSpeed', 'ringInner', 'ringTilt',
  'ringWidth', 'ringGap', 'ringOpacity',
] as const

const PRESET_KEYS = new Set<string>([
  ...PRESETS.map((p) => p.key),
  'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto',
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

  const seed = Number(raw.seed)
  out.seed = Number.isFinite(seed) ? Math.abs(Math.floor(seed)) % 1_000_000 : DEFAULT_PARAMS.seed

  out.preset = (typeof raw.preset === 'string' && PRESET_KEYS.has(raw.preset)
    ? raw.preset
    : DEFAULT_PARAMS.preset) as PresetKey

  for (const k of UNIT_KEYS) out[k] = clamp01(raw[k], DEFAULT_PARAMS[k])

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
