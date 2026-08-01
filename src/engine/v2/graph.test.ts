import { describe, expect, it } from 'vitest'
import {
  CANONICAL_GRAPH,
  CANONICAL_GRAPH_SCHEMA,
  buildCanonicalGraph,
  graphEdgeCount,
  graphFaceCount,
  graphVertexCount,
  nearestGraphVertex,
  type CanonicalSphereGraph,
} from './graph'

const EPSILON = 1e-12

function positionAt(graph: CanonicalSphereGraph, vertex: number): readonly [number, number, number] {
  const offset = vertex * 3
  return [graph.positions[offset], graph.positions[offset + 1], graph.positions[offset + 2]]
}

function neighborsOf(graph: CanonicalSphereGraph, vertex: number): number[] {
  return Array.from(graph.neighbors.subarray(graph.neighborOffsets[vertex], graph.neighborOffsets[vertex + 1]))
}

function facesOf(graph: CanonicalSphereGraph, vertex: number): number[] {
  return Array.from(graph.vertexFaces.subarray(graph.vertexFaceOffsets[vertex], graph.vertexFaceOffsets[vertex + 1]))
}

describe('the canonical v2 geodesic graph', () => {
  it('has stable topology at every supported subdivision', () => {
    for (let subdivision = 0; subdivision <= 5; subdivision++) {
      const graph = buildCanonicalGraph(subdivision)
      const scale = 4 ** subdivision

      expect(graph.schema).toBe(CANONICAL_GRAPH_SCHEMA)
      expect(graph.subdivision).toBe(subdivision)
      expect(graphVertexCount(graph)).toBe(10 * scale + 2)
      expect(graphEdgeCount(graph)).toBe(30 * scale)
      expect(graphFaceCount(graph)).toBe(20 * scale)
      // Euler's characteristic is the topology check that catches holes,
      // duplicate edges, and an accidental planar seam.
      expect(graphVertexCount(graph) - graphEdgeCount(graph) + graphFaceCount(graph)).toBe(2)
    }

    expect(CANONICAL_GRAPH).toBe(buildCanonicalGraph(3))
  })

  it('keeps every vertex on the unit sphere and every face outward', () => {
    const graph = CANONICAL_GRAPH
    const vertices = graphVertexCount(graph)

    for (let vertex = 0; vertex < vertices; vertex++) {
      const [x, y, z] = positionAt(graph, vertex)
      expect(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z), `vertex ${vertex}`).toBe(true)
      expect(Math.hypot(x, y, z), `radius for vertex ${vertex}`).toBeCloseTo(1, 12)
    }

    for (let face = 0; face < graphFaceCount(graph); face++) {
      const offset = face * 3
      const [a, b, c] = [graph.faces[offset], graph.faces[offset + 1], graph.faces[offset + 2]]
      expect(new Set([a, b, c]).size, `face ${face} has three corners`).toBe(3)
      const [ax, ay, az] = positionAt(graph, a)
      const [bx, by, bz] = positionAt(graph, b)
      const [cx, cy, cz] = positionAt(graph, c)
      const abx = bx - ax
      const aby = by - ay
      const abz = bz - az
      const acx = cx - ax
      const acy = cy - ay
      const acz = cz - az
      const nx = aby * acz - abz * acy
      const ny = abz * acx - abx * acz
      const nz = abx * acy - aby * acx
      expect(nx * ax + ny * ay + nz * az, `face ${face} points outward`).toBeGreaterThan(EPSILON)
    }
  })

  it('is one closed reciprocal adjacency graph, including the twelve pentagons', () => {
    const graph = CANONICAL_GRAPH
    const vertices = graphVertexCount(graph)
    let pentagons = 0

    expect(graph.neighborOffsets).toHaveLength(vertices + 1)
    expect(graph.neighborOffsets[0]).toBe(0)
    expect(graph.neighborOffsets[vertices]).toBe(graph.neighbors.length)
    expect(graph.vertexFaceOffsets).toHaveLength(vertices + 1)
    expect(graph.vertexFaceOffsets[0]).toBe(0)
    expect(graph.vertexFaceOffsets[vertices]).toBe(graph.vertexFaces.length)

    for (let vertex = 0; vertex < vertices; vertex++) {
      const neighbors = neighborsOf(graph, vertex)
      const incidentFaces = facesOf(graph, vertex)
      expect(neighbors).toEqual([...neighbors].sort((a, b) => a - b))
      expect(new Set(neighbors).size, `unique neighbors at ${vertex}`).toBe(neighbors.length)
      expect(new Set(incidentFaces).size, `unique incident faces at ${vertex}`).toBe(incidentFaces.length)
      expect(neighbors).not.toContain(vertex)
      expect(incidentFaces.length, `incident face count at ${vertex}`).toBe(neighbors.length)

      if (neighbors.length === 5) pentagons++
      expect([5, 6], `degree at ${vertex}`).toContain(neighbors.length)

      for (const neighbor of neighbors) {
        expect(neighbor).toBeGreaterThanOrEqual(0)
        expect(neighbor).toBeLessThan(vertices)
        expect(neighborsOf(graph, neighbor), `${vertex} ↔ ${neighbor}`).toContain(vertex)
      }

      for (const face of incidentFaces) {
        expect(face).toBeGreaterThanOrEqual(0)
        expect(face).toBeLessThan(graphFaceCount(graph))
        const offset = face * 3
        expect(
          [graph.faces[offset], graph.faces[offset + 1], graph.faces[offset + 2]],
          `face ${face} contains vertex ${vertex}`,
        ).toContain(vertex)
      }
    }

    expect(pentagons).toBe(12)
    expect(new Set(graph.anchors).size).toBe(12)
    for (const anchor of graph.anchors) expect(anchor).toBeLessThan(vertices)
  })

  it('has no longitude seam or pole singularity when directions find graph cells', () => {
    const graph = CANONICAL_GRAPH

    // -π and +π are the same meridian. A UV render mesh has to duplicate that
    // line, but the canonical graph must not acquire a second geography there.
    for (const latitude of [-1.2, -0.4, 0, 0.7, 1.2]) {
      const y = Math.sin(latitude)
      const horizontal = Math.cos(latitude)
      const left = nearestGraphVertex(graph, horizontal * Math.cos(-Math.PI), y, horizontal * Math.sin(-Math.PI))
      const right = nearestGraphVertex(graph, horizontal * Math.cos(Math.PI), y, horizontal * Math.sin(Math.PI))
      expect(left, `seam at latitude ${latitude}`).toBe(right)
    }

    // Longitude is undefined at a pole. Reconstructing the exact pole through
    // several longitudes must still select one finite, stable graph cell.
    for (const pole of [-1, 1]) {
      const selected = new Set<number>()
      for (let longitude = -Math.PI; longitude <= Math.PI; longitude += Math.PI / 4) {
        const latitude = pole > 0 ? Math.PI / 2 : -Math.PI / 2
        selected.add(nearestGraphVertex(
          graph,
          Math.cos(latitude) * Math.cos(longitude),
          Math.sin(latitude),
          Math.cos(latitude) * Math.sin(longitude),
        ))
      }
      expect(selected.size, `pole ${pole}`).toBe(1)
    }
  })

  it('returns its own cell for every exact vertex direction', () => {
    const graph = CANONICAL_GRAPH
    for (let vertex = 0; vertex < graphVertexCount(graph); vertex++) {
      const [x, y, z] = positionAt(graph, vertex)
      expect(nearestGraphVertex(graph, x, y, z), `nearest vertex ${vertex}`).toBe(vertex)
    }
  })
})
