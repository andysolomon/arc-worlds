/**
 * A small, fixed geodesic graph used by every v2 world.
 *
 * It deliberately has no seed-dependent topology.  The worker can create this
 * once, retain it for its lifetime, and reuse the same adjacency for every
 * world it compiles.  The render meshes are only consumers of this graph; they
 * are never used for drainage or climate calculations.
 */

export const CANONICAL_GRAPH_SCHEMA = 'arc-worlds-v2-geodesic-1'

export interface CanonicalSphereGraph {
  readonly schema: typeof CANONICAL_GRAPH_SCHEMA
  readonly subdivision: number
  /** Unit-vector xyz triplets, one for each graph cell/vertex. */
  readonly positions: Float64Array
  /** CSR offsets into `neighbors`, length = vertex count + 1. */
  readonly neighborOffsets: Uint32Array
  /** Undirected, sorted graph neighbors. */
  readonly neighbors: Uint32Array
  /** CCW-outward triangle vertex indexes. */
  readonly faces: Uint32Array
  /** CSR offsets into `vertexFaces`, length = vertex count + 1. */
  readonly vertexFaceOffsets: Uint32Array
  /** Incident triangle indexes for each vertex. */
  readonly vertexFaces: Uint32Array
  /** The twelve original icosahedron vertices, used for fast graph walks. */
  readonly anchors: Uint32Array
}

type Face = [number, number, number]

const TAU = Math.PI * 2

/**
 * The classic icosahedron layout. The first twelve positions intentionally
 * remain stable through subdivision so they can act as deterministic walk
 * starts for directional sampling.
 */
const ICOSAHEDRON_VERTICES: ReadonlyArray<readonly [number, number, number]> = (() => {
  const phi = (1 + Math.sqrt(5)) * 0.5
  return [
    [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
    [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
    [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1],
  ].map(([x, y, z]) => {
    const l = Math.hypot(x, y, z)
    return [x / l, y / l, z / l] as const
  })
})()

const ICOSAHEDRON_FACES: ReadonlyArray<Face> = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
]

const cachedGraphs = new Map<number, CanonicalSphereGraph>()

function vertexDot(positions: ReadonlyArray<readonly number[]> | Float64Array, index: number, x: number, y: number, z: number): number {
  if (positions instanceof Float64Array) {
    const offset = index * 3
    return positions[offset] * x + positions[offset + 1] * y + positions[offset + 2] * z
  }
  const point = positions[index]
  return point[0] * x + point[1] * y + point[2] * z
}

function outwardFace(vertices: ReadonlyArray<readonly number[]>, face: Face): Face {
  const [a, b, c] = face
  const av = vertices[a]
  const bv = vertices[b]
  const cv = vertices[c]
  const abx = bv[0] - av[0]
  const aby = bv[1] - av[1]
  const abz = bv[2] - av[2]
  const acx = cv[0] - av[0]
  const acy = cv[1] - av[1]
  const acz = cv[2] - av[2]
  const nx = aby * acz - abz * acy
  const ny = abz * acx - abx * acz
  const nz = abx * acy - aby * acx
  return nx * av[0] + ny * av[1] + nz * av[2] >= 0 ? face : [a, c, b]
}

function createCsr(lists: ReadonlyArray<ReadonlyArray<number>>): { offsets: Uint32Array; values: Uint32Array } {
  const offsets = new Uint32Array(lists.length + 1)
  let total = 0
  for (let i = 0; i < lists.length; i++) {
    offsets[i] = total
    total += lists[i].length
  }
  offsets[lists.length] = total
  const values = new Uint32Array(total)
  let offset = 0
  for (const list of lists) {
    values.set(list, offset)
    offset += list.length
  }
  return { offsets, values }
}

/**
 * Build (or retrieve) a deterministic icosphere graph.
 *
 * Subdivision 3 is the production canonical graph (642 vertices / 1,280
 * triangles): dense enough for macro geography, deliberately modest enough
 * that a worker can complete each bounded phase quickly. The optional lower
 * resolutions are useful for focused tests and diagnostics only.
 */
export function buildCanonicalGraph(subdivision = 3): CanonicalSphereGraph {
  const level = Math.max(0, Math.min(5, Math.floor(subdivision)))
  const cached = cachedGraphs.get(level)
  if (cached) return cached

  const vertices: Array<[number, number, number]> = ICOSAHEDRON_VERTICES.map(([x, y, z]) => [x, y, z])
  let faces: Face[] = ICOSAHEDRON_FACES.map((face) => outwardFace(vertices, [...face] as Face))

  for (let step = 0; step < level; step++) {
    const midpoints = new Map<string, number>()
    const midpoint = (a: number, b: number) => {
      const lo = Math.min(a, b)
      const hi = Math.max(a, b)
      const key = `${lo}:${hi}`
      const known = midpoints.get(key)
      if (known !== undefined) return known

      const av = vertices[a]
      const bv = vertices[b]
      const x = av[0] + bv[0]
      const y = av[1] + bv[1]
      const z = av[2] + bv[2]
      const length = Math.hypot(x, y, z)
      const index = vertices.length
      vertices.push([x / length, y / length, z / length])
      midpoints.set(key, index)
      return index
    }

    const next: Face[] = []
    for (const [a, b, c] of faces) {
      const ab = midpoint(a, b)
      const bc = midpoint(b, c)
      const ca = midpoint(c, a)
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca])
    }
    faces = next
  }

  // Floating-point subdivision preserves orientation, but assert it once at
  // the boundary so point-in-spherical-triangle tests have one stable rule.
  faces = faces.map((face) => outwardFace(vertices, face))

  const positions = new Float64Array(vertices.length * 3)
  for (let i = 0; i < vertices.length; i++) positions.set(vertices[i], i * 3)

  const neighborSets = Array.from({ length: vertices.length }, () => new Set<number>())
  const faceLists = Array.from({ length: vertices.length }, () => [] as number[])
  const faceArray = new Uint32Array(faces.length * 3)
  for (let faceIndex = 0; faceIndex < faces.length; faceIndex++) {
    const [a, b, c] = faces[faceIndex]
    const offset = faceIndex * 3
    faceArray[offset] = a
    faceArray[offset + 1] = b
    faceArray[offset + 2] = c
    neighborSets[a].add(b); neighborSets[a].add(c)
    neighborSets[b].add(a); neighborSets[b].add(c)
    neighborSets[c].add(a); neighborSets[c].add(b)
    faceLists[a].push(faceIndex)
    faceLists[b].push(faceIndex)
    faceLists[c].push(faceIndex)
  }

  const neighborLists = neighborSets.map((neighbors) => [...neighbors].sort((a, b) => a - b))
  for (const list of faceLists) list.sort((a, b) => a - b)
  const neighborCsr = createCsr(neighborLists)
  const faceCsr = createCsr(faceLists)

  const graph: CanonicalSphereGraph = {
    schema: CANONICAL_GRAPH_SCHEMA,
    subdivision: level,
    positions,
    neighborOffsets: neighborCsr.offsets,
    neighbors: neighborCsr.values,
    faces: faceArray,
    vertexFaceOffsets: faceCsr.offsets,
    vertexFaces: faceCsr.values,
    anchors: Uint32Array.from({ length: ICOSAHEDRON_VERTICES.length }, (_, index) => index),
  }
  cachedGraphs.set(level, graph)
  return graph
}

/** The fixed graph a long-lived v2 worker should create and retain once. */
export const CANONICAL_GRAPH = buildCanonicalGraph(3)

/** Number of graph vertices/cells. */
export function graphVertexCount(graph: CanonicalSphereGraph): number {
  return graph.positions.length / 3
}

/** Number of graph edges. */
export function graphEdgeCount(graph: CanonicalSphereGraph): number {
  return graph.neighbors.length / 2
}

/** Number of graph triangles. */
export function graphFaceCount(graph: CanonicalSphereGraph): number {
  return graph.faces.length / 3
}

/**
 * Return the nearest canonical vertex to an arbitrary direction.
 *
 * A linear objective over a convex polytope has a monotone edge path to a
 * maximum. Starting at the best original icosahedron anchor and walking uphill
 * therefore finds the true nearest vertex without scanning all 642 cells for
 * every texture pixel. Ties resolve to the lower stable index.
 */
export function nearestGraphVertex(graph: CanonicalSphereGraph, x: number, y: number, z: number): number {
  const length = Math.hypot(x, y, z)
  const dx = Number.isFinite(length) && length > 1e-12 ? x / length : 0
  const dy = Number.isFinite(length) && length > 1e-12 ? y / length : 1
  const dz = Number.isFinite(length) && length > 1e-12 ? z / length : 0
  let nearest = graph.anchors[0]
  let nearestDot = vertexDot(graph.positions, nearest, dx, dy, dz)
  for (let anchorIndex = 1; anchorIndex < graph.anchors.length; anchorIndex++) {
    const candidate = graph.anchors[anchorIndex]
    const candidateDot = vertexDot(graph.positions, candidate, dx, dy, dz)
    if (candidateDot > nearestDot + 1e-15 || (Math.abs(candidateDot - nearestDot) <= 1e-15 && candidate < nearest)) {
      nearest = candidate
      nearestDot = candidateDot
    }
  }
  const count = graphVertexCount(graph)

  // A strict increase prevents a flat antipodal tie from cycling. The graph
  // has fewer vertices than this guard, so malformed topology cannot loop.
  for (let steps = 0; steps < count; steps++) {
    let next = nearest
    let nextDot = nearestDot
    for (let edge = graph.neighborOffsets[nearest]; edge < graph.neighborOffsets[nearest + 1]; edge++) {
      const candidate = graph.neighbors[edge]
      const candidateDot = vertexDot(graph.positions, candidate, dx, dy, dz)
      if (candidateDot > nextDot + 1e-15 || (Math.abs(candidateDot - nextDot) <= 1e-15 && candidate < next)) {
        next = candidate
        nextDot = candidateDot
      }
    }
    if (next === nearest) break
    nearest = next
    nearestDot = nextDot
  }
  return nearest
}

/** Shared equirectangular longitude span for v2 artifact code. */
export { TAU }
