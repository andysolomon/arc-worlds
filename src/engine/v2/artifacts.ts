/**
 * Render artifacts derived from a worker-owned v2 canonical model.
 *
 * These functions only resample `TerrainV2Model`; they never regenerate
 * continents, drainage, climate, or biome data at render resolution. That is
 * the flat/detail identity boundary for v2 worlds.
 */
import { isGas, PALETTES } from '../palettes.js'
import { fbm, makeNoise, type Noise3 } from '../noise.js'
import { ecosystemStyleFor, type EcosystemStyle } from './ecosystems.js'
import {
  createV2CloudField,
  sampleV2CloudMask,
  v2CloudCoverage,
  v2CloudLayerOpacity,
} from './clouds.js'
import {
  TerrainBiome,
  type MutableTerrainV2Sample,
  type TerrainV2Model,
  createTerrainV2Sample,
  sampleTerrainV2Into,
} from './model.js'

export const V2_RELIEF_AMPLITUDE = 0.045
export const V2_FLAT_WIDTH = 256
export const V2_FLAT_HEIGHT = 128
export const V2_DETAIL_WIDTH_SEGMENTS = 150
export const V2_DETAIL_HEIGHT_SEGMENTS = 104
export const V2_DETAIL_MAP_WIDTH = 256
export const V2_DETAIL_MAP_HEIGHT = 128
const V2_ORBIT_CLOUD_WIDTH = 64
const V2_ORBIT_CLOUD_HEIGHT = 32
/**
 * The orbit view's relief map is a quarter of the focused one's area.
 *
 * A body in orbit is a few dozen pixels across, so this is far more texels than
 * it can show — and the slope scaling below is resolution-independent, so the
 * relief reads the same at either size rather than merely similar.
 */
export const V2_ORBIT_RELIEF_WIDTH = 128
export const V2_ORBIT_RELIEF_HEIGHT = 64

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

function sampleWrappedRaster(
  raster: Float32Array,
  width: number,
  height: number,
  u: number,
  v: number,
): number {
  const px = u * width - 0.5
  const py = v * height - 0.5
  const x0 = Math.floor(px)
  const rawY0 = Math.floor(py)
  const y0 = Math.max(0, Math.min(height - 1, rawY0))
  const x1 = ((x0 + 1) % width + width) % width
  const wrappedX0 = (x0 % width + width) % width
  const y1 = Math.max(0, Math.min(height - 1, rawY0 + 1))
  const tx = px - Math.floor(px)
  const ty = Math.max(0, Math.min(1, py - Math.floor(py)))
  const top = raster[y0 * width + wrappedX0] * (1 - tx) + raster[y0 * width + x1] * tx
  const bottom = raster[y1 * width + wrappedX0] * (1 - tx) + raster[y1 * width + x1] * tx
  return top * (1 - ty) + bottom * ty
}

export interface MutableV2Surface {
  /** Canonical elevation plus deterministic presentation-scale relief. */
  elevation: number
  /** Zero-centred fine relief used to vary colour without changing biomes. */
  detail: number
}

export interface V2SurfaceNoise {
  readonly broad: Noise3
  readonly fine: Noise3
}

/** An extra equirectangular RGBA layer alongside a flat artifact's albedo. */
export interface V2FlatLayer {
  readonly width: number
  readonly height: number
  readonly rgba: Uint8Array
}

export interface V2FlatArtifact {
  readonly width: number
  readonly height: number
  readonly rgba: Uint8Array
  /** Alias useful to worker protocols that call texture bytes `pixels`. */
  readonly pixels: Uint8Array
  /** One canonical biome decision per texel, useful for identity diagnostics. */
  readonly biomes: Uint8Array
  /**
   * Clouds as their own tinted layer, for a consumer that wants to hang them
   * on a shell of their own rather than have them flattened into the ground.
   * Null unless `cloudLayer` was asked for, or when the world has no clouds.
   */
  readonly clouds: V2FlatLayer | null
  /** Tangent-space relief, matching the detailed artifact's. Null unless asked for. */
  readonly normalMap: V2FlatLayer | null
}

/**
 * Presentation-only flat-map inputs. They do not affect canonical geography,
 * but must participate in a flat artifact cache identity because clouds are
 * composited into the orbit/flat texture.
 */
export interface V2FlatArtifactOptions {
  readonly clouds?: number
  readonly cloudSeed?: number
  /**
   * Hand clouds back as a separate layer and leave the albedo bare.
   *
   * Compositing them in is cheaper and right for a body drawn a few pixels
   * wide, but it turns cloud cover into a flat white wash over the ground
   * colour — which is why the same world used to read pale and low-contrast in
   * the orbit view and saturated up close. A consumer that can afford a shell
   * asks for this instead and gets the single-world treatment.
   */
  readonly cloudLayer?: boolean
  /**
   * Also derive the relief normal map. Off by default: only a consumer that
   * lights the surface with a standard material has any use for it.
   */
  readonly relief?: boolean
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
  /** Equirectangular presentation relief for the standard material bump map. */
  readonly detailMap: Uint8Array
  readonly normalMap: Uint8Array
  readonly detailMapWidth: number
  readonly detailMapHeight: number
  readonly seaRadius: number
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value))
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / Math.max(1e-8, edge1 - edge0))
  return t * t * (3 - 2 * t)
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


/** Allocate reusable direction scratch for the public direction helpers. */
export function createV2Direction(): MutableV2Direction {
  return { x: 0, y: 1, z: 0 }
}

/** Allocate reusable color scratch for `colorTerrainV2Into`. */
export function createV2Color(): MutableV2Color {
  return { r: 0, g: 0, b: 0 }
}

/**
 * Seeded presentation noise shared by flat and detailed artifacts. Geography
 * stays canonical; this is the equivalent of a reusable bump/detail map and
 * is deliberately derived in the worker instead of per fragment.
 */
export function createV2SurfaceNoise(model: TerrainV2Model): V2SurfaceNoise {
  return {
    broad: makeNoise(model.params.seed ^ 0x6d2b79f5),
    fine: makeNoise(model.params.seed ^ 0x51ed270b),
  }
}

export function createV2Surface(): MutableV2Surface {
  return { elevation: 0, detail: 0 }
}

/**
 * Add multi-frequency relief without moving the canonical coast, climate or
 * drainage model. The low amplitude changes normals and local silhouettes;
 * the graph still decides the large land masses and all simulation fields.
 */
export function sampleV2SurfaceInto(
  model: TerrainV2Model,
  noise: V2SurfaceNoise,
  x: number,
  y: number,
  z: number,
  canonicalElevation: number,
  out: MutableV2Surface,
): MutableV2Surface {
  if (model.gas) {
    out.elevation = canonicalElevation
    out.detail = 0
    return out
  }

  const roughness = clamp(model.params.roughness)
  const mountains = clamp(model.params.mountains)
  const period = Math.max(0.08, model.params.terrainPeriod)
  const octaves = Math.max(1, Math.min(10, Math.round(model.params.terrainOctaves)))
  const broad = fbm(noise.broad, x / period + 7.1, y / period - 2.7, z / period + 4.3, octaves)
  const fine = fbm(noise.fine, x * (7 + octaves) - 5.9, y * (7 + octaves) + 3.7, z * (7 + octaves) - 8.1, Math.min(5, octaves))
  const ridgeNoise = fbm(noise.broad, x * (3.5 + model.params.terrainLacunarity) - 11.3, y * (3.5 + model.params.terrainLacunarity) + 6.2, z * (3.5 + model.params.terrainLacunarity) + 1.9, Math.min(5, octaves))
  const ridged = Math.pow(1 - Math.abs(ridgeNoise), 3) - 0.2
  // Sharpen the broad fractal field into an off-thread terrain-detail layer,
  // centred so it enriches rather than replaces canonical land. This is one
  // of the surface concepts retained from the visual research; clouds,
  // lighting, and atmosphere remain separate Arc Worlds systems.
  const shaped = model.params.terrainType === 'ridged'
    ? 1 - Math.abs(broad) * 2
    : model.params.terrainType === 'plates'
      ? Math.sign(broad) * Math.pow(Math.abs(broad), 0.35)
      : broad
  const sculpted = Math.sign(shaped) * Math.pow(Math.abs(shaped), 1 / Math.max(0.1, model.params.terrainSharpness))
  const detail = (sculpted + model.params.terrainOffset * 0.12) * (0.24 + roughness * 0.22)
    * (0.55 + model.params.terrainAmplitude * 0.45)
    + fine * (0.025 + roughness * 0.045) * model.params.bumpStrength
    + ridged * mountains * (0.05 + roughness * 0.08) * model.params.bumpStrength
    + model.params.bumpOffset * 0.35

  out.elevation = canonicalElevation + detail
  out.detail = detail
  return out
}

/**
 * Apply the user-authored elevation ramp after the scientific biome pass.
 *
 * `transition` chooses where a layer starts and `blend` controls the width of
 * the hand-off from the preceding layer. The ramp is deliberately applied as
 * a strong tint rather than replacing the biome colour: water, ice, moisture,
 * and climate still come from the scientific model, while the artist gets a
 * visible, deterministic elevation palette in both flat and detailed views.
 */
function applyTerrainLayers(
  model: TerrainV2Model,
  elevation: number,
  out: MutableV2Color,
): MutableV2Color {
  const layers = model.params.terrainLayers
  if (!layers.length) return out
  const level = clamp((elevation + 1.1) / 2.2)
  let upperIndex = 1
  while (upperIndex < layers.length && level >= layers[upperIndex].transition) upperIndex++
  const left = layers[Math.max(0, upperIndex - 1)]
  const right = layers[Math.min(upperIndex, layers.length - 1)]
  const between = upperIndex >= layers.length
    ? 0
    : (() => {
        const segment = Math.max(0.02, right.transition - left.transition)
        // Zero is a crisp contour; one uses the whole adjacent elevation
        // interval. This is the same control users see as Blend factor (n→n+1).
        const width = segment * right.blend
        return smoothstep(right.transition - width * 0.5, right.transition + width * 0.5, level)
      })()
  const red = Math.round(((left.color >>> 16) & 0xff) * (1 - between) + ((right.color >>> 16) & 0xff) * between)
  const green = Math.round(((left.color >>> 8) & 0xff) * (1 - between) + ((right.color >>> 8) & 0xff) * between)
  const blue = Math.round((left.color & 0xff) * (1 - between) + (right.color & 0xff) * between)
  // Keep the science visible underneath, but make the authored ramp strong
  // enough that a slider edit cannot disappear beneath the biome palette.
  mixColor(out, (red << 16) | (green << 8) | blue, 0.72)
  return out
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

function colorLivingWorldInto(
  model: TerrainV2Model,
  sample: MutableTerrainV2Sample,
  elevation: number,
  detail: number,
  style: EcosystemStyle,
  out: MutableV2Color,
): MutableV2Color {
  const aboveSea = elevation - model.seaLevel
  if (aboveSea <= 0) {
    const frozen = (1 - smoothstep(0.16, 0.42, sample.temperature)) * model.params.surfaceIce
    if (frozen > 0.02) {
      mixHexLinear(out, style.highRock, style.snow, frozen)
      return out
    }
    if (model.params.liquidWater < 0.08 && model.params.meanSurfaceTemperatureK > 330) {
      mixHexLinear(out, 0x594f46, 0xd0b788, clamp(-aboveSea / 0.42))
      return out
    }
    const depth = clamp(-aboveSea / 0.42)
    // Cyan shallows are the strongest readable cue in the reference: they
    // separate land from ocean before a viewer notices any terrain detail.
    mixHexLinear(out, style.deepWater, style.water, 1 - smoothstep(0.04, 0.88, depth))
    if (aboveSea > -0.045) mixColor(out, style.shallows, smoothstep(-0.045, 0, aboveSea) * 0.38)
    return out
  }

  const beachMix = smoothstep(0.018, 0.07, aboveSea)
  const wet = clamp(sample.moisture)
  const warm = clamp(sample.temperature)
  const vegetation = clamp(model.params.vegetationPotential)
  const forest = smoothstep(0.5, 0.78, wet) * smoothstep(0.25, 0.5, warm) * vegetation
  const ridge = 1 - clamp(sample.ridgeDistance)

  setHexLinear(out, style.beach)
  const grassMix = clamp(forest * 0.55 + (1 - warm) * 0.1)
  const grassR = srgbToLinear((style.grass >>> 16) & 0xff)
  const grassG = srgbToLinear((style.grass >>> 8) & 0xff)
  const grassB = srgbToLinear(style.grass & 0xff)
  let landR = grassR + (srgbToLinear((style.woodland >>> 16) & 0xff) - grassR) * grassMix
  let landG = grassG + (srgbToLinear((style.woodland >>> 8) & 0xff) - grassG) * grassMix
  let landB = grassB + (srgbToLinear(style.woodland & 0xff) - grassB) * grassMix
  landR += (srgbToLinear(0x8b) - landR) * (1 - vegetation)
  landG += (srgbToLinear(0x80) - landG) * (1 - vegetation)
  landB += (srgbToLinear(0x70) - landB) * (1 - vegetation)
  const forestShade = forest * 0.08
  landR += (srgbToLinear((style.detailDark >>> 16) & 0xff) - landR) * forestShade
  landG += (srgbToLinear((style.detailDark >>> 8) & 0xff) - landG) * forestShade
  landB += (srgbToLinear(style.detailDark & 0xff) - landB) * forestShade
  out.r += (landR - out.r) * beachMix
  out.g += (landG - out.g) * beachMix
  out.b += (landB - out.b) * beachMix

  const rockHeight = aboveSea + ridge * model.params.mountains * 0.28
  const rock = smoothstep(0.08, 0.36, rockHeight)
  mixColor(out, style.rock, rock * 0.76)
  const highRock = smoothstep(0.3, 0.65, rockHeight)
  mixColor(out, style.highRock, highRock * 0.9)
  const snow = smoothstep(0.5, 0.86, aboveSea + (0.31 - warm) * 0.85)
    * smoothstep(0.005, 0.3, Math.max(model.params.ice * 0.25, model.params.surfaceIce))
  mixColor(out, style.snow, snow * 0.92)

  // The detail field should read as texture rather than a new biome. Darken
  // troughs and catch peaks lightly, keeping the palette saturated.
  const texture = clamp(Math.abs(detail) * 5.5)
  mixColor(out, detail >= 0 ? style.detailLight : style.detailDark, texture * 0.4)
  if (aboveSea > 0.02 && sample.flow > 0.7 && model.params.liquidWater > 0.2) {
    mixColor(out, style.river, (sample.flow - 0.7) * 0.24 * model.params.liquidWater)
  }
  return out
}

/**
 * Convert a canonical sample to a palette colour in linear RGB. Optional
 * presentation elevation/detail comes from the shared artifact noise above;
 * callers that inspect canonical colors retain the original behavior.
 */
export function colorTerrainV2Into(
  model: TerrainV2Model,
  sample: MutableTerrainV2Sample,
  out: MutableV2Color,
  elevation = sample.elevation,
  detail = 0,
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

  const ecosystem = ecosystemStyleFor(model.params.seed, model.params.preset)
  if (ecosystem) {
    colorLivingWorldInto(model, sample, elevation, detail, ecosystem, out)
    return applyTerrainLayers(model, elevation, out)
  }

  const aboveSea = elevation - model.seaLevel
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
  if (aboveSea <= 0 && model.params.surfaceIce > 0.005) {
    const frozen = (1 - smoothstep(0.16, 0.42, sample.temperature)) * model.params.surfaceIce
    if (frozen > 0) mixColor(out, palette.snow, frozen)
  }
  // Rivers remain part of the same source data. Keep the tint restrained so
  // a low-resolution flat map does not turn every drainage basin blue.
  if (aboveSea > 0.02 && sample.flow > 0.68 && model.params.liquidWater > 0.2) {
    mixColor(out, palette.water, (sample.flow - 0.68) * 0.19 * model.params.liquidWater)
  }
  return applyTerrainLayers(model, elevation, out)
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
    'flat-v2-4',
    Math.max(1, Math.floor(width)),
    Math.max(1, Math.floor(height)),
    Math.round(clouds * 1_000_000),
    cloudSeed,
    // Both change what comes back, so neither may share a cached identity with
    // the composited, relief-less artifact the other consumers ask for.
    options.cloudLayer ? 'shell' : 'baked',
    options.relief ? 'relief' : 'smooth',
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
  const surface = createV2Surface()
  const surfaceNoise = createV2SurfaceNoise(model)
  const color = createV2Color()
  const palette = PALETTES[model.params.preset] ?? PALETTES.temperate
  const cloudCoverage = v2CloudCoverage(
    clamp(options.clouds ?? 0), model.params.liquidWater, model.gas,
  )
  const cloudSeed = Number.isFinite(options.cloudSeed) ? Math.floor(Math.abs(options.cloudSeed!)) : model.params.seed
  const cloudy = !isGas(palette) && cloudCoverage > 0.04
  const cloudField = cloudy ? createV2CloudField(cloudSeed) : null
  const cloudWidth = Math.min(safeWidth, V2_ORBIT_CLOUD_WIDTH)
  const cloudHeight = Math.min(safeHeight, V2_ORBIT_CLOUD_HEIGHT)
  const cloudRaster = cloudy ? new Float32Array(cloudWidth * cloudHeight) : null
  if (cloudRaster) {
    for (let row = 0; row < cloudHeight; row++) {
      for (let column = 0; column < cloudWidth; column++) {
        directionForV2EquirectangularPixel(cloudWidth, cloudHeight, column, row, direction)
        cloudRaster[row * cloudWidth + column] = sampleV2CloudMask(
          cloudField!, cloudCoverage, direction.x, direction.y, direction.z,
        )
      }
    }
  }
  const cloudHex = !isGas(palette) ? palette.cloudTint ?? 0xffffff : 0xffffff
  const cloudOpacity = !isGas(palette)
    ? v2CloudLayerOpacity(palette.cloudO, model.params.preset === 'temperate')
    : 0
  // Asked for as a shell, the clouds stay off the ground entirely; the albedo
  // is the bare surface, exactly what the detailed artifact colours.
  const composite = cloudRaster && !options.cloudLayer
  for (let row = 0; row < safeHeight; row++) {
    for (let column = 0; column < safeWidth; column++) {
      directionForV2EquirectangularPixel(safeWidth, safeHeight, column, row, direction)
      sampleTerrainV2Into(model, direction.x, direction.y, direction.z, sample)
      sampleV2SurfaceInto(
        model, surfaceNoise, direction.x, direction.y, direction.z, sample.elevation, surface,
      )
      colorTerrainV2Into(model, sample, color, surface.elevation, surface.detail)
      if (composite) {
        const alpha = sampleWrappedRaster(
          cloudRaster,
          cloudWidth,
          cloudHeight,
          (column + 0.5) / safeWidth,
          (row + 0.5) / safeHeight,
        ) * cloudOpacity
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

  // The mask is already in hand at its own resolution, so the layer costs one
  // small buffer rather than a second pass over anything.
  let clouds: V2FlatLayer | null = null
  if (cloudRaster && options.cloudLayer) {
    const tint = setHexLinear(createV2Color(), cloudHex)
    const r = linearToSrgbByte(tint.r)
    const g = linearToSrgbByte(tint.g)
    const b = linearToSrgbByte(tint.b)
    const layer = new Uint8Array(cloudWidth * cloudHeight * 4)
    for (let pixel = 0; pixel < cloudWidth * cloudHeight; pixel++) {
      const offset = pixel * 4
      layer[offset] = r
      layer[offset + 1] = g
      layer[offset + 2] = b
      layer[offset + 3] = Math.round(clamp(cloudRaster[pixel] * cloudOpacity) * 255)
    }
    clouds = { width: cloudWidth, height: cloudHeight, rgba: layer }
  }

  const normalMap = options.relief
    ? {
        width: V2_ORBIT_RELIEF_WIDTH,
        height: V2_ORBIT_RELIEF_HEIGHT,
        rgba: deriveV2Relief(
          model, surfaceNoise, V2_ORBIT_RELIEF_WIDTH, V2_ORBIT_RELIEF_HEIGHT,
        ).normalMap,
      }
    : null

  return { width: safeWidth, height: safeHeight, rgba, pixels: rgba, biomes, clouds, normalMap }
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

/**
 * Fine surface relief as a height field and the tangent-space normals derived
 * from it, at whatever resolution the caller can afford.
 *
 * Shared by both artifact kinds so a world's bumps are the same bumps whether
 * it is being sculpted or seen from across its system — parity by construction
 * rather than by two loops that happen to agree today.
 */
function deriveV2Relief(
  model: TerrainV2Model,
  surfaceNoise: V2SurfaceNoise,
  width: number,
  height: number,
): { detailMap: Uint8Array; normalMap: Uint8Array } {
  const direction = createV2Direction()
  const surface = createV2Surface()
  const detailMap = new Uint8Array(width * height)
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      directionForV2EquirectangularPixel(width, height, column, row, direction)
      sampleV2SurfaceInto(model, surfaceNoise, direction.x, direction.y, direction.z, 0, surface)
      detailMap[row * width + column] = Math.round(clamp(0.5 + surface.detail / 0.6) * 255)
    }
  }

  // A one-texel step spans more of the surface at a coarser resolution, so the
  // finite difference below grows in inverse proportion to the width. Scaling
  // the slope back by it keeps the apparent steepness fixed, which is what lets
  // the orbit view run a smaller map without looking like a rougher world.
  const slope = 3.5 * (width / V2_DETAIL_MAP_WIDTH)
  const normalMap = new Uint8Array(width * height * 4)
  for (let row = 0; row < height; row++) {
    const north = Math.max(0, row - 1)
    const south = Math.min(height - 1, row + 1)
    for (let column = 0; column < width; column++) {
      const west = (column + width - 1) % width
      const east = (column + 1) % width
      let nx = (detailMap[row * width + west] - detailMap[row * width + east]) / 255 * slope
      let ny = (detailMap[north * width + column] - detailMap[south * width + column]) / 255 * slope
      let nz = 1
      const length = Math.hypot(nx, ny, nz)
      nx /= length
      ny /= length
      nz /= length
      const offset = (row * width + column) * 4
      normalMap[offset] = Math.round((nx * 0.5 + 0.5) * 255)
      normalMap[offset + 1] = Math.round((ny * 0.5 + 0.5) * 255)
      normalMap[offset + 2] = Math.round((nz * 0.5 + 0.5) * 255)
      normalMap[offset + 3] = 255
    }
  }
  return { detailMap, normalMap }
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
  const surface = createV2Surface()
  const surfaceNoise = createV2SurfaceNoise(model)
  const color = createV2Color()

  for (let iy = 0; iy <= heightSegments; iy++) {
    for (let ix = 0; ix <= widthSegments; ix++) {
      const index = iy * rowLength + ix
      const offset = index * 3
      directionForV2DetailVertex(widthSegments, heightSegments, ix, iy, direction)
      sampleTerrainV2Into(model, direction.x, direction.y, direction.z, sample)
      sampleV2SurfaceInto(
        model, surfaceNoise, direction.x, direction.y, direction.z, sample.elevation, surface,
      )
      const radius = 1 + surface.elevation * V2_RELIEF_AMPLITUDE
      positions[offset] = direction.x * radius
      positions[offset + 1] = direction.y * radius
      positions[offset + 2] = direction.z * radius
      colorTerrainV2Into(model, sample, color, surface.elevation, surface.detail)
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

  const relief = deriveV2Relief(
    model, surfaceNoise, V2_DETAIL_MAP_WIDTH, V2_DETAIL_MAP_HEIGHT,
  )
  const detailMap = relief.detailMap
  const normalMap = relief.normalMap

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
    detailMap,
    normalMap,
    detailMapWidth: V2_DETAIL_MAP_WIDTH,
    detailMapHeight: V2_DETAIL_MAP_HEIGHT,
    seaRadius,
  }
}
