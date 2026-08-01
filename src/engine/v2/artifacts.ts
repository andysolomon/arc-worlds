/**
 * Render artifacts derived from a worker-owned v2 canonical model.
 *
 * These functions only resample `TerrainV2Model`; they never regenerate
 * continents, drainage, climate, or biome data at render resolution. That is
 * the flat/detail identity boundary for v2 worlds.
 */
import { isGas, PALETTES } from '../palettes.js'
import {
  TerrainBiome,
  type MutableTerrainV2Sample,
  type TerrainV2Model,
  createTerrainV2Sample,
  sampleTerrainV2Into,
} from './model.js'

export const V2_RELIEF_AMPLITUDE = 0.035
export const V2_FLAT_WIDTH = 256
export const V2_FLAT_HEIGHT = 128
export const V2_DETAIL_WIDTH_SEGMENTS = 150
export const V2_DETAIL_HEIGHT_SEGMENTS = 104

export interface MutableV2Direction {
  x: number
  y: number
  z: number
}

export interface MutableV2Color {
  r: number
  g: number
  b: number
}

export interface V2FlatArtifact {
  readonly width: number
  readonly height: number
  readonly rgba: Uint8Array
  /** Alias useful to worker protocols that call texture bytes `pixels`. */
  readonly pixels: Uint8Array
  /** One canonical biome decision per texel, useful for identity diagnostics. */
  readonly biomes: Uint8Array
}

/**
 * Presentation-only flat-map inputs. They do not affect canonical geography,
 * but must participate in a flat artifact cache identity because clouds are
 * composited into the orbit/flat texture.
 */
export interface V2FlatArtifactOptions {
  readonly clouds?: number
  readonly cloudSeed?: number
}

export interface V2DetailOptions {
  readonly widthSegments?: number
  readonly heightSegments?: number
}

export interface V2DetailedArtifact {
  readonly widthSegments: number
  readonly heightSegments: number
  readonly positions: Float32Array
  readonly colors: Float32Array
  readonly normals: Float32Array
  /** Singular aliases make direct BufferAttribute installation unambiguous. */
  readonly position: Float32Array
  readonly color: Float32Array
  readonly normal: Float32Array
  readonly biomes: Uint8Array
  readonly seaRadius: number
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value))
}

function srgbToLinear(value: number): number {
  const v = value / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

/** Linear working colour to the same byte transfer used by the v1 baker. */
export function linearToSrgbByte(value: number): number {
  const v = clamp(value)
  const srgb = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
  return Math.round(srgb * 255)
}

function setHexLinear(out: MutableV2Color, hex: number): MutableV2Color {
  out.r = srgbToLinear((hex >>> 16) & 0xff)
  out.g = srgbToLinear((hex >>> 8) & 0xff)
  out.b = srgbToLinear(hex & 0xff)
  return out
}

function mixHexLinear(out: MutableV2Color, a: number, b: number, amount: number): MutableV2Color {
  const t = clamp(amount)
  const ar = srgbToLinear((a >>> 16) & 0xff)
  const ag = srgbToLinear((a >>> 8) & 0xff)
  const ab = srgbToLinear(a & 0xff)
  const br = srgbToLinear((b >>> 16) & 0xff)
  const bg = srgbToLinear((b >>> 8) & 0xff)
  const bb = srgbToLinear(b & 0xff)
  out.r = ar + (br - ar) * t
  out.g = ag + (bg - ag) * t
  out.b = ab + (bb - ab) * t
  return out
}

function mixColor(out: MutableV2Color, hex: number, amount: number): MutableV2Color {
  const t = clamp(amount)
  out.r += (srgbToLinear((hex >>> 16) & 0xff) - out.r) * t
  out.g += (srgbToLinear((hex >>> 8) & 0xff) - out.g) * t
  out.b += (srgbToLinear(hex & 0xff) - out.b) * t
  return out
}

function cloudNoise(seed: number, x: number, y: number, z: number): number {
  // A handful of seeded broad directional waves are enough at orbit-map
  // resolution and avoid importing the v1 simplex implementation into the
  // separate v2 worker chunk. The result is stable in 3D, so it has no map
  // seam or pole singularity.
  let state = (seed ^ 0x5bd1e995) >>> 0
  let total = 0
  let weight = 0
  for (let octave = 0; octave < 4; octave++) {
    state = (state + 0x6d2b79f5) | 0
    const a = Math.sin(state * 0.0000137) * 0.83
    const b = Math.sin((state ^ 0x9e3779b9) * 0.0000211) * 0.83
    const c = Math.sin((state ^ 0x85ebca6b) * 0.0000173) * 0.83
    const phase = ((state >>> 0) / 4_294_967_296) * Math.PI * 2
    const amplitude = 1 / (1 + octave)
    total += (Math.sin((x * a + y * b + z * c) * (2.5 + octave * 1.8) * Math.PI + phase) * 0.5 + 0.5) * amplitude
    weight += amplitude
  }
  return total / weight
}

/** Allocate reusable direction scratch for the public direction helpers. */
export function createV2Direction(): MutableV2Direction {
  return { x: 0, y: 1, z: 0 }
}

/** Allocate reusable color scratch for `colorTerrainV2Into`. */
export function createV2Color(): MutableV2Color {
  return { r: 0, g: 0, b: 0 }
}

/**
 * Direction of a v2 equirectangular texel, matching the existing flat-bake
 * convention: north is the first row and longitude increases through +z.
 */
export function directionForV2EquirectangularPixel(
  width: number,
  height: number,
  column: number,
  row: number,
  out: MutableV2Direction = createV2Direction(),
): MutableV2Direction {
  const latitude = ((row + 0.5) / height) * Math.PI
  const longitude = ((column + 0.5) / width) * Math.PI * 2
  const horizontal = Math.sin(latitude)
  out.x = horizontal * Math.cos(longitude)
  out.y = Math.cos(latitude)
  out.z = horizontal * Math.sin(longitude)
  return out
}

/**
 * Direction of one Three.js `SphereGeometry(1, widthSegments, heightSegments)`
 * vertex. The row-major indexing is `iy * (widthSegments + 1) + ix`.
 */
export function directionForV2DetailVertex(
  widthSegments: number,
  heightSegments: number,
  ix: number,
  iy: number,
  out: MutableV2Direction = createV2Direction(),
): MutableV2Direction {
  const polar = (iy / heightSegments) * Math.PI
  const horizontal = Math.sin(polar)
  if (iy === 0) {
    out.x = 0
    out.y = 1
    out.z = 0
  } else if (iy === heightSegments) {
    out.x = 0
    out.y = -1
    out.z = 0
  } else if (ix === 0 || ix === widthSegments) {
    // Make the UV seam bit-identical instead of leaving a sin(2π) epsilon.
    out.x = -horizontal
    out.y = Math.cos(polar)
    out.z = 0
  } else {
    const longitude = (ix / widthSegments) * Math.PI * 2
    out.x = -horizontal * Math.cos(longitude)
    out.y = Math.cos(polar)
    out.z = horizontal * Math.sin(longitude)
  }
  return out
}

/**
 * Convert a canonical sample to a palette colour in linear RGB. Rivers are a
 * very subtle value-layer blend rather than another render object or shader.
 */
export function colorTerrainV2Into(
  model: TerrainV2Model,
  sample: MutableTerrainV2Sample,
  out: MutableV2Color,
): MutableV2Color {
  const palette = PALETTES[model.params.preset] ?? PALETTES.temperate
  if (isGas(palette)) {
    const position = clamp(sample.latitude * 0.5 + 0.5)
    let left = palette.bands[0]
    let right = palette.bands[palette.bands.length - 1]
    for (let index = 0; index < palette.bands.length - 1; index++) {
      if (position >= palette.bands[index][0] && position <= palette.bands[index + 1][0]) {
        left = palette.bands[index]
        right = palette.bands[index + 1]
        break
      }
    }
    return mixHexLinear(out, left[1], right[1], (position - left[0]) / Math.max(1e-8, right[0] - left[0]))
  }

  const aboveSea = sample.elevation - model.seaLevel
  switch (sample.biome) {
    case TerrainBiome.DeepOcean:
      mixHexLinear(out, palette.deep, palette.water, clamp((sample.elevation - (model.seaLevel - 0.48)) / 0.48) * 0.2)
      break
    case TerrainBiome.Ocean:
      mixHexLinear(out, palette.deep, palette.water, 0.45 + clamp(aboveSea / 0.17) * 0.55)
      break
    case TerrainBiome.Beach:
      mixHexLinear(out, palette.water, palette.sand, clamp(aboveSea / 0.06) * 0.82 + 0.18)
      break
    case TerrainBiome.Desert:
      mixHexLinear(out, palette.sand, palette.low, clamp(aboveSea / 0.48) * 0.38)
      break
    case TerrainBiome.Grassland:
      mixHexLinear(out, palette.low, palette.mid, clamp(aboveSea / 0.68) * 0.34)
      break
    case TerrainBiome.Forest:
      mixHexLinear(out, palette.low, palette.mid, 0.6 + clamp(sample.moisture - 0.58) * 0.3)
      break
    case TerrainBiome.Rock:
      mixHexLinear(out, palette.mid, palette.high, 0.56 + clamp(aboveSea / 0.8) * 0.34)
      break
    case TerrainBiome.Tundra:
      mixHexLinear(out, palette.high, palette.snow, 0.38 + clamp(0.34 - sample.temperature) * 0.8)
      break
    case TerrainBiome.Snow:
      mixHexLinear(out, palette.high, palette.snow, 0.78 + clamp(0.2 - sample.temperature) * 0.9)
      break
    default:
      setHexLinear(out, palette.low)
  }
  // Rivers remain part of the same source data. Keep the tint restrained so
  // a low-resolution flat map does not turn every drainage basin blue.
  if (aboveSea > 0.02 && sample.flow > 0.68) mixColor(out, palette.water, (sample.flow - 0.68) * 0.19)
  return out
}

/**
 * Flat artifact cache identity. Clouds intentionally live here rather than in
 * `terrainV2CanonicalKey`: a weather/presentation edit must not rebuild the
 * worker-owned continental model, but it must not reuse stale composited RGBA.
 */
export function terrainV2FlatArtifactKey(
  model: TerrainV2Model,
  width = V2_FLAT_WIDTH,
  height = V2_FLAT_HEIGHT,
  options: V2FlatArtifactOptions = {},
): string {
  const clouds = clamp(options.clouds ?? 0)
  const cloudSeed = Number.isFinite(options.cloudSeed) ? Math.floor(Math.abs(options.cloudSeed!)) : model.params.seed
  return [
    model.canonicalKey,
    'flat-v2-1',
    Math.max(1, Math.floor(width)),
    Math.max(1, Math.floor(height)),
    Math.round(clouds * 1_000_000),
    cloudSeed,
  ].join(':')
}

/** Derive an opaque equirectangular map from an already-compiled model. */
export function deriveV2FlatArtifact(
  model: TerrainV2Model,
  width = V2_FLAT_WIDTH,
  height = V2_FLAT_HEIGHT,
  options: V2FlatArtifactOptions = {},
): V2FlatArtifact {
  const safeWidth = Math.max(1, Math.floor(width))
  const safeHeight = Math.max(1, Math.floor(height))
  const rgba = new Uint8Array(safeWidth * safeHeight * 4)
  const biomes = new Uint8Array(safeWidth * safeHeight)
  const direction = createV2Direction()
  const sample = createTerrainV2Sample()
  const color = createV2Color()
  const palette = PALETTES[model.params.preset] ?? PALETTES.temperate
  const cloudCoverage = clamp(options.clouds ?? 0)
  const cloudSeed = Number.isFinite(options.cloudSeed) ? Math.floor(Math.abs(options.cloudSeed!)) : model.params.seed
  const cloudy = !isGas(palette) && cloudCoverage > 0.04
  const cloudHex = !isGas(palette) ? palette.cloudTint ?? 0xffffff : 0xffffff
  const cloudOpacity = !isGas(palette) ? palette.cloudO * (235 / 255) : 0
  for (let row = 0; row < safeHeight; row++) {
    for (let column = 0; column < safeWidth; column++) {
      directionForV2EquirectangularPixel(safeWidth, safeHeight, column, row, direction)
      sampleTerrainV2Into(model, direction.x, direction.y, direction.z, sample)
      colorTerrainV2Into(model, sample, color)
      if (cloudy) {
        const threshold = 0.78 - cloudCoverage * 0.55
        const alpha = clamp((cloudNoise(cloudSeed, direction.x, direction.y, direction.z) - threshold) / 0.22) * cloudOpacity
        if (alpha > 0) mixColor(color, cloudHex, alpha)
      }
      const pixel = row * safeWidth + column
      const offset = pixel * 4
      rgba[offset] = linearToSrgbByte(color.r)
      rgba[offset + 1] = linearToSrgbByte(color.g)
      rgba[offset + 2] = linearToSrgbByte(color.b)
      rgba[offset + 3] = 255
      biomes[pixel] = sample.biome
    }
  }
  return { width: safeWidth, height: safeHeight, rgba, pixels: rgba, biomes }
}

/** Compatibility-shaped convenience for callers that only need raw texture bytes. */
export function bakeV2Flat(
  model: TerrainV2Model,
  width = V2_FLAT_WIDTH,
  height = V2_FLAT_HEIGHT,
  options: V2FlatArtifactOptions = {},
): Uint8Array {
  return deriveV2FlatArtifact(model, width, height, options).rgba
}

function addFaceNormal(positions: Float32Array, normals: Float32Array, a: number, b: number, c: number): void {
  const ao = a * 3
  const bo = b * 3
  const co = c * 3
  const abx = positions[bo] - positions[ao]
  const aby = positions[bo + 1] - positions[ao + 1]
  const abz = positions[bo + 2] - positions[ao + 2]
  const acx = positions[co] - positions[ao]
  const acy = positions[co + 1] - positions[ao + 1]
  const acz = positions[co + 2] - positions[ao + 2]
  let nx = aby * acz - abz * acy
  let ny = abz * acx - abx * acz
  let nz = abx * acy - aby * acx
  // Ensure outward winding even if a caller later changes mesh row order.
  const radial = nx * (positions[ao] + positions[bo] + positions[co])
    + ny * (positions[ao + 1] + positions[bo + 1] + positions[co + 1])
    + nz * (positions[ao + 2] + positions[bo + 2] + positions[co + 2])
  if (radial < 0) {
    nx = -nx
    ny = -ny
    nz = -nz
  }
  normals[ao] += nx; normals[ao + 1] += ny; normals[ao + 2] += nz
  normals[bo] += nx; normals[bo + 1] += ny; normals[bo + 2] += nz
  normals[co] += nx; normals[co + 1] += ny; normals[co + 2] += nz
}

function normalizeNormal(normals: Float32Array, positions: Float32Array, index: number): void {
  const offset = index * 3
  let x = normals[offset]
  let y = normals[offset + 1]
  let z = normals[offset + 2]
  let length = Math.hypot(x, y, z)
  if (!(length > 1e-12)) {
    x = positions[offset]
    y = positions[offset + 1]
    z = positions[offset + 2]
    length = Math.hypot(x, y, z)
  }
  normals[offset] = x / length
  normals[offset + 1] = y / length
  normals[offset + 2] = z / length
}

/**
 * Build a Three.js-compatible UV-sphere attribute set from the canonical
 * model. Normals are calculated from the derived position buffer here so the
 * main thread never has to call `computeVertexNormals()` for v2 terrain.
 */
export function deriveV2DetailedArtifact(
  model: TerrainV2Model,
  options: V2DetailOptions = {},
): V2DetailedArtifact {
  const widthSegments = Math.max(3, Math.floor(options.widthSegments ?? V2_DETAIL_WIDTH_SEGMENTS))
  const heightSegments = Math.max(2, Math.floor(options.heightSegments ?? V2_DETAIL_HEIGHT_SEGMENTS))
  const rowLength = widthSegments + 1
  const count = rowLength * (heightSegments + 1)
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const normals = new Float32Array(count * 3)
  const biomes = new Uint8Array(count)
  const direction = createV2Direction()
  const sample = createTerrainV2Sample()
  const color = createV2Color()

  for (let iy = 0; iy <= heightSegments; iy++) {
    for (let ix = 0; ix <= widthSegments; ix++) {
      const index = iy * rowLength + ix
      const offset = index * 3
      directionForV2DetailVertex(widthSegments, heightSegments, ix, iy, direction)
      sampleTerrainV2Into(model, direction.x, direction.y, direction.z, sample)
      const radius = 1 + sample.elevation * V2_RELIEF_AMPLITUDE
      positions[offset] = direction.x * radius
      positions[offset + 1] = direction.y * radius
      positions[offset + 2] = direction.z * radius
      colorTerrainV2Into(model, sample, color)
      colors[offset] = color.r
      colors[offset + 1] = color.g
      colors[offset + 2] = color.b
      biomes[index] = sample.biome
    }
  }

  for (let iy = 0; iy < heightSegments; iy++) {
    for (let ix = 0; ix < widthSegments; ix++) {
      const a = iy * rowLength + ix
      const b = a + rowLength
      const c = b + 1
      const d = a + 1
      addFaceNormal(positions, normals, a, b, d)
      addFaceNormal(positions, normals, b, c, d)
    }
  }
  for (let index = 0; index < count; index++) normalizeNormal(normals, positions, index)

  // UV-sphere seams and duplicate pole vertices must agree exactly. Otherwise
  // MeshStandardMaterial can show a 1-pixel lighting seam despite identical
  // canonical terrain values.
  for (let iy = 0; iy <= heightSegments; iy++) {
    const first = iy * rowLength
    const last = first + widthSegments
    const firstOffset = first * 3
    const lastOffset = last * 3
    if (iy === 0 || iy === heightSegments) {
      for (let ix = 0; ix <= widthSegments; ix++) {
        const index = iy * rowLength + ix
        const offset = index * 3
        normals[offset] = 0
        normals[offset + 1] = iy === 0 ? 1 : -1
        normals[offset + 2] = 0
      }
    } else {
      const x = normals[firstOffset] + normals[lastOffset]
      const y = normals[firstOffset + 1] + normals[lastOffset + 1]
      const z = normals[firstOffset + 2] + normals[lastOffset + 2]
      const length = Math.hypot(x, y, z)
      normals[firstOffset] = x / length
      normals[firstOffset + 1] = y / length
      normals[firstOffset + 2] = z / length
      normals[lastOffset] = normals[firstOffset]
      normals[lastOffset + 1] = normals[firstOffset + 1]
      normals[lastOffset + 2] = normals[firstOffset + 2]
    }
  }

  const seaRadius = 1 + model.seaLevel * V2_RELIEF_AMPLITUDE
  return {
    widthSegments,
    heightSegments,
    positions,
    colors,
    normals,
    position: positions,
    color: colors,
    normal: normals,
    biomes,
    seaRadius,
  }
}
