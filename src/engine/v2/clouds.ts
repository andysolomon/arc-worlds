/**
 * Independently authored Arc Worlds weather fields.
 *
 * The threejs-procedural-planets reference is limited to terrain, elevation
 * layers, and bump mapping. None of its cloud, lighting, atmosphere, shader,
 * or render-loop implementation is adapted here.
 */
import { fbm, makeNoise, type Noise3 } from '../noise.js'

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/** Climate-scaled cloud coverage shared by orbit maps and detailed shells. */
export function v2CloudCoverage(clouds: number, liquidWater: number, gas = false): number {
  const climateFactor = gas ? 1 : 0.12 + clamp(liquidWater) * 0.88
  return clamp(clouds * climateFactor)
}

/**
 * A compiled weather field. Creating simplex permutation tables is cheap once
 * per bake but much too expensive once per pixel, so callers reuse this object
 * across the complete equirectangular map.
 */
export interface V2CloudField {
  structure: Noise3
  detail: Noise3
  warpA: Noise3
  warpB: Noise3
}

/** Compile the seed-stable noises used by both orbit maps and cloud shells. */
export function createV2CloudField(seed: number): V2CloudField {
  const safeSeed = seed | 0
  return {
    structure: makeNoise(safeSeed ^ 0x34d1a2b7),
    detail: makeNoise(safeSeed ^ 0x6c8e9cf5),
    warpA: makeNoise(safeSeed ^ 0x1b56c4e9),
    warpB: makeNoise(safeSeed ^ 0x72a95f31),
  }
}

/**
 * Sample a seamless weather system at a unit-sphere direction.
 *
 * Low-frequency domain warping bends fronts without turning them into smooth
 * latitude bands. Independent macro, billow and wisp layers then provide the
 * nested scales seen in real cloud systems. Coverage only moves the threshold;
 * it never changes the geography, which keeps a seed recognisable as climate
 * parameters evolve.
 */
export function sampleV2CloudMask(
  field: V2CloudField,
  coverage: number,
  x: number,
  y: number,
  z: number,
): number {
  const warpScale = 1.15
  const warpX = fbm(field.warpA, x * warpScale + 7.3, y * warpScale - 2.1, z * warpScale + 4.7, 3)
  const warpY = fbm(field.warpB, x * warpScale - 5.8, y * warpScale + 8.6, z * warpScale - 1.4, 3)
  const warpZ = fbm(field.warpA, x * warpScale + 1.9, y * warpScale + 5.2, z * warpScale - 7.7, 2)
  const qx = x + warpX * 0.38
  const qy = y + warpY * 0.38
  const qz = z + warpZ * 0.3

  const macro = fbm(field.structure, qx * 2.35, qy * 2.35, qz * 2.35, 5) * 0.5 + 0.5
  const billow = 1 - Math.abs(fbm(field.detail, qx * 5.8 + 11.2, qy * 5.8 - 3.6, qz * 5.8 + 6.1, 4))
  const wisps = fbm(field.structure, qx * 12.5 - 4.9, qy * 12.5 + 9.4, qz * 12.5 - 8.2, 3) * 0.5 + 0.5

  // Atmospheric circulation leaves a subtle latitude-scale signal, but the
  // warped phase prevents the mechanically horizontal stripes of a gas giant.
  const latitude = Math.asin(Math.max(-1, Math.min(1, y)))
  const circulation = Math.sin(latitude * 5.5 + warpY * 1.7 + warpX * 0.55) * 0.5 + 0.5
  const density = macro * 0.53 + billow * 0.24 + wisps * 0.16 + circulation * 0.07
  const threshold = 0.72 - clamp(coverage) * 0.34
  const opticalDepth = clamp((density - threshold) / 0.2)

  // A slightly convex optical-depth response preserves translucent margins
  // instead of expanding every cloud into a fully opaque white plateau.
  return Math.pow(opticalDepth, 1.25)
}

let cachedSeed = Number.NaN
let cachedField: V2CloudField | null = null

/** Compatibility helper for isolated samples; map bakers should compile once. */
export function v2CloudMask(seed: number, coverage: number, x: number, y: number, z: number): number {
  if (seed !== cachedSeed || !cachedField) {
    cachedSeed = seed
    cachedField = createV2CloudField(seed)
  }
  return sampleV2CloudMask(cachedField, coverage, x, y, z)
}

/** Shared optical-strength policy for orbit compositing and detailed shells. */
export function v2CloudLayerOpacity(paletteOpacity: number, temperate: boolean): number {
  return clamp(paletteOpacity) * (temperate ? 0.58 : 0.72)
}
