/**
 * Complete v1 detailed-world artifacts.
 *
 * This mirrors the legacy detailed renderer's `SphereGeometry` sampling path
 * without changing `surface.ts`: start from the same unit-sphere directions,
 * write positions and linear vertex colours, then let Three compute normals
 * from the indexed triangles. It exists both as a compatibility oracle and as
 * the source for full-buffer fixtures while v2 develops independently.
 */
import * as THREE from 'three'
import { noiseFor, makeSurface } from './surface'
import { LEGACY_GENERATOR_VERSION, type PlanetParams } from './types'

export type V1Detail = 'standard' | 'high'

export interface V1DetailedArtifacts {
  /** Displaced vertex positions in the same order as SphereGeometry. */
  position: Float32Array
  /** Linear vertex colours in the same order as `position`. */
  color: Float32Array
  /** Vertex normals recomputed from the displaced indexed geometry. */
  normal: Float32Array
}

/** The exact legacy segment policy from `PlanetViewport.buildGeo`. */
export function v1GeometrySegments(detail: V1Detail): { width: number; height: number } {
  return detail === 'high' ? { width: 220, height: 150 } : { width: 150, height: 104 }
}

/**
 * Bake the detailed v1 buffers without allocating a renderer or touching the
 * DOM. The buffers are independent copies, so callers may transfer or retain
 * them after this function returns.
 */
export function bakeV1DetailedArtifacts(
  P: PlanetParams,
  detail: V1Detail = 'standard',
): V1DetailedArtifacts {
  if (P.generatorVersion !== LEGACY_GENERATOR_VERSION) {
    throw new Error('v1 detailed artifacts require generatorVersion 1')
  }

  const segments = v1GeometrySegments(detail)
  const geometry = new THREE.SphereGeometry(1, segments.width, segments.height)

  try {
    // This is deliberately a copy of the unit sphere's original positions,
    // just as the viewport keeps `dirs` before it starts displacing geometry.
    const dirs = new Float32Array(geometry.attributes.position.array)
    const position = new Float32Array(dirs.length)
    const color = new Float32Array(dirs.length)
    const { n1, n2 } = noiseFor(P.seed | 0)
    const surface = makeSurface(P, n1, n2)
    const sampled = new THREE.Color()

    for (let i = 0; i < dirs.length; i += 3) {
      const x = dirs[i]
      const y = dirs[i + 1]
      const z = dirs[i + 2]
      const radius = surface.sample(x, y, z, sampled)
      position[i] = x * radius
      position[i + 1] = y * radius
      position[i + 2] = z * radius
      color[i] = sampled.r
      color[i + 1] = sampled.g
      color[i + 2] = sampled.b
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(color, 3))
    geometry.computeVertexNormals()
    const normal = new Float32Array(geometry.attributes.normal.array)

    return { position, color, normal }
  } finally {
    geometry.dispose()
  }
}
