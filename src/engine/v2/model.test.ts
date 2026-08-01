import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from '../../lib/params'
import { buildCanonicalGraph, graphVertexCount } from './graph'
import {
  TerrainBiome,
  TerrainV2CancelledError,
  TERRAIN_V2_PHASES,
  compileTerrainV2Async,
  compileTerrainV2,
  createTerrainV2Model,
  createTerrainV2Sample,
  sampleTerrainV2,
  sampleTerrainV2Into,
  terrainV2CanonicalKey,
  type TerrainV2Model,
} from './model'

// A small fixed graph makes this suite fast while exercising the same graph
// algorithms and interpolation contract as the production 642-cell graph.
const TEST_GRAPH = buildCanonicalGraph(2)

const ARRAY_FIELDS = [
  'elevation',
  'ridgeDistance',
  'filledElevation',
  'downslope',
  'outlets',
  'flow',
  'moisture',
  'temperature',
  'biome',
] as const

function neighborsOf(model: TerrainV2Model, vertex: number): number[] {
  const { graph } = model
  return Array.from(graph.neighbors.subarray(graph.neighborOffsets[vertex], graph.neighborOffsets[vertex + 1]))
}

function expectCanonicalDataEqual(left: TerrainV2Model, right: TerrainV2Model): void {
  expect(left.canonicalKey).toBe(right.canonicalKey)
  expect(left.params).toEqual(right.params)
  expect(left.seaLevel).toBe(right.seaLevel)
  expect(left.gas).toBe(right.gas)
  for (const field of ARRAY_FIELDS) expect(left[field]).toEqual(right[field])
}

function expectFiniteSample(sample: ReturnType<typeof sampleTerrainV2>): void {
  for (const value of [
    sample.x,
    sample.y,
    sample.z,
    sample.latitude,
    sample.elevation,
    sample.filledElevation,
    sample.flow,
    sample.moisture,
    sample.temperature,
  ]) expect(Number.isFinite(value)).toBe(true)
}

describe('the canonical v2 terrain model', () => {
  it('is deterministic and retains only geography in its canonical identity', () => {
    const params = { ...DEFAULT_PARAMS, seed: 721_991, mountains: 0.71, water: 0.46, roughness: 0.63, ice: 0.18 }
    const first = createTerrainV2Model(params, { graph: TEST_GRAPH })
    const second = compileTerrainV2({ ...params }, { graph: TEST_GRAPH })
    expectCanonicalDataEqual(first, second)

    const presentationOnly = createTerrainV2Model({
      ...params,
      clouds: 1,
      glow: 0,
      lightAz: 0.93,
      lightEl: 0.07,
      spinDir: -1,
      spinSpeed: 1,
      rings: true,
      tier: 'flat',
    }, { graph: TEST_GRAPH })
    expectCanonicalDataEqual(first, presentationOnly)
    expect(first.params).toEqual({
      seed: params.seed,
      preset: params.preset,
      mountains: params.mountains,
      water: params.water,
      roughness: params.roughness,
      ice: params.ice,
    })

    const reseeded = createTerrainV2Model({ ...params, seed: params.seed + 1 }, { graph: TEST_GRAPH })
    expect(reseeded.canonicalKey).not.toBe(first.canonicalKey)
    expect(reseeded.elevation).not.toEqual(first.elevation)
    expect(terrainV2CanonicalKey(params, TEST_GRAPH)).toBe(first.canonicalKey)
  })

  it('keeps graph-aligned fields finite, bounded, and depression-safe', () => {
    const model = createTerrainV2Model(DEFAULT_PARAMS, { graph: TEST_GRAPH })
    const count = graphVertexCount(TEST_GRAPH)
    const validBiomes = new Set<number>(Object.values(TerrainBiome))

    for (const field of ARRAY_FIELDS) expect(model[field]).toHaveLength(count)
    expect(model.graph).toBe(TEST_GRAPH)
    expect(model.outlets.some(Boolean)).toBe(true)

    for (let vertex = 0; vertex < count; vertex++) {
      const biome = model.biome[vertex]
      expect(validBiomes.has(biome), `biome ${vertex}`).toBe(true)
      expect(Number.isFinite(model.elevation[vertex]), `elevation ${vertex}`).toBe(true)
      expect(Number.isFinite(model.filledElevation[vertex]), `filled elevation ${vertex}`).toBe(true)
      expect(model.filledElevation[vertex], `priority flood never digs ${vertex}`).toBeGreaterThanOrEqual(model.elevation[vertex])
      expect(model.ridgeDistance[vertex], `ridge distance ${vertex}`).toBeGreaterThanOrEqual(0)
      expect(model.ridgeDistance[vertex], `ridge distance ${vertex}`).toBeLessThanOrEqual(1)
      expect(model.moisture[vertex], `moisture ${vertex}`).toBeGreaterThanOrEqual(0)
      expect(model.moisture[vertex], `moisture ${vertex}`).toBeLessThanOrEqual(1)
      expect(model.temperature[vertex], `temperature ${vertex}`).toBeGreaterThanOrEqual(0)
      expect(model.temperature[vertex], `temperature ${vertex}`).toBeLessThanOrEqual(1)
      expect(model.flow[vertex], `flow ${vertex}`).toBeGreaterThanOrEqual(0)
      expect(model.flow[vertex], `flow ${vertex}`).toBeLessThanOrEqual(1)

      const next = model.downslope[vertex]
      if (model.outlets[vertex]) {
        expect(next, `outlet ${vertex}`).toBe(-1)
      } else {
        expect(next, `downslope for ${vertex}`).toBeGreaterThanOrEqual(0)
        expect(neighborsOf(model, vertex), `downslope is adjacent at ${vertex}`).toContain(next)
        expect(model.filledElevation[next], `downslope descends at ${vertex}`).toBeLessThan(model.filledElevation[vertex])
      }
    }

    // Every non-outlet must reach an explicit outlet within one graph walk.
    // This catches a cycle even when every individual edge appears to descend.
    for (let start = 0; start < count; start++) {
      let current = start
      for (let steps = 0; steps <= count; steps++) {
        if (model.outlets[current]) break
        current = model.downslope[current]
        if (steps === count) throw new Error(`downslope from ${start} did not reach an outlet`)
      }
    }
  })

  it('uses the same stable model contract for gas worlds without invented drainage', () => {
    const gas = createTerrainV2Model({ ...DEFAULT_PARAMS, preset: 'gasAmber', seed: 2_024 }, { graph: TEST_GRAPH })
    expect(gas.gas).toBe(true)
    expect(gas.flow.every((value) => value === 0)).toBe(true)
    expect(gas.biome.every((value) => value === TerrainBiome.Gas)).toBe(true)
    expect(gas.outlets.every(Boolean)).toBe(true)
    expect(gas.downslope.every((value) => value === -1)).toBe(true)
  })

  it('resamples the one canonical model continuously across render seams and poles', () => {
    const model = createTerrainV2Model(DEFAULT_PARAMS, { graph: TEST_GRAPH })

    for (const latitude of [-1.1, -0.45, 0.2, 0.8]) {
      const y = Math.sin(latitude)
      const horizontal = Math.cos(latitude)
      const west = sampleTerrainV2(model, horizontal * Math.cos(-Math.PI), y, horizontal * Math.sin(-Math.PI))
      const east = sampleTerrainV2(model, horizontal * Math.cos(Math.PI), y, horizontal * Math.sin(Math.PI))
      expectFiniteSample(west)
      expectFiniteSample(east)
      expect(west.elevation, `seam elevation at ${latitude}`).toBeCloseTo(east.elevation, 10)
      expect(west.filledElevation, `seam filled elevation at ${latitude}`).toBeCloseTo(east.filledElevation, 10)
      expect(west.flow, `seam flow at ${latitude}`).toBeCloseTo(east.flow, 10)
      expect(west.moisture, `seam moisture at ${latitude}`).toBeCloseTo(east.moisture, 10)
      expect(west.temperature, `seam temperature at ${latitude}`).toBeCloseTo(east.temperature, 10)
    }

    for (const pole of [-1, 1]) {
      const reference = sampleTerrainV2(model, 0, pole, 0)
      for (let longitude = -Math.PI; longitude <= Math.PI; longitude += Math.PI / 4) {
        const latitude = pole > 0 ? Math.PI / 2 : -Math.PI / 2
        const atLongitude = sampleTerrainV2(
          model,
          Math.cos(latitude) * Math.cos(longitude),
          Math.sin(latitude),
          Math.cos(latitude) * Math.sin(longitude),
        )
        expectFiniteSample(atLongitude)
        expect(atLongitude.elevation, `pole ${pole} elevation`).toBeCloseTo(reference.elevation, 10)
        expect(atLongitude.moisture, `pole ${pole} moisture`).toBeCloseTo(reference.moisture, 10)
      }
    }
  })

  it('samples exact graph vertices and writes into caller-owned scratch state', () => {
    const model = createTerrainV2Model(DEFAULT_PARAMS, { graph: TEST_GRAPH })
    const scratch = createTerrainV2Sample()

    for (let vertex = 0; vertex < graphVertexCount(TEST_GRAPH); vertex++) {
      const offset = vertex * 3
      const x = TEST_GRAPH.positions[offset]
      const y = TEST_GRAPH.positions[offset + 1]
      const z = TEST_GRAPH.positions[offset + 2]
      const allocated = sampleTerrainV2(model, x, y, z)
      const returned = sampleTerrainV2Into(model, x, y, z, scratch)
      expect(returned).toBe(scratch)
      expect(scratch).toEqual(allocated)
      expect(allocated.elevation, `elevation at graph vertex ${vertex}`).toBe(model.elevation[vertex])
      expect(allocated.filledElevation, `filled elevation at graph vertex ${vertex}`).toBe(model.filledElevation[vertex])
      expect(allocated.flow, `flow at graph vertex ${vertex}`).toBe(model.flow[vertex])
      expect(allocated.moisture, `moisture at graph vertex ${vertex}`).toBe(model.moisture[vertex])
      expect(allocated.temperature, `temperature at graph vertex ${vertex}`).toBe(model.temperature[vertex])
      expect(allocated.biome, `biome at graph vertex ${vertex}`).toBe(model.biome[vertex])
    }
  })

  it('reports deterministic bounded phases and honours cancellation at a phase boundary', () => {
    let time = 10
    const events: Array<{ phase: string; state: string; durationMs?: number }> = []
    createTerrainV2Model(DEFAULT_PARAMS, {
      graph: TEST_GRAPH,
      now: () => (time += 7),
      onPhase: (event) => events.push(event),
    })

    expect(events.map((event) => `${event.phase}:${event.state}`)).toEqual(
      TERRAIN_V2_PHASES.flatMap((phase) => [`${phase}:start`, `${phase}:complete`]),
    )
    for (const event of events.filter((event) => event.state === 'complete')) expect(event.durationMs).toBe(7)

    try {
      createTerrainV2Model(DEFAULT_PARAMS, {
        graph: TEST_GRAPH,
        shouldCancel: (phase) => phase === 'climate',
      })
      throw new Error('expected compilation to cancel')
    } catch (error) {
      expect(error).toBeInstanceOf(TerrainV2CancelledError)
      expect((error as TerrainV2CancelledError).phase).toBe('climate')
    }
  })

  it('yields between async phases so a worker cancellation flag can be observed', async () => {
    let cancelled = false
    let yields = 0
    const events: string[] = []
    await expect(compileTerrainV2Async(DEFAULT_PARAMS, {
      graph: TEST_GRAPH,
      shouldCancel: () => cancelled,
      onPhase: (event) => events.push(`${event.phase}:${event.state}`),
      yieldControl: async () => {
        yields++
        cancelled = true
      },
    })).rejects.toMatchObject({ name: 'TerrainV2CancelledError', phase: 'macro' })

    expect(yields).toBe(1)
    expect(events).toEqual(['macro:start', 'macro:complete'])
  })
})
