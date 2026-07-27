/**
 * Bake a sculpted world into an equirectangular map for the orbit view.
 *
 * In the orbit view a planet is a few dozen pixels across, so giving each one
 * the single view's displaced, vertex-coloured geometry plus its own water,
 * cloud and atmosphere shells would cost a great deal for detail nobody can
 * see. Baking the same `Surface` into a small texture keeps every world
 * looking like itself at a fraction of the price.
 */
import * as THREE from 'three'
import { isGas, PALETTES } from './palettes'
import { cloudAt, makeSurface, noiseFor } from './surface'
import type { PlanetParams } from './types'

const W = 256
const H = 128

/** Linear working space to 8-bit sRGB, matching Three.js' own transfer curve. */
function toSRGB(c: number): number {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
  return Math.round(Math.min(1, Math.max(0, v)) * 255)
}

export function bakeWorld(P: PlanetParams): THREE.CanvasTexture {
  const { n1, n2, nc } = noiseFor(P.seed | 0)
  const surface = makeSurface(P, n1, n2)
  const pal = PALETTES[P.preset] ?? PALETTES.temperate

  // Clouds live on their own shell in the single view. Here they are composited
  // straight onto the surface: at orbit-view scale the parallax between a deck
  // and the ground below it is far under a pixel.
  const cover = P.clouds || 0
  const cloudy = !isGas(pal) && cover > 0.04
  const cloudMax = (pal.cloudO ?? 0.9) * (235 / 255)
  const cloudCol = new THREE.Color(('cloudTint' in pal && pal.cloudTint) || 0xffffff)

  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const ctx = cv.getContext('2d')!
  const img = ctx.createImageData(W, H)
  const col = new THREE.Color()

  for (let y = 0; y < H; y++) {
    const phi = ((y + 0.5) / H) * Math.PI
    const sp = Math.sin(phi)
    const cp = Math.cos(phi)
    for (let x = 0; x < W; x++) {
      const theta = ((x + 0.5) / W) * 2 * Math.PI
      const dx = sp * Math.cos(theta)
      const dy = cp
      const dz = sp * Math.sin(theta)

      surface.sample(dx, dy, dz, col)
      if (cloudy) {
        const a = cloudAt(nc, cover, dx, dy, dz) * cloudMax
        if (a > 0) col.lerp(cloudCol, a)
      }

      const o = (y * W + x) * 4
      img.data[o] = toSRGB(col.r)
      img.data[o + 1] = toSRGB(col.g)
      img.data[o + 2] = toSRGB(col.b)
      img.data[o + 3] = 255
    }
  }

  ctx.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}
