/** Deterministic PRNG. The same seed always yields the same world. */
export function mulberry32(a: number): () => number {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type Noise3 = (x: number, y: number, z: number) => number

const GRAD: Array<[number, number, number]> = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
]

const F = 1 / 3
const G = 1 / 6

/** 3D simplex noise, seeded so terrain is reproducible from a world's seed. */
export function makeNoise(seed: number): Noise3 {
  const r = mulberry32(seed)
  const p: number[] = []
  const perm = new Uint8Array(512)
  for (let i = 0; i < 256; i++) p[i] = i
  for (let i = 255; i > 0; i--) {
    const j = (r() * (i + 1)) | 0
    const t = p[i]
    p[i] = p[j]
    p[j] = t
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]

  return function (xin, yin, zin) {
    const s = (xin + yin + zin) * F
    const i0 = Math.floor(xin + s)
    const j0 = Math.floor(yin + s)
    const k0 = Math.floor(zin + s)
    const tt = (i0 + j0 + k0) * G
    const x0 = xin - (i0 - tt)
    const y0 = yin - (j0 - tt)
    const z0 = zin - (k0 - tt)

    let i1: number, j1: number, k1: number, i2: number, j2: number, k2: number
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0 }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1 }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1 }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1 }
      else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1 }
      else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0 }
    }

    const x1 = x0 - i1 + G, y1 = y0 - j1 + G, z1 = z0 - k1 + G
    const x2 = x0 - i2 + 2 * G, y2 = y0 - j2 + 2 * G, z2 = z0 - k2 + 2 * G
    const x3 = x0 - 1 + 3 * G, y3 = y0 - 1 + 3 * G, z3 = z0 - 1 + 3 * G

    const ii = i0 & 255, jj = j0 & 255, kk = k0 & 255
    const gi0 = perm[ii + perm[jj + perm[kk]]] % 12
    const gi1 = perm[ii + i1 + perm[jj + j1 + perm[kk + k1]]] % 12
    const gi2 = perm[ii + i2 + perm[jj + j2 + perm[kk + k2]]] % 12
    const gi3 = perm[ii + 1 + perm[jj + 1 + perm[kk + 1]]] % 12

    let n0 = 0, n1 = 0, n2 = 0, n3 = 0
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0
    if (t0 > 0) { t0 *= t0; n0 = t0 * t0 * (GRAD[gi0][0] * x0 + GRAD[gi0][1] * y0 + GRAD[gi0][2] * z0) }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1
    if (t1 > 0) { t1 *= t1; n1 = t1 * t1 * (GRAD[gi1][0] * x1 + GRAD[gi1][1] * y1 + GRAD[gi1][2] * z1) }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2
    if (t2 > 0) { t2 *= t2; n2 = t2 * t2 * (GRAD[gi2][0] * x2 + GRAD[gi2][1] * y2 + GRAD[gi2][2] * z2) }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3
    if (t3 > 0) { t3 *= t3; n3 = t3 * t3 * (GRAD[gi3][0] * x3 + GRAD[gi3][1] * y3 + GRAD[gi3][2] * z3) }

    return 32 * (n0 + n1 + n2 + n3)
  }
}

/** Fractal Brownian motion — stacked octaves of noise. */
export function fbm(n: Noise3, x: number, y: number, z: number, octaves: number): number {
  let a = 0, f = 1, w = 0.5, s = 0
  for (let i = 0; i < octaves; i++) {
    a += n(x * f, y * f, z * f) * w
    s += w
    f *= 2
    w *= 0.5
  }
  return a / s
}
