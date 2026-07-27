import * as THREE from 'three'
import { fbm, makeNoise } from './noise'
import { RING_FRAG, RING_VERT } from './shaders'
import type { Palette, PlanetParams, RingConfig } from './types'

/** Shared noise for moon surfaces and tone maps — not world-seed dependent. */
const mNoise = makeNoise(9182)

export function ringMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: null },
      uHasMap: { value: 0 },
      uColor: { value: new THREE.Color(0xffffff) },
      uOpacity: { value: 1 },
      uL: { value: new THREE.Vector3(1, 0, 0) },
      uFace: { value: 1 },
      uProfile: { value: 0 },
      uBandCount: { value: 0 },
      uBands: {
        value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()],
      },
    },
    vertexShader: RING_VERT,
    fragmentShader: RING_FRAG,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
  })
}

/**
 * A ring disc whose UV.x runs 0→1 from inner to outer edge, so the shader can
 * address radial position directly rather than reconstructing it.
 */
export function ringGeo(inner: number, outer: number): THREE.RingGeometry {
  const g = new THREE.RingGeometry(inner, outer, 192, 1)
  const p = g.attributes.position
  const uv = g.attributes.uv
  for (let i = 0; i < p.count; i++) {
    const d = (Math.hypot(p.getX(i), p.getY(i)) - inner) / Math.max(1e-6, outer - inner)
    uv.setXY(i, Math.min(1, Math.max(0, d)), 0.5)
  }
  return g
}

const toneCache: Record<string, THREE.CanvasTexture> = {}

/**
 * Two-tone moon surface — Iapetus's Cassini Regio: a dark cap centred on the
 * leading hemisphere with a ragged edge, and bright poles.
 */
export function toneTex(light: number, dark: number): THREE.CanvasTexture {
  const key = `${light}:${dark}`
  const cached = toneCache[key]
  if (cached) return cached

  const w = 384
  const h = 192
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const ctx = cv.getContext('2d')!
  const img = ctx.createImageData(w, h)

  const lr = (light >> 16) & 255, lg = (light >> 8) & 255, lb = light & 255
  const dr = (dark >> 16) & 255, dg = (dark >> 8) & 255, db = dark & 255

  for (let y = 0; y < h; y++) {
    const phi = ((y + 0.5) / h) * Math.PI
    const sp = Math.sin(phi)
    const cp = Math.cos(phi)
    for (let x = 0; x < w; x++) {
      const th = ((x + 0.5) / w) * 2 * Math.PI
      const dx = sp * Math.cos(th), dy = cp, dz = sp * Math.sin(th)
      const edge = dx + fbm(mNoise, dx * 3.1, dy * 3.1, dz * 3.1, 4) * 0.55
      let t = Math.min(1, Math.max(0, (edge - 0.05) / 0.42))
      t *= Math.min(1, Math.max(0, (0.8 - Math.abs(dy)) / 0.22))
      const g = fbm(mNoise, dx * 9 + 4, dy * 9 + 4, dz * 9 + 4, 3) * 0.1 + 0.95
      const o = (y * w + x) * 4
      img.data[o] = Math.min(255, (lr + (dr - lr) * t) * g)
      img.data[o + 1] = Math.min(255, (lg + (dg - lg) * t) * g)
      img.data[o + 2] = Math.min(255, (lb + (db - lb) * t) * g)
      img.data[o + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)

  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  toneCache[key] = tex
  return tex
}

/** Spheres for round moons; lumpy icosahedra for the captured irregulars. */
export function moonGeo(r: number, irr?: [number, number, number]): THREE.BufferGeometry {
  if (!irr) return new THREE.SphereGeometry(r, 22, 16)
  const g = new THREE.IcosahedronGeometry(r, 2)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    const n = 1 + fbm(mNoise, (x / r) * 1.6, (y / r) * 1.6, (z / r) * 1.6, 3) * 0.22
    p.setXYZ(i, x * n * irr[0], y * n * irr[1], z * n * irr[2])
  }
  g.computeVertexNormals()
  return g
}

/** Build a ring config from the sculptor's procedural ring sliders. */
export function customRing(P: PlanetParams, pal: Palette): RingConfig {
  const n = Math.max(1, Math.min(4, P.ringN | 0))
  const inner = 1.14 + (P.ringInner ?? 0.24) * 1.05
  const width = 0.07 + (P.ringWidth ?? 0.5) * 1.55
  const g = P.ringGap ?? 0.35
  const op = P.ringOpacity ?? 0.7

  const bands: Array<[number, number, number, number]> = []
  const gap = n > 1 ? (g * 0.5) / n : 0
  for (let i = 0; i < n; i++) {
    const u0 = i / n + (i > 0 ? gap : 0)
    const u1 = (i + 1) / n - (i < n - 1 ? gap : 0)
    bands.push([u0, u1, Math.max(0.06, op * (0.82 + (0.18 * ((i * 73) % 3)) / 2)), 0.82 + 0.18 * (i % 2)])
  }

  const fallback = 'sand' in pal ? pal.sand : 0xffffff
  return { inner, outer: inner + width, color: P.ringColor ?? fallback, opacity: 1, bands }
}
