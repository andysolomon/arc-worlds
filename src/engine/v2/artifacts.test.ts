import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from '../../lib/params'
import { buildCanonicalGraph } from './graph'
import {
  V2_RELIEF_AMPLITUDE,
  bakeV2Flat,
  colorTerrainV2Into,
  createV2Color,
  deriveV2DetailedArtifact,
  deriveV2FlatArtifact,
  directionForV2DetailVertex,
  directionForV2EquirectangularPixel,
  linearToSrgbByte,
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
        colorTerrainV2Into(model, sample, color)
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
    expect(detailed.seaRadius).toBeCloseTo(1 + model.seaLevel * V2_RELIEF_AMPLITUDE, 12)

    for (let iy = 0; iy <= DETAIL_HEIGHT; iy++) {
      for (let ix = 0; ix <= DETAIL_WIDTH; ix++) {
        const index = iy * rowLength + ix
        const offset = index * 3
        directionForV2DetailVertex(DETAIL_WIDTH, DETAIL_HEIGHT, ix, iy, direction)
        sampleTerrainV2Into(model, direction.x, direction.y, direction.z, sample)
        colorTerrainV2Into(model, sample, color)
        const radius = 1 + sample.elevation * V2_RELIEF_AMPLITUDE

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
})
