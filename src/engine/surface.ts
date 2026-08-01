/**
 * What a generator-v1 sculpted world looks like, as a pure function of direction.
 *
 * This is the single source of truth for a world's surface. The single-world
 * view feeds it sphere vertices and writes vertex colours; the orbit view
 * feeds it equirectangular texels and bakes a map. Sharing it is the point —
 * otherwise the same seed could read as two different planets depending on
 * which view you happened to be looking at. Generator v2 keeps the same
 * identity rule through its worker-owned canonical spherical model.
 */
import * as THREE from 'three'
import { fbm, makeNoise, type Noise3 } from './noise'
import { isGas, PALETTES } from './palettes'
import type { PlanetParams } from './types'

/**
 * Displacement applied to the unit sphere, in sphere radii.
 *
 * Earth's tallest mountain is 0.14% of its radius, so any relief you can see
 * on a silhouette is already exaggerated a hundredfold. The old 0.12 was
 * nearer eighty-five times that again, which is why every world arrived
 * looking like an asteroid: the horizon itself was visibly lumpy. This keeps
 * enough for a sculpted world to feel handmade and hold a shadow, while
 * leaving the outline reading as a planet.
 *
 * Deliberately the only thing changed here. The elevation field itself is
 * untouched, and the colour ramp reads that field rather than this number —
 * so every world already saved keeps its exact coastlines, continents and
 * colours, and only the height of its relief comes down. Changing the noise
 * frequency would have smoothed things too, and would have moved every
 * coastline in the gallery.
 */
const AMP = 0.042

export interface Surface {
  /**
   * Colour and displaced radius at a direction on the unit sphere. Writes the
   * colour into `out` and returns the radius, so the caller can use one or
   * both without allocating.
   */
  sample(x: number, y: number, z: number, out: THREE.Color): number
  /** Sea level expressed as a radius, for the water shell. */
  seaRadius: number
  gas: boolean
}

/** The three noise fields a world is built from. Derived from the seed alone. */
export function noiseFor(seed: number): { n1: Noise3; n2: Noise3; nc: Noise3 } {
  const s = seed | 0
  return { n1: makeNoise(s), n2: makeNoise(s ^ 0x51ed270b), nc: makeNoise(s + 777) }
}

export function makeSurface(P: PlanetParams, n1: Noise3, n2: Noise3): Surface {
  const pal = PALETTES[P.preset] ?? PALETTES.temperate
  const f = 1.15 + (P.roughness || 0) * 2.5
  const sea = (P.water || 0) * 1.5 - 0.75
  const mtn = P.mountains || 0
  const seaRadius = 1 + sea * AMP

  if (isGas(pal)) {
    const gasStops = pal.bands.map((b) => [b[0], new THREE.Color(b[1])] as const)
    const wobAmt = 0.35 + (P.roughness || 0) * 1.7

    return {
      gas: true,
      seaRadius,
      sample(gx, gy, gz, out) {
        const wob =
          (fbm(n1, gx * 2.2, gy * 7, gz * 2.2, 4) * 0.07 +
            fbm(n2, gx * 4 + 9, gy * 4 + 9, gz * 4 + 9, 3) * 0.03) *
          wobAmt
        const gt = Math.min(1, Math.max(0, gy * 0.5 + 0.5 + wob))

        let a = gasStops[0]
        let b = gasStops[gasStops.length - 1]
        for (let gs = 0; gs < gasStops.length - 1; gs++) {
          if (gt >= gasStops[gs][0] && gt <= gasStops[gs + 1][0]) {
            a = gasStops[gs]
            b = gasStops[gs + 1]
            break
          }
        }
        out.copy(a[1]).lerp(b[1], Math.min(1, (gt - a[0]) / Math.max(1e-6, b[0] - a[0])))

        return 1 + fbm(n1, gx * 1.3, gy * 1.3, gz * 1.3, 3) * 0.012
      },
    }
  }

  const C = (k: keyof typeof pal) => new THREE.Color(pal[k] as number)
  const cDeep = C('deep'), cWater = C('water'), cSand = C('sand')
  const cLow = C('low'), cMid = C('mid'), cHigh = C('high'), cSnow = C('snow')
  const cShal = cWater.clone().lerp(cSand, 0.5)
  const stops: Array<[number, THREE.Color]> = [
    [0, cSand], [0.1, cSand], [0.18, cLow], [0.45, cMid],
    [0.72, cHigh], [0.88, cSnow], [1.01, cSnow],
  ]
  const iceAmt = P.ice || 0
  const iceTh = 1 - iceAmt * 0.6

  return {
    gas: false,
    seaRadius,
    sample(x, y, z, out) {
      const cont = fbm(n1, x * f, y * f, z * f, 5)
      const rr = 1 - Math.abs(fbm(n2, x * f * 1.8 + 5.2, y * f * 1.8 + 5.2, z * f * 1.8 + 5.2, 4))
      const e = cont * 0.62 + rr * rr * mtn * 0.9 - mtn * 0.2

      if (e < sea) {
        out.copy(cShal).lerp(cDeep, Math.min(1, (sea - e) * 3.5))
      } else {
        const t = Math.min(1, (e - sea) / Math.max(0.25, (1 - sea) * 0.95))
        let a = stops[0]
        let b = stops[stops.length - 1]
        for (let s = 0; s < stops.length - 1; s++) {
          if (t >= stops[s][0] && t <= stops[s + 1][0]) {
            a = stops[s]
            b = stops[s + 1]
            break
          }
        }
        out.copy(a[1]).lerp(b[1], Math.min(1, (t - a[0]) / Math.max(1e-6, b[0] - a[0])))
      }

      const ay = Math.abs(y)
      if (iceAmt > 0 && ay > iceTh) {
        out.lerp(cSnow, Math.min(1, (ay - iceTh) / 0.08) * 0.95)
      }

      return 1 + e * AMP
    },
  }
}

/**
 * Cloud opacity at a direction, 0..1 before the palette's own cloud opacity.
 * The single view puts this on a separate shell; the orbit view bakes it into
 * the surface map, so both need the same field.
 */
export function cloudAt(nc: Noise3, cover: number, x: number, y: number, z: number): number {
  const th = 0.78 - cover * 0.55
  const v = fbm(nc, x * 1.7, y * 1.7, z * 1.7, 4) * 0.5 + 0.5
  return Math.min(1, Math.max(0, (v - th) / 0.22))
}

export { AMP }
