/**
 * Pure, worker-friendly v2 terrain compilation.
 *
 * The model is intentionally graph-aligned and has no Three.js, DOM, canvas,
 * worker, or clock dependency. A persistent module worker owns one of these
 * models and derives render buffers from it; callers should not transfer the
 * canonical typed arrays out of that worker.
 */
import { isGas, PALETTES } from '../palettes.js'
import type { PlanetParams, PresetKey } from '../types.js'
import {
  CANONICAL_GRAPH,
  type CanonicalSphereGraph,
  graphVertexCount,
  nearestGraphVertex,
} from './graph.js'

export const V2_GENERATOR_SCHEMA = 'arc-worlds-terrain-v2-1'

/** The only cancellation points in a compile. No phase has hidden async work. */
export const TERRAIN_V2_PHASES = [
  'macro',
  'ridges',
  'hydrology',
  'climate',
  'flow',
  'biomes',
] as const

export type TerrainV2Phase = (typeof TERRAIN_V2_PHASES)[number]

export interface TerrainV2PhaseEvent {
  readonly phase: TerrainV2Phase
  readonly state: 'start' | 'complete'
  /** Present only after a phase completed. Inject `now` in tests if needed. */
  readonly durationMs?: number
}

export interface TerrainV2CompileOptions {
  /** Defaults to the reusable 642-vertex canonical graph. */
  readonly graph?: CanonicalSphereGraph
  /** Checked immediately before and after each named phase. */
  readonly shouldCancel?: (phase: TerrainV2Phase) => boolean
  /** Observability hook for worker instrumentation and cooperative scheduling. */
  readonly onPhase?: (event: TerrainV2PhaseEvent) => void
  /** Injectable clock so timing instrumentation does not affect determinism. */
  readonly now?: () => number
}

/**
 * Async worker variant. `yieldControl` must yield a task (not only a promise
 * microtask) so queued worker messages can set a cancellation flag between
 * phases. The default does that in both browsers and Node test workers.
 */
export interface TerrainV2AsyncCompileOptions extends TerrainV2CompileOptions {
  readonly yieldControl?: () => Promise<void>
}

/** Thrown at a phase boundary; callers can retain their previous artifact. */
export class TerrainV2CancelledError extends Error {
  readonly phase: TerrainV2Phase

  constructor(phase: TerrainV2Phase) {
    super(`v2 terrain compilation cancelled at ${phase}`)
    this.name = 'TerrainV2CancelledError'
    this.phase = phase
  }
}

export const TerrainBiome = {
  DeepOcean: 0,
  Ocean: 1,
  Beach: 2,
  Desert: 3,
  Grassland: 4,
  Forest: 5,
  Rock: 6,
  Tundra: 7,
  Snow: 8,
  Gas: 9,
} as const

export type TerrainBiomeId = (typeof TerrainBiome)[keyof typeof TerrainBiome]

/** Only geography inputs are retained by the canonical worker model. */
export interface TerrainV2GeographyParams {
  readonly seed: number
  readonly preset: PresetKey
  readonly mountains: number
  readonly water: number
  readonly roughness: number
  readonly ice: number
  readonly meanSurfaceTemperatureK: number
  readonly liquidWater: number
  readonly surfaceIce: number
  readonly vegetationPotential: number
  readonly iceLineLatitudeDeg: number
}

/**
 * A worker-owned canonical world. All typed arrays have one entry per graph
 * vertex. They are read-only by convention: transferring them would detach
 * the worker cache, so workers should transfer only derived artifacts.
 */
export interface TerrainV2Model {
  readonly schema: typeof V2_GENERATOR_SCHEMA
  readonly graph: CanonicalSphereGraph
  readonly params: TerrainV2GeographyParams
  readonly canonicalKey: string
  readonly gas: boolean
  /** Sea threshold in canonical elevation units. */
  readonly seaLevel: number
  /** Macro + mountain elevation used by every rendering artifact. */
  readonly elevation: Float32Array
  /** Distance from a plate/ridge boundary, 0 at a boundary and 1 far away. */
  readonly ridgeDistance: Float32Array
  /** Priority-flood elevation; all non-outlets strictly descend to an outlet. */
  readonly filledElevation: Float32Array
  /** -1 for ocean/dry outlets, otherwise a strictly lower adjacent vertex. */
  readonly downslope: Int32Array
  /** Explicit graph outlets used by the depression-safe drainage pass. */
  readonly outlets: Uint8Array
  /** Relative accumulated rainfall runoff, normalized to 0..1. */
  readonly flow: Float32Array
  /** Prevailing-wind moisture after a bounded transport pass, 0..1. */
  readonly moisture: Float32Array
  /** Latitude/elevation/preset-adjusted temperature, 0..1. */
  readonly temperature: Float32Array
  /** Stable biome IDs, never inferred from a render resolution. */
  readonly biome: Uint8Array
}

export interface TerrainV2Sample {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly latitude: number
  readonly elevation: number
  readonly ridgeDistance: number
  readonly filledElevation: number
  readonly flow: number
  readonly moisture: number
  readonly temperature: number
  readonly biome: TerrainBiomeId
}

export interface MutableTerrainV2Sample {
  x: number
  y: number
  z: number
  latitude: number
  elevation: number
  ridgeDistance: number
  filledElevation: number
  flow: number
  moisture: number
  temperature: number
  biome: TerrainBiomeId
}

interface Anchor {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly amplitude: number
  readonly spread: number
}

interface PlateAnchor {
  readonly x: number
  readonly y: number
  readonly z: number
}

const FLOW_EPSILON = 1e-4
const FACE_EPSILON = 1e-12

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value))
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / Math.max(1e-8, edge1 - edge0))
  return t * t * (3 - 2 * t)
}

function geographyValue(value: number): number {
  return Number.isFinite(value) ? clamp(value) : 0.5
}

function snapshotGeography(params: PlanetParams): TerrainV2GeographyParams {
  const climate = params.climate
  return {
    seed: Number.isFinite(params.seed) ? Math.floor(Math.abs(params.seed)) : 0,
    preset: params.preset,
    mountains: geographyValue(params.mountains),
    water: geographyValue(params.water),
    roughness: geographyValue(params.roughness),
    ice: geographyValue(params.ice),
    meanSurfaceTemperatureK: climate?.meanSurfaceTemperatureK ?? 288,
    liquidWater: climate?.liquidWater ?? 1,
    surfaceIce: climate?.surfaceIce ?? geographyValue(params.ice) * 0.25,
    vegetationPotential: climate?.vegetationPotential ?? 1,
    iceLineLatitudeDeg: climate?.iceLineLatitudeDeg ?? 90 - geographyValue(params.ice) * 25,
  }
}

/** A tiny deterministic PRNG kept here so a worker bundle needs no extra dependency. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let result = Math.imul(state ^ (state >>> 15), 1 | state)
    result = (result + Math.imul(result ^ (result >>> 7), 61 | result)) ^ result
    return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296
  }
}

function randomUnit(random: () => number): readonly [number, number, number] {
  const y = random() * 2 - 1
  const angle = random() * Math.PI * 2
  const radius = Math.sqrt(Math.max(0, 1 - y * y))
  return [Math.cos(angle) * radius, y, Math.sin(angle) * radius]
}

function macroAnchors(params: TerrainV2GeographyParams): Anchor[] {
  const random = mulberry32((params.seed ^ 0x4a1d7f3b) >>> 0)
  const anchors: Anchor[] = []
  const continents = 5 + Math.floor(random() * 4)
  const trenches = 4 + Math.floor(random() * 4)
  for (let i = 0; i < continents; i++) {
    const [x, y, z] = randomUnit(random)
    anchors.push({
      x, y, z,
      amplitude: 0.5 + random() * 0.34,
      // exp((dot - 1) / spread): 0.15–0.30 creates continent-scale blobs.
      spread: 0.15 + random() * 0.16,
    })
  }
  for (let i = 0; i < trenches; i++) {
    const [x, y, z] = randomUnit(random)
    anchors.push({
      x, y, z,
      amplitude: -(0.24 + random() * 0.28),
      spread: 0.09 + random() * 0.18,
    })
  }
  return anchors
}

function plateAnchors(params: TerrainV2GeographyParams): PlateAnchor[] {
  const random = mulberry32((params.seed ^ 0x9e3779b9) >>> 0)
  const count = 9 + Math.floor(random() * 4)
  const anchors: PlateAnchor[] = []
  for (let i = 0; i < count; i++) {
    const [x, y, z] = randomUnit(random)
    anchors.push({ x, y, z })
  }
  return anchors
}

function lowFrequencyRelief(seed: number, x: number, y: number, z: number): number {
  const random = mulberry32((seed ^ 0x68bc21eb) >>> 0)
  let total = 0
  let weight = 0
  // Four fixed directional waves break up perfectly round anchor fields while
  // remaining much broader than one canonical graph edge.
  for (let octave = 0; octave < 4; octave++) {
    const [ax, ay, az] = randomUnit(random)
    const frequency = 2 + octave * 1.37 + random() * 0.45
    const amplitude = 1 / (1 + octave)
    total += Math.sin((x * ax + y * ay + z * az) * frequency * Math.PI + random() * Math.PI * 2) * amplitude
    weight += amplitude
  }
  return total / weight
}

function compileMacro(graph: CanonicalSphereGraph, params: TerrainV2GeographyParams): Float32Array {
  const anchors = macroAnchors(params)
  const count = graphVertexCount(graph)
  const elevation = new Float32Array(count)
  for (let index = 0; index < count; index++) {
    const offset = index * 3
    const x = graph.positions[offset]
    const y = graph.positions[offset + 1]
    const z = graph.positions[offset + 2]
    let value = -0.29
    for (const anchor of anchors) {
      const dot = x * anchor.x + y * anchor.y + z * anchor.z
      value += anchor.amplitude * Math.exp((dot - 1) / anchor.spread)
    }
    // Roughness changes interior relief, not graph resolution or coast data.
    value += lowFrequencyRelief(params.seed, x, y, z) * (0.025 + params.roughness * 0.09)
    elevation[index] = clamp(value, -1.1, 1.1)
  }
  return elevation
}

function applyRidges(
  graph: CanonicalSphereGraph,
  params: TerrainV2GeographyParams,
  macro: Float32Array,
): { elevation: Float32Array; ridgeDistance: Float32Array } {
  const plates = plateAnchors(params)
  const count = graphVertexCount(graph)
  const elevation = new Float32Array(count)
  const ridgeDistance = new Float32Array(count)

  for (let index = 0; index < count; index++) {
    const offset = index * 3
    const x = graph.positions[offset]
    const y = graph.positions[offset + 1]
    const z = graph.positions[offset + 2]
    let nearest = -Infinity
    let second = -Infinity
    for (const plate of plates) {
      const dot = x * plate.x + y * plate.y + z * plate.z
      if (dot > nearest) {
        second = nearest
        nearest = dot
      } else if (dot > second) {
        second = dot
      }
    }
    // The dot-product gap is a monotonic approximation of distance to the
    // nearest Voronoi plate boundary. Zero is a boundary, one is far away.
    const distance = clamp((nearest - second) / 0.32)
    ridgeDistance[index] = distance
    const boundary = Math.exp(-Math.pow(distance / 0.24, 2))
    const continental = smoothstep(-0.18, 0.32, macro[index])
    const mountain = boundary * (0.03 + params.mountains * 0.48) * (0.26 + continental * 0.74)
    elevation[index] = clamp(macro[index] + mountain, -1.1, 1.1)
  }
  return { elevation, ridgeDistance }
}

class MinHeap {
  private readonly indexes: number[] = []
  private readonly scores: number[] = []
  score = Number.NaN

  get size(): number {
    return this.indexes.length
  }

  push(index: number, score: number): void {
    let position = this.indexes.length
    this.indexes.push(index)
    this.scores.push(score)
    while (position > 0) {
      const parent = (position - 1) >> 1
      const parentScore = this.scores[parent]
      const parentIndex = this.indexes[parent]
      if (parentScore < score || (parentScore === score && parentIndex <= index)) break
      this.indexes[position] = parentIndex
      this.scores[position] = parentScore
      position = parent
    }
    this.indexes[position] = index
    this.scores[position] = score
  }

  pop(): number {
    const result = this.indexes[0]
    this.score = this.scores[0]
    const endIndex = this.indexes.pop()
    const endScore = this.scores.pop()
    if (this.indexes.length === 0 || endIndex === undefined || endScore === undefined) return result

    let position = 0
    while (true) {
      const left = position * 2 + 1
      if (left >= this.indexes.length) break
      const right = left + 1
      let child = left
      if (right < this.indexes.length) {
        const leftScore = this.scores[left]
        const rightScore = this.scores[right]
        if (rightScore < leftScore || (rightScore === leftScore && this.indexes[right] < this.indexes[left])) child = right
      }
      const childScore = this.scores[child]
      const childIndex = this.indexes[child]
      if (childScore > endScore || (childScore === endScore && childIndex >= endIndex)) break
      this.indexes[position] = childIndex
      this.scores[position] = childScore
      position = child
    }
    this.indexes[position] = endIndex
    this.scores[position] = endScore
    return result
  }
}

function buildHydrology(
  graph: CanonicalSphereGraph,
  elevation: Float32Array,
  seaLevel: number,
  gas: boolean,
): { filledElevation: Float32Array; downslope: Int32Array; outlets: Uint8Array } {
  const count = graphVertexCount(graph)
  const filledElevation = new Float32Array(count)
  const downslope = new Int32Array(count)
  const outlets = new Uint8Array(count)
  const visited = new Uint8Array(count)
  const parent = new Int32Array(count)
  parent.fill(-1)
  const heap = new MinHeap()
  let outletCount = 0
  let lowest = 0

  for (let index = 0; index < count; index++) {
    if (elevation[index] < elevation[lowest]) lowest = index
    if (gas || elevation[index] <= seaLevel) {
      outlets[index] = 1
      visited[index] = 1
      filledElevation[index] = elevation[index]
      heap.push(index, elevation[index])
      outletCount++
    }
  }
  // An intentionally dry world still needs a deterministic outlet so its
  // river graph is acyclic rather than getting stranded in a global minimum.
  if (outletCount === 0) {
    outlets[lowest] = 1
    visited[lowest] = 1
    filledElevation[lowest] = elevation[lowest]
    heap.push(lowest, elevation[lowest])
  }

  while (heap.size > 0) {
    const current = heap.pop()
    const currentElevation = heap.score
    for (let edge = graph.neighborOffsets[current]; edge < graph.neighborOffsets[current + 1]; edge++) {
      const neighbor = graph.neighbors[edge]
      if (visited[neighbor]) continue
      visited[neighbor] = 1
      parent[neighbor] = current
      const filled = Math.max(elevation[neighbor], currentElevation + FLOW_EPSILON)
      filledElevation[neighbor] = filled
      heap.push(neighbor, filled)
    }
  }

  for (let index = 0; index < count; index++) {
    if (outlets[index]) {
      downslope[index] = -1
      continue
    }
    let best = -1
    let bestHeight = Infinity
    for (let edge = graph.neighborOffsets[index]; edge < graph.neighborOffsets[index + 1]; edge++) {
      const neighbor = graph.neighbors[edge]
      const height = filledElevation[neighbor]
      if (height < bestHeight - FLOW_EPSILON * 0.25 || (Math.abs(height - bestHeight) <= FLOW_EPSILON * 0.25 && neighbor < best)) {
        best = neighbor
        bestHeight = height
      }
    }
    // Priority flood guarantees the parent is lower. Retaining it as a
    // fallback protects the invariant against a future numeric representation
    // with coarser precision than Float32.
    downslope[index] = bestHeight < filledElevation[index] ? best : parent[index]
  }
  return { filledElevation, downslope, outlets }
}

function climateBias(preset: PresetKey): { moisture: number; temperature: number } {
  switch (preset) {
    case 'desert': case 'mars': case 'mercury': case 'noachian':
      return { moisture: -0.22, temperature: 0.04 }
    case 'ice': case 'europa': case 'enceladus': case 'triton': case 'pluto':
      return { moisture: 0.04, temperature: -0.22 }
    case 'lava': case 'io': case 'venus':
      return { moisture: -0.16, temperature: 0.2 }
    case 'pandora':
      return { moisture: 0.16, temperature: 0.04 }
    default:
      return { moisture: 0, temperature: 0 }
  }
}

function buildClimate(
  graph: CanonicalSphereGraph,
  params: TerrainV2GeographyParams,
  elevation: Float32Array,
  seaLevel: number,
  gas: boolean,
): { moisture: Float32Array; temperature: Float32Array } {
  const count = graphVertexCount(graph)
  const moisture = new Float32Array(count)
  const next = new Float32Array(count)
  const temperature = new Float32Array(count)
  const bias = climateBias(params.preset)
  const poleGradientK = 42

  for (let index = 0; index < count; index++) {
    const offset = index * 3
    const y = graph.positions[offset + 1]
    const latitude = Math.abs(y)
    const ocean = gas || elevation[index] <= seaLevel
    // Warm equators and low ground hold more water vapour. The explicit
    // latitude term makes polar climate stable even on a rotated graph.
    const localTemperatureK = params.meanSurfaceTemperatureK + 12
      - poleGradientK * Math.pow(latitude, 1.35)
      - Math.max(0, elevation[index] - seaLevel) * 24
    temperature[index] = clamp((localTemperatureK - 230) / 90 + bias.temperature * 0.15)
    const evaporation = 0.08 + params.liquidWater * 0.92
    moisture[index] = clamp(((ocean ? 0.68 : 0.07) + (1 - latitude) * 0.1 + bias.moisture) * evaporation)
  }

  // Eight Jacobi passes are bounded and deterministic. Wind follows latitude
  // bands (westward trade winds near the equator, eastward elsewhere); each
  // pass takes humidity from graph neighbors that sit upwind and loses water
  // when it is forced uphill. There is no stateful simulation after compile.
  for (let pass = 0; pass < 8; pass++) {
    for (let index = 0; index < count; index++) {
      const offset = index * 3
      const x = graph.positions[offset]
      const y = graph.positions[offset + 1]
      const z = graph.positions[offset + 2]
      const latitude = Math.abs(y)
      const windSign = latitude < 0.38 ? -1 : 1
      const windX = -z * windSign
      const windZ = x * windSign
      let incoming = 0
      let incomingCount = 0
      let lift = 0
      for (let edge = graph.neighborOffsets[index]; edge < graph.neighborOffsets[index + 1]; edge++) {
        const neighbor = graph.neighbors[edge]
        const neighborOffset = neighbor * 3
        const toHereX = x - graph.positions[neighborOffset]
        const toHereZ = z - graph.positions[neighborOffset + 2]
        // Neighbor -> cell is aligned with the local prevailing wind.
        if (windX * toHereX + windZ * toHereZ > 0) {
          incoming += moisture[neighbor]
          incomingCount++
          lift += Math.max(0, elevation[index] - elevation[neighbor])
        }
      }
      const ocean = gas || elevation[index] <= seaLevel
      const evaporation = 0.08 + params.liquidWater * 0.92
      const source = ((ocean ? 0.56 : 0.025) + (1 - latitude) * 0.045 + bias.moisture * 0.2) * evaporation
      const carried = incomingCount > 0 ? incoming / incomingCount : moisture[index]
      const rainShadow = incomingCount > 0 ? lift / incomingCount * (0.72 + params.mountains * 0.58) : 0
      next[index] = clamp(source + carried * 0.79 - rainShadow)
    }
    moisture.set(next)
  }
  return { moisture, temperature }
}

function sortedByFilledElevation(filledElevation: Float32Array): Uint32Array {
  const order = new Uint32Array(filledElevation.length)
  for (let index = 0; index < order.length; index++) order[index] = index
  order.sort((a, b) => filledElevation[b] - filledElevation[a] || a - b)
  return order
}

function accumulateFlow(
  elevation: Float32Array,
  seaLevel: number,
  downslope: Int32Array,
  outlets: Uint8Array,
  filledElevation: Float32Array,
  moisture: Float32Array,
  gas: boolean,
): Float32Array {
  const flow = new Float32Array(elevation.length)
  if (gas) return flow
  for (let index = 0; index < flow.length; index++) {
    // Oceans receive flows but do not generate freshwater runoff themselves.
    flow[index] = outlets[index] && elevation[index] <= seaLevel ? 0 : 0.12 + moisture[index] * 0.88
  }
  const order = sortedByFilledElevation(filledElevation)
  for (const index of order) {
    const target = downslope[index]
    if (target >= 0) flow[target] += flow[index]
  }
  let maximum = 0
  for (let index = 0; index < flow.length; index++) maximum = Math.max(maximum, flow[index])
  if (maximum > 0) for (let index = 0; index < flow.length; index++) flow[index] /= maximum
  return flow
}

function classifyBiomes(
  graph: CanonicalSphereGraph,
  params: TerrainV2GeographyParams,
  elevation: Float32Array,
  seaLevel: number,
  moisture: Float32Array,
  temperature: Float32Array,
  gas: boolean,
): Uint8Array {
  const biome = new Uint8Array(elevation.length)
  if (gas) {
    biome.fill(TerrainBiome.Gas)
    return biome
  }
  const dryBias = climateBias(params.preset).moisture
  const iceLine = Math.sin(params.iceLineLatitudeDeg * Math.PI / 180)
  for (let index = 0; index < biome.length; index++) {
    const height = elevation[index]
    if (height <= seaLevel - 0.17) biome[index] = TerrainBiome.DeepOcean
    else if (height <= seaLevel) biome[index] = TerrainBiome.Ocean
    else if (height <= seaLevel + 0.045) biome[index] = TerrainBiome.Beach
    else {
      const offset = index * 3
      const latitude = Math.abs(graph.positions[offset + 1])
      const temp = temperature[index]
      const wet = moisture[index]
      const high = height - seaLevel
      if (temp < 0.2 || (latitude >= iceLine && params.surfaceIce > 0.005)) biome[index] = TerrainBiome.Snow
      else if (temp < 0.34) biome[index] = TerrainBiome.Tundra
      else if (high > 0.5 || (high > 0.3 && wet < 0.3)) biome[index] = TerrainBiome.Rock
      else if (wet + dryBias < 0.28) biome[index] = TerrainBiome.Desert
      else if (wet > 0.58) biome[index] = TerrainBiome.Forest
      else biome[index] = TerrainBiome.Grassland
    }
  }
  return biome
}

function defaultNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function valueKey(value: number): string {
  return Math.round(value * 1_000_000).toString(36)
}

/**
 * A stable identity for reusable worker-owned canonical data. Presentation
 * controls (clouds, light, camera, rings, and presentation detail) are intentionally
 * absent, so changing them cannot trigger terrain compilation.
 */
export function terrainV2CanonicalKey(params: PlanetParams, graph = CANONICAL_GRAPH): string {
  const snapshot = snapshotGeography(params)
  return [
    V2_GENERATOR_SCHEMA,
    graph.schema,
    graph.subdivision,
    snapshot.seed,
    snapshot.preset,
    valueKey(snapshot.mountains),
    valueKey(snapshot.water),
    valueKey(snapshot.roughness),
    valueKey(snapshot.ice),
    valueKey(snapshot.meanSurfaceTemperatureK / 1000),
    valueKey(snapshot.liquidWater),
    valueKey(snapshot.surfaceIce),
    valueKey(snapshot.vegetationPotential),
    valueKey(snapshot.iceLineLatitudeDeg / 90),
  ].join(':')
}

/**
 * Compile one canonical v2 world through bounded pure phases.
 *
 * The supplied graph is never mutated. All rendering paths must resample this
 * returned model rather than rerunning geography at their own resolution.
 */
export function createTerrainV2Model(params: PlanetParams, options: TerrainV2CompileOptions = {}): TerrainV2Model {
  const graph = options.graph ?? CANONICAL_GRAPH
  const geography = snapshotGeography(params)
  const palette = PALETTES[geography.preset] ?? PALETTES.temperate
  const gas = isGas(palette)
  const seaLevel = -0.45 + geography.water * 0.9
  const now = options.now ?? defaultNow

  let macro: Float32Array<ArrayBufferLike> = new Float32Array(0)
  let elevation: Float32Array<ArrayBufferLike> = new Float32Array(0)
  let ridgeDistance: Float32Array<ArrayBufferLike> = new Float32Array(0)
  let filledElevation: Float32Array<ArrayBufferLike> = new Float32Array(0)
  let downslope: Int32Array<ArrayBufferLike> = new Int32Array(0)
  let outlets: Uint8Array<ArrayBufferLike> = new Uint8Array(0)
  let moisture: Float32Array<ArrayBufferLike> = new Float32Array(0)
  let temperature: Float32Array<ArrayBufferLike> = new Float32Array(0)
  let flow: Float32Array<ArrayBufferLike> = new Float32Array(0)
  let biome: Uint8Array<ArrayBufferLike> = new Uint8Array(0)

  const phase = (name: TerrainV2Phase, run: () => void) => {
    if (options.shouldCancel?.(name)) throw new TerrainV2CancelledError(name)
    options.onPhase?.({ phase: name, state: 'start' })
    const start = now()
    run()
    options.onPhase?.({ phase: name, state: 'complete', durationMs: Math.max(0, now() - start) })
    if (options.shouldCancel?.(name)) throw new TerrainV2CancelledError(name)
  }

  phase('macro', () => {
    macro = gas ? new Float32Array(graphVertexCount(graph)) : compileMacro(graph, geography)
  })
  phase('ridges', () => {
    if (gas) {
      elevation = macro
      ridgeDistance = new Float32Array(graphVertexCount(graph))
    } else {
      const ridges = applyRidges(graph, geography, macro)
      elevation = ridges.elevation
      ridgeDistance = ridges.ridgeDistance
    }
  })
  phase('hydrology', () => {
    const hydrology = buildHydrology(graph, elevation, seaLevel, gas)
    filledElevation = hydrology.filledElevation
    downslope = hydrology.downslope
    outlets = hydrology.outlets
  })
  phase('climate', () => {
    const climate = buildClimate(graph, geography, elevation, seaLevel, gas)
    moisture = climate.moisture
    temperature = climate.temperature
  })
  phase('flow', () => {
    flow = accumulateFlow(elevation, seaLevel, downslope, outlets, filledElevation, moisture, gas)
  })
  phase('biomes', () => {
    biome = classifyBiomes(graph, geography, elevation, seaLevel, moisture, temperature, gas)
  })

  return {
    schema: V2_GENERATOR_SCHEMA,
    graph,
    params: geography,
    canonicalKey: terrainV2CanonicalKey(params, graph),
    gas,
    seaLevel,
    elevation,
    ridgeDistance,
    filledElevation,
    downslope,
    outlets,
    flow,
    moisture,
    temperature,
    biome,
  }
}

/** Alias that reads naturally at the worker boundary. */
export const compileTerrainV2 = createTerrainV2Model

function defaultYieldControl(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * Compile the same canonical model while yielding exactly between phases.
 *
 * A synchronous `shouldCancel` check alone cannot observe a `postMessage`
 * until a worker returns to its event loop. This helper makes that boundary
 * explicit while retaining `createTerrainV2Model` as the allocation-free,
 * deterministic synchronous primitive used by pure tests.
 */
export async function compileTerrainV2Async(
  params: PlanetParams,
  options: TerrainV2AsyncCompileOptions = {},
): Promise<TerrainV2Model> {
  const graph = options.graph ?? CANONICAL_GRAPH
  const geography = snapshotGeography(params)
  const palette = PALETTES[geography.preset] ?? PALETTES.temperate
  const gas = isGas(palette)
  const seaLevel = -0.45 + geography.water * 0.9
  const now = options.now ?? defaultNow
  const yieldControl = options.yieldControl ?? defaultYieldControl

  let macro: Float32Array<ArrayBufferLike> = new Float32Array(0)
  let elevation: Float32Array<ArrayBufferLike> = new Float32Array(0)
  let ridgeDistance: Float32Array<ArrayBufferLike> = new Float32Array(0)
  let filledElevation: Float32Array<ArrayBufferLike> = new Float32Array(0)
  let downslope: Int32Array<ArrayBufferLike> = new Int32Array(0)
  let outlets: Uint8Array<ArrayBufferLike> = new Uint8Array(0)
  let moisture: Float32Array<ArrayBufferLike> = new Float32Array(0)
  let temperature: Float32Array<ArrayBufferLike> = new Float32Array(0)
  let flow: Float32Array<ArrayBufferLike> = new Float32Array(0)
  let biome: Uint8Array<ArrayBufferLike> = new Uint8Array(0)

  const phase = async (name: TerrainV2Phase, run: () => void) => {
    if (options.shouldCancel?.(name)) throw new TerrainV2CancelledError(name)
    options.onPhase?.({ phase: name, state: 'start' })
    const start = now()
    run()
    options.onPhase?.({ phase: name, state: 'complete', durationMs: Math.max(0, now() - start) })
    await yieldControl()
    if (options.shouldCancel?.(name)) throw new TerrainV2CancelledError(name)
  }

  await phase('macro', () => {
    macro = gas ? new Float32Array(graphVertexCount(graph)) : compileMacro(graph, geography)
  })
  await phase('ridges', () => {
    if (gas) {
      elevation = macro
      ridgeDistance = new Float32Array(graphVertexCount(graph))
    } else {
      const ridges = applyRidges(graph, geography, macro)
      elevation = ridges.elevation
      ridgeDistance = ridges.ridgeDistance
    }
  })
  await phase('hydrology', () => {
    const hydrology = buildHydrology(graph, elevation, seaLevel, gas)
    filledElevation = hydrology.filledElevation
    downslope = hydrology.downslope
    outlets = hydrology.outlets
  })
  await phase('climate', () => {
    const climate = buildClimate(graph, geography, elevation, seaLevel, gas)
    moisture = climate.moisture
    temperature = climate.temperature
  })
  await phase('flow', () => {
    flow = accumulateFlow(elevation, seaLevel, downslope, outlets, filledElevation, moisture, gas)
  })
  await phase('biomes', () => {
    biome = classifyBiomes(graph, geography, elevation, seaLevel, moisture, temperature, gas)
  })

  return {
    schema: V2_GENERATOR_SCHEMA,
    graph,
    params: geography,
    canonicalKey: terrainV2CanonicalKey(params, graph),
    gas,
    seaLevel,
    elevation,
    ridgeDistance,
    filledElevation,
    downslope,
    outlets,
    flow,
    moisture,
    temperature,
    biome,
  }
}

function edgeSide(ax: number, ay: number, az: number, bx: number, by: number, bz: number, x: number, y: number, z: number): number {
  const cx = ay * bz - az * by
  const cy = az * bx - ax * bz
  const cz = ax * by - ay * bx
  return cx * x + cy * y + cz * z
}

function faceContainsDirection(graph: CanonicalSphereGraph, faceIndex: number, x: number, y: number, z: number): boolean {
  const offset = faceIndex * 3
  const a = graph.faces[offset] * 3
  const b = graph.faces[offset + 1] * 3
  const c = graph.faces[offset + 2] * 3
  return edgeSide(graph.positions[a], graph.positions[a + 1], graph.positions[a + 2], graph.positions[b], graph.positions[b + 1], graph.positions[b + 2], x, y, z) >= -FACE_EPSILON
    && edgeSide(graph.positions[b], graph.positions[b + 1], graph.positions[b + 2], graph.positions[c], graph.positions[c + 1], graph.positions[c + 2], x, y, z) >= -FACE_EPSILON
    && edgeSide(graph.positions[c], graph.positions[c + 1], graph.positions[c + 2], graph.positions[a], graph.positions[a + 1], graph.positions[a + 2], x, y, z) >= -FACE_EPSILON
}

function faceForDirection(graph: CanonicalSphereGraph, nearest: number, x: number, y: number, z: number): number {
  for (let offset = graph.vertexFaceOffsets[nearest]; offset < graph.vertexFaceOffsets[nearest + 1]; offset++) {
    const face = graph.vertexFaces[offset]
    if (faceContainsDirection(graph, face, x, y, z)) return face
  }
  // The nearest vertex normally belongs to the containing triangle. Keep the
  // exhaustive fallback for exact edges and future alternate graph schemas.
  const count = graph.faces.length / 3
  let bestFace = 0
  let bestScore = -Infinity
  for (let face = 0; face < count; face++) {
    if (faceContainsDirection(graph, face, x, y, z)) return face
    const offset = face * 3
    let score = Infinity
    for (let corner = 0; corner < 3; corner++) {
      const a = graph.faces[offset + corner] * 3
      const b = graph.faces[offset + ((corner + 1) % 3)] * 3
      score = Math.min(score, edgeSide(graph.positions[a], graph.positions[a + 1], graph.positions[a + 2], graph.positions[b], graph.positions[b + 1], graph.positions[b + 2], x, y, z))
    }
    if (score > bestScore) {
      bestScore = score
      bestFace = face
    }
  }
  return bestFace
}

function barycentricForDirection(graph: CanonicalSphereGraph, faceIndex: number, x: number, y: number, z: number): readonly [number, number, number] {
  const offset = faceIndex * 3
  const ai = graph.faces[offset] * 3
  const bi = graph.faces[offset + 1] * 3
  const ci = graph.faces[offset + 2] * 3
  const ax = graph.positions[ai]
  const ay = graph.positions[ai + 1]
  const az = graph.positions[ai + 2]
  const bx = graph.positions[bi]
  const by = graph.positions[bi + 1]
  const bz = graph.positions[bi + 2]
  const cx = graph.positions[ci]
  const cy = graph.positions[ci + 1]
  const cz = graph.positions[ci + 2]
  const abx = bx - ax
  const aby = by - ay
  const abz = bz - az
  const acx = cx - ax
  const acy = cy - ay
  const acz = cz - az
  const nx = aby * acz - abz * acy
  const ny = abz * acx - abx * acz
  const nz = abx * acy - aby * acx
  const plane = nx * ax + ny * ay + nz * az
  const scale = plane / Math.max(FACE_EPSILON, nx * x + ny * y + nz * z)
  const qx = x * scale - ax
  const qy = y * scale - ay
  const qz = z * scale - az
  const d00 = abx * abx + aby * aby + abz * abz
  const d01 = abx * acx + aby * acy + abz * acz
  const d11 = acx * acx + acy * acy + acz * acz
  const d20 = qx * abx + qy * aby + qz * abz
  const d21 = qx * acx + qy * acy + qz * acz
  const denominator = d00 * d11 - d01 * d01
  const b = (d11 * d20 - d01 * d21) / denominator
  const c = (d00 * d21 - d01 * d20) / denominator
  const a = 1 - b - c
  // Exact shared edges can be evaluated through either triangle; clamping
  // tiny rounding excursions gives both paths the same canonical endpoint.
  const ca = Math.max(0, a)
  const cb = Math.max(0, b)
  const cc = Math.max(0, c)
  const total = ca + cb + cc
  return [ca / total, cb / total, cc / total]
}

function vertexIntoSample(model: TerrainV2Model, index: number, x: number, y: number, z: number, out: MutableTerrainV2Sample): MutableTerrainV2Sample {
  out.x = x
  out.y = y
  out.z = z
  out.latitude = y
  out.elevation = model.elevation[index]
  out.ridgeDistance = model.ridgeDistance[index]
  out.filledElevation = model.filledElevation[index]
  out.flow = model.flow[index]
  out.moisture = model.moisture[index]
  out.temperature = model.temperature[index]
  out.biome = model.biome[index] as TerrainBiomeId
  return out
}

/** Allocate a scratch sample suitable for repeated `sampleTerrainV2Into` calls. */
export function createTerrainV2Sample(): MutableTerrainV2Sample {
  return {
    x: 0, y: 1, z: 0, latitude: 1, elevation: 0, filledElevation: 0,
    ridgeDistance: 1, flow: 0, moisture: 0, temperature: 0, biome: TerrainBiome.Ocean,
  }
}

/**
 * Resample canonical graph data at any direction. It normalizes inputs, finds
 * the containing spherical triangle, then linearly interpolates scalar data
 * on that triangle. The biome is the deterministic dominant triangle corner.
 */
export function sampleTerrainV2Into(
  model: TerrainV2Model,
  x: number,
  y: number,
  z: number,
  out: MutableTerrainV2Sample,
): MutableTerrainV2Sample {
  const length = Math.hypot(x, y, z)
  const dx = Number.isFinite(length) && length > 1e-12 ? x / length : 0
  const dy = Number.isFinite(length) && length > 1e-12 ? y / length : 1
  const dz = Number.isFinite(length) && length > 1e-12 ? z / length : 0
  const nearest = nearestGraphVertex(model.graph, dx, dy, dz)
  const nearestOffset = nearest * 3
  const nearestDot = model.graph.positions[nearestOffset] * dx
    + model.graph.positions[nearestOffset + 1] * dy
    + model.graph.positions[nearestOffset + 2] * dz
  if (nearestDot > 1 - 1e-12) return vertexIntoSample(model, nearest, dx, dy, dz, out)

  const face = faceForDirection(model.graph, nearest, dx, dy, dz)
  const [wa, wb, wc] = barycentricForDirection(model.graph, face, dx, dy, dz)
  const faceOffset = face * 3
  const a = model.graph.faces[faceOffset]
  const b = model.graph.faces[faceOffset + 1]
  const c = model.graph.faces[faceOffset + 2]
  out.x = dx
  out.y = dy
  out.z = dz
  out.latitude = dy
  out.elevation = model.elevation[a] * wa + model.elevation[b] * wb + model.elevation[c] * wc
  out.ridgeDistance = model.ridgeDistance[a] * wa + model.ridgeDistance[b] * wb + model.ridgeDistance[c] * wc
  out.filledElevation = model.filledElevation[a] * wa + model.filledElevation[b] * wb + model.filledElevation[c] * wc
  out.flow = model.flow[a] * wa + model.flow[b] * wb + model.flow[c] * wc
  out.moisture = model.moisture[a] * wa + model.moisture[b] * wb + model.moisture[c] * wc
  out.temperature = model.temperature[a] * wa + model.temperature[b] * wb + model.temperature[c] * wc
  if (wa >= wb && wa >= wc) out.biome = model.biome[a] as TerrainBiomeId
  else if (wb >= wc) out.biome = model.biome[b] as TerrainBiomeId
  else out.biome = model.biome[c] as TerrainBiomeId
  return out
}

/** Convenience allocating sampler for non-hot paths and tests. */
export function sampleTerrainV2(model: TerrainV2Model, x: number, y: number, z: number): TerrainV2Sample {
  return sampleTerrainV2Into(model, x, y, z, createTerrainV2Sample())
}
