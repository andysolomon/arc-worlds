/**
 * CPU-only texture baking shared by the browser worker and deterministic tests.
 *
 * Keep this module free of canvas/document APIs: the expensive noise loops run
 * in a worker, then the viewport uploads the transferred bytes as a DataTexture.
 */
import * as THREE from 'three'
import { isGas, PALETTES } from './palettes'
import { cloudAt, makeSurface, noiseFor } from './surface'
import type { PlanetParams } from './types'
import { v2CloudCoverage, v2CloudMask } from './v2/clouds'

export const WORLD_BAKE_WIDTH = 256
export const WORLD_BAKE_HEIGHT = 128
export const CLOUD_BAKE_WIDTH = 512
export const CLOUD_BAKE_HEIGHT = 256

/** Linear working space to 8-bit sRGB, matching Three.js' own transfer curve. */
function toSRGB(c: number): number {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
  return Math.round(Math.min(1, Math.max(0, v)) * 255)
}

/**
 * Bake a sculpted world into an equirectangular RGBA map for the orbit view.
 *
 * In orbit a planet is only a few dozen pixels across. Baking the same Surface
 * used by the sculptor keeps that identity while avoiding displaced geometry,
 * water, cloud and atmosphere shells for every body.
 */
export function bakeWorldPixels(
  P: PlanetParams,
  width = WORLD_BAKE_WIDTH,
  height = WORLD_BAKE_HEIGHT,
): Uint8Array {
  const { n1, n2, nc } = noiseFor(P.seed | 0)
  const surface = makeSurface(P, n1, n2)
  const pal = PALETTES[P.preset] ?? PALETTES.temperate
  const data = new Uint8Array(width * height * 4)

  // Clouds live on their own shell in the single view. Here they are composited
  // straight onto the surface: their parallax is subpixel at orbit-view scale.
  const cover = P.clouds || 0
  const cloudy = !isGas(pal) && cover > 0.04
  const cloudMax = (pal.cloudO ?? 0.9) * (235 / 255)
  const cloudCol = new THREE.Color(('cloudTint' in pal && pal.cloudTint) || 0xffffff)
  const col = new THREE.Color()

  for (let y = 0; y < height; y++) {
    const phi = ((y + 0.5) / height) * Math.PI
    const sp = Math.sin(phi)
    const cp = Math.cos(phi)
    for (let x = 0; x < width; x++) {
      const theta = ((x + 0.5) / width) * 2 * Math.PI
      const dx = sp * Math.cos(theta)
      const dy = cp
      const dz = sp * Math.sin(theta)

      surface.sample(dx, dy, dz, col)
      if (cloudy) {
        const a = cloudAt(nc, cover, dx, dy, dz) * cloudMax
        if (a > 0) col.lerp(cloudCol, a)
      }

      const o = (y * width + x) * 4
      data[o] = toSRGB(col.r)
      data[o + 1] = toSRGB(col.g)
      data[o + 2] = toSRGB(col.b)
      data[o + 3] = 255
    }
  }

  return data
}

/** Bake the transparent cloud shell used by the single-world view. */
export function bakeCloudPixels(
  seed: number,
  cover: number,
  width = CLOUD_BAKE_WIDTH,
  height = CLOUD_BAKE_HEIGHT,
  style: 'classic' | 'v2' = 'classic',
  liquidWater = 1,
): Uint8Array {
  const { nc } = noiseFor(seed | 0)
  const data = new Uint8Array(width * height * 4)
  const v2Coverage = v2CloudCoverage(cover, liquidWater)

  for (let y = 0; y < height; y++) {
    const phi = ((y + 0.5) / height) * Math.PI
    const sp = Math.sin(phi)
    const cp = Math.cos(phi)
    for (let x = 0; x < width; x++) {
      const theta = ((x + 0.5) / width) * 2 * Math.PI
      const sx = sp * Math.cos(theta)
      const sy = cp
      const sz = sp * Math.sin(theta)
      const a = style === 'v2'
        ? v2CloudMask(seed, v2Coverage, sx, sy, sz)
        : cloudAt(nc, cover, sx, sy, sz)
      const o = (y * width + x) * 4
      data[o] = 255
      data[o + 1] = 255
      data[o + 2] = 255
      data[o + 3] = Math.round(a * (style === 'v2' ? 255 : 235))
    }
  }

  return data
}
