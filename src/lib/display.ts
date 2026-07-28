/**
 * Viewer display preferences: orbit paths, body labels, moons.
 *
 * These are about how this browser likes to look at things, not about any
 * world's identity — they are deliberately not part of PlanetParams' saved
 * shape or a system's definition, so a shared link never carries them and
 * toggling one never re-bakes a texture.
 */

const STORAGE_KEY = 'little-worlds.display'

export interface DisplayOptions {
  /** Orbit paths, for planets and moons alike. */
  paths: boolean
  /** Planet names in the orbit view. */
  labels: boolean
  /** Moons — off skips building and moving them entirely. */
  moons: boolean
}

/** Paths and moons match what the app always drew; labels are opt-in. */
export const DEFAULT_DISPLAY: DisplayOptions = { paths: true, labels: false, moons: true }

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
