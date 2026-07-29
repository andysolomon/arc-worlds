/**
 * Which rendering tier a world uses in the single-world view.
 *
 * `flat` is a baked or photographic map on a smooth sphere — exactly what the
 * orbit view draws; `detailed` is displaced geometry with water, cloud and
 * atmosphere shells — what the sculptor draws. The tier is a quality choice
 * layered over `engine/surface.ts`, which stays the single source of what a
 * world looks like: the two tiers differ in richness, never in identity.
 */
import { isGas, PALETTES } from './palettes'
import type { PlanetParams } from './types'

export type Tier = 'flat' | 'detailed'

/**
 * Resolve a world's tier. An explicit choice wins; otherwise each world picks
 * its natural one: photographs stay flat (a photo has no height to displace),
 * gas giants go flat because the flat pipeline is the animated one — the gas
 * shader's drifting bands and storm vortex live there — and sculpted rock is
 * detailed, which is what the sculptor has always drawn.
 */
export function effectiveTier(p: PlanetParams): Tier {
  if (p.tier === 'flat' || p.tier === 'detailed') return p.tier
  if (p.texture) return 'flat'
  const pal = PALETTES[p.preset] ?? PALETTES.temperate
  return isGas(pal) ? 'flat' : 'detailed'
}
