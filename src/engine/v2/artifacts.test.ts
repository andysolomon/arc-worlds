import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from '../../lib/params'
import { buildCanonicalGraph } from './graph'
import {
  V2_RELIEF_AMPLITUDE,
  V2_DETAIL_MAP_HEIGHT,
  V2_DETAIL_MAP_WIDTH,
  bakeV2Flat,
  colorTerrainV2Into,
  createV2Color,
  createV2Surface,
  createV2SurfaceNoise,
  deriveV2DetailedArtifact,
  deriveV2FlatArtifact,
  directionForV2DetailVertex,
  directionForV2EquirectangularPixel,
  linearToSrgbByte,
  sampleV2SurfaceInto,
  terrainV2FlatArtifactKey,
} from './artifacts'
import { createTerrainV2Model, createTerrainV2Sample, sampleTerrainV2Into } from './model'

const TEST_GRAPH = buildCanonicalGraph(2)
const FLAT_WIDTH = 16
const FLAT_HEIGHT = 8
const DETAIL_WIDTH = 12
const DETAIL_HEIGHT = 8

function expectTripletClose(
  actual: Float32Array,
  offset: number,
  expected: readonly [number, number, number],
  message: string,
): void {
  expect(actual[offset], `${message} red`).toBeCloseTo(expected[0], 6)
  expect(actual[offset + 1], `${message} green`).toBeCloseTo(expected[1], 6)
  expect(actual[offset + 2], `${message} blue`).toBeCloseTo(expected[2], 6)
}

function triplet(values: Float32Array, offset: number): readonly [number, number, number] {
  return [values[offset], values[offset + 1], values[offset + 2]]
}

describe('v2 render artifacts', () => {
  it('derives every flat texel from the canonical model sample', () => {
    const model = createTerrainV2Model(DEFAULT_PARAMS, { graph: TEST_GRAPH })
    const flat = deriveV2FlatArtifact(model, FLAT_WIDTH, FLAT_HEIGHT)
    const direction = directionForV2EquirectangularPixel(FLAT_WIDTH, FLAT_HEIGHT, 0, 0)
    const sample = createTerrainV2Sample()
    const surface = createV2Surface()
    const surfaceNoise = createV2SurfaceNoise(model)
    const color = createV2Color()

    expect(flat.width).toBe(FLAT_WIDTH)
    expect(flat.height).toBe(FLAT_HEIGHT)
    expect(flat.rgba).toHaveLength(FLAT_WIDTH * FLAT_HEIGHT * 4)
    expect(flat.biomes).toHaveLength(FLAT_WIDTH * FLAT_HEIGHT)
    expect(flat.pixels).toBe(flat.rgba)

    for (let row = 0; row < FLAT_HEIGHT; row++) {
      for (let column = 0; column < FLAT_WIDTH; column++) {
        directionForV2EquirectangularPixel(FLAT_WIDTH, FLAT_HEIGHT, column, row, direction)
        sampleTerrainV2Into(model, direction.x, direction.y, direction.z, sample)
        sampleV2SurfaceInto(
          model, surfaceNoise, direction.x, direction.y, direction.z, sample.elevation, surface,
        )
        colorTerrainV2Into(model, sample, color, surface.elevation, surface.detail)
        const pixel = row * FLAT_WIDTH + column
        const offset = pixel * 4

        expect(flat.biomes[pixel], `biome at ${column},${row}`).toBe(sample.biome)
        expect(flat.rgba[offset], `red at ${column},${row}`).toBe(linearToSrgbByte(color.r))
        expect(flat.rgba[offset + 1], `green at ${column},${row}`).toBe(linearToSrgbByte(color.g))
        expect(flat.rgba[offset + 2], `blue at ${column},${row}`).toBe(linearToSrgbByte(color.b))
        expect(flat.rgba[offset + 3], `alpha at ${column},${row}`).toBe(255)
      }
    }

    expect(bakeV2Flat(model, FLAT_WIDTH, FLAT_HEIGHT)).toEqual(flat.rgba)
    expect(deriveV2FlatArtifact(model, FLAT_WIDTH, FLAT_HEIGHT)).toEqual(flat)
  })

  it('derives detailed positions, colors, and biome IDs from that same canonical model', () => {
    const model = createTerrainV2Model(DEFAULT_PARAMS, { graph: TEST_GRAPH })
    const detailed = deriveV2DetailedArtifact(model, {
      widthSegments: DETAIL_WIDTH,
      heightSegments: DETAIL_HEIGHT,
    })
    const rowLength = DETAIL_WIDTH + 1
    const count = rowLength * (DETAIL_HEIGHT + 1)
    const direction = directionForV2DetailVertex(DETAIL_WIDTH, DETAIL_HEIGHT, 0, 0)
    const sample = createTerrainV2Sample()
    const surface = createV2Surface()
    const surfaceNoise = createV2SurfaceNoise(model)
    const color = createV2Color()

    expect(detailed.widthSegments).toBe(DETAIL_WIDTH)
    expect(detailed.heightSegments).toBe(DETAIL_HEIGHT)
    expect(detailed.positions).toHaveLength(count * 3)
    expect(detailed.colors).toHaveLength(count * 3)
    expect(detailed.normals).toHaveLength(count * 3)
    expect(detailed.biomes).toHaveLength(count)
    expect(detailed.position).toBe(detailed.positions)
    expect(detailed.color).toBe(detailed.colors)
    expect(detailed.normal).toBe(detailed.normals)
    expect(detailed.detailMapWidth).toBe(V2_DETAIL_MAP_WIDTH)
    expect(detailed.detailMapHeight).toBe(V2_DETAIL_MAP_HEIGHT)
    expect(detailed.detailMap).toHaveLength(V2_DETAIL_MAP_WIDTH * V2_DETAIL_MAP_HEIGHT)
    expect(new Set(detailed.detailMap).size).toBeGreaterThan(32)
    expect(detailed.normalMap).toHaveLength(V2_DETAIL_MAP_WIDTH * V2_DETAIL_MAP_HEIGHT * 4)
    for (let index = 3; index < detailed.normalMap.length; index += 4) {
      expect(detailed.normalMap[index]).toBe(255)
    }
    expect(detailed.seaRadius).toBeCloseTo(1 + model.seaLevel * V2_RELIEF_AMPLITUDE, 12)

    for (let iy = 0; iy <= DETAIL_HEIGHT; iy++) {
      for (let ix = 0; ix <= DETAIL_WIDTH; ix++) {
        const index = iy * rowLength + ix
        const offset = index * 3
        directionForV2DetailVertex(DETAIL_WIDTH, DETAIL_HEIGHT, ix, iy, direction)
        sampleTerrainV2Into(model, direction.x, direction.y, direction.z, sample)
        sampleV2SurfaceInto(
          model, surfaceNoise, direction.x, direction.y, direction.z, sample.elevation, surface,
        )
        colorTerrainV2Into(model, sample, color, surface.elevation, surface.detail)
        const radius = 1 + surface.elevation * V2_RELIEF_AMPLITUDE

        expect(detailed.biomes[index], `biome at ${ix},${iy}`).toBe(sample.biome)
        expectTripletClose(
          detailed.positions,
          offset,
          [direction.x * radius, direction.y * radius, direction.z * radius],
          `position at ${ix},${iy}`,
        )
        expectTripletClose(detailed.colors, offset, [color.r, color.g, color.b], `color at ${ix},${iy}`)

        const nx = detailed.normals[offset]
        const ny = detailed.normals[offset + 1]
        const nz = detailed.normals[offset + 2]
        expect(Number.isFinite(nx) && Number.isFinite(ny) && Number.isFinite(nz), `normal at ${ix},${iy}`).toBe(true)
        expect(Math.hypot(nx, ny, nz), `normal length at ${ix},${iy}`).toBeCloseTo(1, 5)
        expect(nx * direction.x + ny * direction.y + nz * direction.z, `outward normal at ${ix},${iy}`).toBeGreaterThan(0)
      }
    }
  })

  it('keeps the same surface colour when orbit and detailed projections meet', () => {
    const model = createTerrainV2Model(DEFAULT_PARAMS, { graph: TEST_GRAPH })
    // These dimensions deliberately align one pixel centre with one sphere
    // vertex despite the two projections using opposite longitude origins.
    const detailed = deriveV2DetailedArtifact(model, { widthSegments: 11, heightSegments: 8 })
    const flat = deriveV2FlatArtifact(model, 11, 4)
    const detailColumn = 2
    const detailRow = 3
    const flatColumn = 3
    const flatRow = 1
    const detailOffset = (detailRow * 12 + detailColumn) * 3
    const flatOffset = (flatRow * 11 + flatColumn) * 4

    expect(flat.rgba[flatOffset]).toBe(linearToSrgbByte(detailed.colors[detailOffset]))
    expect(flat.rgba[flatOffset + 1]).toBe(linearToSrgbByte(detailed.colors[detailOffset + 1]))
    expect(flat.rgba[flatOffset + 2]).toBe(linearToSrgbByte(detailed.colors[detailOffset + 2]))
  })

  it('makes the UV seam and duplicate poles bit-identical without changing canonical geography', () => {
    const model = createTerrainV2Model(DEFAULT_PARAMS, { graph: TEST_GRAPH })
    const detailed = deriveV2DetailedArtifact(model, {
      widthSegments: DETAIL_WIDTH,
      heightSegments: DETAIL_HEIGHT,
    })
    const rowLength = DETAIL_WIDTH + 1

    for (let iy = 0; iy <= DETAIL_HEIGHT; iy++) {
      const first = iy * rowLength
      const last = first + DETAIL_WIDTH
      const firstOffset = first * 3
      const lastOffset = last * 3
      expect(triplet(detailed.positions, firstOffset), `position seam row ${iy}`).toEqual(triplet(detailed.positions, lastOffset))
      expect(triplet(detailed.colors, firstOffset), `color seam row ${iy}`).toEqual(triplet(detailed.colors, lastOffset))
      expect(triplet(detailed.normals, firstOffset), `normal seam row ${iy}`).toEqual(triplet(detailed.normals, lastOffset))
      expect(detailed.biomes[first], `biome seam row ${iy}`).toBe(detailed.biomes[last])
    }

    for (const iy of [0, DETAIL_HEIGHT]) {
      const reference = iy * rowLength
      const referenceOffset = reference * 3
      for (let ix = 1; ix <= DETAIL_WIDTH; ix++) {
        const index = iy * rowLength + ix
        const offset = index * 3
        expect(triplet(detailed.positions, offset), `pole position ${iy}:${ix}`).toEqual(triplet(detailed.positions, referenceOffset))
        expect(triplet(detailed.colors, offset), `pole color ${iy}:${ix}`).toEqual(triplet(detailed.colors, referenceOffset))
        expect(triplet(detailed.normals, offset), `pole normal ${iy}:${ix}`).toEqual(triplet(detailed.normals, referenceOffset))
        expect(detailed.biomes[index], `pole biome ${iy}:${ix}`).toBe(detailed.biomes[reference])
      }
    }
  })

  it('adds deterministic bounded surface detail without mutating canonical elevation', () => {
    const model = createTerrainV2Model({ ...DEFAULT_PARAMS, generatorVersion: 2, seed: 31_174 }, { graph: TEST_GRAPH })
    const noise = createV2SurfaceNoise(model)
    const first = createV2Surface()
    const second = createV2Surface()
    const sample = createTerrainV2Sample()
    const direction = directionForV2EquirectangularPixel(31, 17, 9, 6)
    sampleTerrainV2Into(model, direction.x, direction.y, direction.z, sample)
    const canonicalElevation = sample.elevation

    sampleV2SurfaceInto(model, noise, direction.x, direction.y, direction.z, canonicalElevation, first)
    sampleV2SurfaceInto(
      model, createV2SurfaceNoise(model), direction.x, direction.y, direction.z, canonicalElevation, second,
    )

    expect(first).toEqual(second)
    expect(sample.elevation).toBe(canonicalElevation)
    expect(first.elevation).toBe(canonicalElevation + first.detail)
    expect(Math.abs(first.detail)).toBeLessThan(0.5)
    expect(first.detail).not.toBe(0)
  })

  it('keeps clouds out of canonical geography but includes them in flat artifact identity', () => {
    const model = createTerrainV2Model(DEFAULT_PARAMS, { graph: TEST_GRAPH })
    const clear = deriveV2FlatArtifact(model, FLAT_WIDTH, FLAT_HEIGHT)
    const clouded = deriveV2FlatArtifact(model, FLAT_WIDTH, FLAT_HEIGHT, {
      clouds: 1,
      cloudSeed: DEFAULT_PARAMS.seed,
    })
    const cloudedAgain = deriveV2FlatArtifact(model, FLAT_WIDTH, FLAT_HEIGHT, {
      clouds: 1,
      cloudSeed: DEFAULT_PARAMS.seed,
    })

    expect(clouded.rgba).toEqual(cloudedAgain.rgba)
    expect(clouded.rgba).not.toEqual(clear.rgba)
    expect(terrainV2FlatArtifactKey(model, FLAT_WIDTH, FLAT_HEIGHT)).not.toBe(
      terrainV2FlatArtifactKey(model, FLAT_WIDTH, FLAT_HEIGHT, { clouds: 1, cloudSeed: DEFAULT_PARAMS.seed }),
    )
    expect(terrainV2FlatArtifactKey(model, FLAT_WIDTH, FLAT_HEIGHT, { clouds: 1, cloudSeed: DEFAULT_PARAMS.seed })).not.toBe(
      terrainV2FlatArtifactKey(model, FLAT_WIDTH, FLAT_HEIGHT, { clouds: 1, cloudSeed: DEFAULT_PARAMS.seed + 1 }),
    )
  })

  it('leaves the albedo bare when clouds are asked for as their own layer', () => {
    const params = { ...DEFAULT_PARAMS, generatorVersion: 2 as const, clouds: 1 }
    const model = createTerrainV2Model(params, { graph: TEST_GRAPH })
    const options = { clouds: 1, cloudSeed: params.seed }

    const bare = deriveV2FlatArtifact(model, FLAT_WIDTH, FLAT_HEIGHT)
    const composited = deriveV2FlatArtifact(model, FLAT_WIDTH, FLAT_HEIGHT, options)
    const shelled = deriveV2FlatArtifact(model, FLAT_WIDTH, FLAT_HEIGHT, {
      ...options,
      cloudLayer: true,
    })

    // The whole point: the ground under a shell is the ground with no clouds at
    // all, which is what the detailed artifact colours.
    expect(shelled.rgba).toEqual(bare.rgba)
    expect(composited.rgba).not.toEqual(bare.rgba)

    // And the cover that used to be smeared into it comes back separately.
    expect(shelled.clouds).not.toBeNull()
    expect(composited.clouds).toBeNull()
    const clouds = shelled.clouds!
    expect(clouds.rgba).toHaveLength(clouds.width * clouds.height * 4)
    const alphas = new Set<number>()
    for (let pixel = 0; pixel < clouds.width * clouds.height; pixel++) {
      alphas.add(clouds.rgba[pixel * 4 + 3])
    }
    expect(alphas.size).toBeGreaterThan(1)

    // Two artifacts that differ must never share a cached identity.
    expect(terrainV2FlatArtifactKey(model, FLAT_WIDTH, FLAT_HEIGHT, options)).not.toBe(
      terrainV2FlatArtifactKey(model, FLAT_WIDTH, FLAT_HEIGHT, { ...options, cloudLayer: true }),
    )
  })

  it('gives the orbit view the same relief as the sculpted world', () => {
    const params = { ...DEFAULT_PARAMS, generatorVersion: 2 as const }
    const model = createTerrainV2Model(params, { graph: TEST_GRAPH })

    expect(deriveV2FlatArtifact(model, FLAT_WIDTH, FLAT_HEIGHT).normalMap).toBeNull()
    const relief = deriveV2FlatArtifact(model, FLAT_WIDTH, FLAT_HEIGHT, { relief: true }).normalMap
    expect(relief).not.toBeNull()
    expect(relief!.rgba).toHaveLength(relief!.width * relief!.height * 4)

    // Both maps come from one relief pass, so they agree on where the slopes
    // are; the orbit map is simply coarser. Sampling the pole rows, which are
    // flat by construction in both, pins the shared encoding.
    const detailed = deriveV2DetailedArtifact(model, {
      widthSegments: DETAIL_WIDTH,
      heightSegments: DETAIL_HEIGHT,
    })
    expect(relief!.width).toBeLessThan(detailed.detailMapWidth)
    expect(relief!.rgba[2]).toBeGreaterThan(128)
    expect(detailed.normalMap[2]).toBeGreaterThan(128)

    expect(terrainV2FlatArtifactKey(model, FLAT_WIDTH, FLAT_HEIGHT)).not.toBe(
      terrainV2FlatArtifactKey(model, FLAT_WIDTH, FLAT_HEIGHT, { relief: true }),
    )
  })

  it('applies every authored layer control to the rendered surface', () => {
    const base = { ...DEFAULT_PARAMS, generatorVersion: 2 as const }
    const baseline = deriveV2FlatArtifact(createTerrainV2Model(base, { graph: TEST_GRAPH }), FLAT_WIDTH, FLAT_HEIGHT)
    const variants = [
      base.terrainLayers!.map((layer, index) => index === 1 ? { ...layer, transition: 0.8 } : { ...layer }),
      base.terrainLayers!.map((layer, index) => index === 2 ? { ...layer, blend: 1 } : { ...layer }),
      base.terrainLayers!.map((layer, index) => index === 3 ? { ...layer, color: 0xff2040 } : { ...layer }),
    ]

    for (const terrainLayers of variants) {
      const artifact = deriveV2FlatArtifact(
        createTerrainV2Model({ ...base, terrainLayers }, { graph: TEST_GRAPH }),
        FLAT_WIDTH,
        FLAT_HEIGHT,
      )
      expect(artifact.rgba).not.toEqual(baseline.rgba)
    }

    const detailed = deriveV2DetailedArtifact(
      createTerrainV2Model({ ...base, terrainLayers: variants[2] }, { graph: TEST_GRAPH }),
      { widthSegments: DETAIL_WIDTH, heightSegments: DETAIL_HEIGHT },
    )
    const baselineDetailed = deriveV2DetailedArtifact(
      createTerrainV2Model(base, { graph: TEST_GRAPH }),
      { widthSegments: DETAIL_WIDTH, heightSegments: DETAIL_HEIGHT },
    )
    expect(detailed.colors).not.toEqual(baselineDetailed.colors)
  })
})
