/**
 * Viewer display preferences: orbit paths, body labels, moons.
 *
 * These are about how this browser likes to look at things, not about any
 * world's identity — they are deliberately not part of PlanetParams' saved
 * shape or a system's definition, so a shared link never carries them and
 * toggling one never re-bakes a texture.
 */

const STORAGE_KEY = 'little-worlds.display'

/**
 * The rendering tier: `flat` is a baked map on a smooth sphere — what real
 * planets and the orbit view already use — and `detailed` is displaced
 * geometry with water, cloud and atmosphere shells — what the sculptor uses.
 * `auto` lets each world pick its natural tier.
 */
export type TierChoice = 'auto' | 'flat' | 'detailed'

/** Background nebula tints — a wash of colour behind the starfield. */
export type NebulaKey = 'none' | 'ember' | 'teal' | 'violet' | 'rose'

export const NEBULAE: Array<{ key: NebulaKey; label: string; dot: string | undefined }> = [
  { key: 'none', label: 'None', dot: undefined },
  // Labelled Dawn, not Ember: the Sculpt tab already has an Ember chip, and
  // two buttons must never answer to the same name — the perf benchmark and
  // the tests address chips by their accessible name alone.
  { key: 'ember', label: 'Dawn', dot: '#ff8a5f' },
  { key: 'teal', label: 'Teal', dot: '#5fcdd0' },
  { key: 'violet', label: 'Violet', dot: '#8f5fbc' },
  { key: 'rose', label: 'Rose', dot: '#ff8fc7' },
]

/**
 * The tint is plain CSS behind the transparent canvas: two soft radial washes,
 * costing the GPU scene nothing at all — the budgets never see it.
 */
const NEBULA_CSS: Record<NebulaKey, string> = {
  none: '',
  ember:
    'radial-gradient(120% 90% at 72% 18%, rgba(255,138,95,0.14), transparent 62%),' +
    'radial-gradient(100% 80% at 18% 78%, rgba(184,80,138,0.10), transparent 58%)',
  teal:
    'radial-gradient(120% 90% at 70% 22%, rgba(95,205,208,0.12), transparent 62%),' +
    'radial-gradient(100% 80% at 20% 76%, rgba(63,134,201,0.10), transparent 58%)',
  violet:
    'radial-gradient(120% 90% at 68% 20%, rgba(143,95,188,0.16), transparent 62%),' +
    'radial-gradient(100% 80% at 22% 78%, rgba(63,42,106,0.14), transparent 58%)',
  rose:
    'radial-gradient(120% 90% at 72% 20%, rgba(255,143,199,0.13), transparent 62%),' +
    'radial-gradient(100% 80% at 18% 76%, rgba(199,90,158,0.09), transparent 58%)',
}

export function nebulaCss(n: NebulaKey): string {
  return NEBULA_CSS[n] ?? ''
}

export interface DisplayOptions {
  /** Orbit paths, for planets and moons alike. */
  paths: boolean
  /** Planet names in the orbit view. */
  labels: boolean
  /** Moons — off skips building and moving them entirely. */
  moons: boolean
  /** Rendering tier for the single-world view; a quality choice, not identity. */
  tier: TierChoice
  /** Starfield density, 0..1; 0.5 is the count the app always drew. */
  starDensity: number
  /** Starfield brightness, 0..1; 0.5 is the look the app always drew. */
  starBright: number
  /** Background nebula tint, behind the canvas. */
  nebula: NebulaKey
  /** Overall exposure, 0..1; 0.5 is exactly neutral. */
  exposure: number
  /**
   * Stop the clock while the pointer rests on a planet or a moon.
   *
   * A time control, and it lives in the time bar — but it is a habit rather
   * than a speed, so unlike the speeds it is remembered between visits.
   */
  pauseOnHover: boolean
}

/** Every default reproduces what the app always drew; labels are opt-in. */
export const DEFAULT_DISPLAY: DisplayOptions = {
  paths: true, labels: false, moons: true, tier: 'auto',
  starDensity: 0.5, starBright: 0.5, nebula: 'none', exposure: 0.5,
  pauseOnHover: false,
}

const unit = (v: unknown, fallback: number) =>
  typeof v === 'number' && !Number.isNaN(v) ? Math.min(1, Math.max(0, v)) : fallback

const NEBULA_KEYS = new Set(NEBULAE.map((n) => n.key))

/** The stored preferences, or the defaults when unset, corrupt, or blocked. */
export function loadDisplay(): DisplayOptions {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_DISPLAY }
    const parsed: unknown = JSON.parse(raw)
    const p = parsed as Partial<Record<keyof DisplayOptions, unknown>>
    return {
      paths: typeof p.paths === 'boolean' ? p.paths : DEFAULT_DISPLAY.paths,
      labels: typeof p.labels === 'boolean' ? p.labels : DEFAULT_DISPLAY.labels,
      moons: typeof p.moons === 'boolean' ? p.moons : DEFAULT_DISPLAY.moons,
      tier: p.tier === 'flat' || p.tier === 'detailed' ? p.tier : DEFAULT_DISPLAY.tier,
      starDensity: unit(p.starDensity, DEFAULT_DISPLAY.starDensity),
      starBright: unit(p.starBright, DEFAULT_DISPLAY.starBright),
      nebula: NEBULA_KEYS.has(p.nebula as NebulaKey) ? (p.nebula as NebulaKey) : DEFAULT_DISPLAY.nebula,
      exposure: unit(p.exposure, DEFAULT_DISPLAY.exposure),
      pauseOnHover:
        typeof p.pauseOnHover === 'boolean' ? p.pauseOnHover : DEFAULT_DISPLAY.pauseOnHover,
    }
  } catch {
    return { ...DEFAULT_DISPLAY }
  }
}

/** Best-effort persistence; private browsing simply forgets on reload. */
export function saveDisplay(d: DisplayOptions): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(d))
  } catch {
    // The in-page state is still authoritative; only the reload loses it.
  }
}
