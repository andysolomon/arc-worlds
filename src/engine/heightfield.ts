/**
 * Relief for a photographed world, taken from its own map.
 *
 * A real planet has no elevation data here — only a colour photograph — so
 * the honest options are a smooth ball or relief derived from the picture
 * itself. This does the latter, from luminance: dark is low, bright is high.
 * That is not a law of nature, but on the bodies this app carries it holds
 * well enough to read as the world you know — Earth's oceans sit below its
 * continents, the Moon's dark maria are genuinely low basins, and Mercury's
 * smooth plains are darker than its highlands.
 *
 * The amplitude is deliberately tiny. Everest is 0.14% of Earth's radius, so
 * anything you can see on a silhouette is already exaggerated by a hundred;
 * this aims for enough to catch the light at the limb and no more.
 */

/** Working resolution. Downsampling is what smooths JPEG grain out of it. */
const FIELD_W = 512
const FIELD_H = 256

export interface HeightField {
  w: number
  h: number
  /** Signed, roughly -0.5..0.5, with the world's own mean at zero. */
  data: Float32Array
}

/**
 * Average a map down to the working resolution and keep its luminance.
 *
 * Box-averaging every source pixel that lands in a cell is what removes
 * compression noise: sampling instead would carry the speckle straight into
 * the geometry, where it reads as gravel rather than terrain.
 */
export function heightFieldFrom(image: TexImageSource & { width: number; height: number }): HeightField | null {
  const sw = image.width
  const sh = image.height
  if (!sw || !sh) return null

  const canvas = document.createElement('canvas')
  canvas.width = sw
  canvas.height = sh
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(image as CanvasImageSource, 0, 0)

  let px: Uint8ClampedArray
  try {
    px = ctx.getImageData(0, 0, sw, sh).data
  } catch {
    // A cross-origin map would taint the canvas. Ours are same-origin, but a
    // smooth world is a better failure than a broken one.
    return null
  }

  const data = new Float32Array(FIELD_W * FIELD_H)
  const counts = new Float32Array(FIELD_W * FIELD_H)
  for (let y = 0; y < sh; y++) {
    const ty = Math.min(FIELD_H - 1, ((y / sh) * FIELD_H) | 0)
    for (let x = 0; x < sw; x++) {
      const tx = Math.min(FIELD_W - 1, ((x / sw) * FIELD_W) | 0)
      const i = (y * sw + x) * 4
      // Rec. 601 luma: closer to perceived brightness than a flat average.
      const l = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) / 255
      const t = ty * FIELD_W + tx
      data[t] += l
      counts[t] += 1
    }
  }

  let mean = 0
  for (let i = 0; i < data.length; i++) {
    data[i] = counts[i] ? data[i] / counts[i] : 0
    mean += data[i]
  }
  mean /= data.length
  for (let i = 0; i < data.length; i++) data[i] -= mean

  return { w: FIELD_W, h: FIELD_H, data }
}

/**
 * Bilinear height at a sphere UV, wrapping in longitude.
 *
 * Wrapping matters: without it the seam at the back of the world would step,
 * and a step in a displaced sphere is a visible crack.
 */
export function heightAt(field: HeightField, u: number, v: number): number {
  const { w, h, data } = field
  const x = u * w - 0.5
  const y = (1 - v) * h - 0.5
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0

  const wrap = (i: number) => ((i % w) + w) % w
  const clamp = (j: number) => Math.min(h - 1, Math.max(0, j))
  const x1 = wrap(x0 + 1)
  const xa = wrap(x0)
  const ya = clamp(y0)
  const y1 = clamp(y0 + 1)

  const a = data[ya * w + xa]
  const b = data[ya * w + x1]
  const c = data[y1 * w + xa]
  const d = data[y1 * w + x1]
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy
}
