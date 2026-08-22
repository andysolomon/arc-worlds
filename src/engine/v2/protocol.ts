/**
 * Wire contract for the separately loaded v2 terrain worker.
 *
 * Canonical graph/model buffers deliberately never appear here: they remain
 * owned by the long-lived worker cache. Only finished render artifacts cross
 * the thread boundary.
 */
import type { PlanetParams } from '../types'
import type { TerrainV2Phase, TerrainV2PhaseEvent } from './model'

export const V2_WORKER_PROTOCOL = 'arc-worlds-v2-worker-2' as const

export type V2ArtifactKind = 'flat' | 'detailed'
export type V2JobPriority = 'focused' | 'preview'

export interface V2FlatSpec {
  readonly kind: 'flat'
  readonly width: number
  readonly height: number
  /**
   * Leave the albedo bare and return clouds as their own layer, for a consumer
   * that hangs them on a shell — see V2FlatArtifactOptions.
   */
  readonly cloudLayer?: boolean
  /** Also return the relief normal map. */
  readonly relief?: boolean
}

export interface V2DetailedSpec {
  readonly kind: 'detailed'
  readonly widthSegments: number
  readonly heightSegments: number
}

export type V2ArtifactSpec = V2FlatSpec | V2DetailedSpec

/** One requested artifact; `slot` is a latest-wins consumer identity. */
export interface V2RenderRequest {
  readonly type: 'render'
  readonly protocol: typeof V2_WORKER_PROTOCOL
  readonly id: number
  readonly slot: string
  readonly params: PlanetParams
  readonly priority: V2JobPriority
  readonly artifact: V2ArtifactSpec
  /**
   * Benchmark-only instrumentation. Normal visitors never set this, so the
   * worker emits no lifecycle messages on the production rendering path.
   */
  readonly measure?: boolean
}

export interface V2CancelRequest {
  readonly type: 'cancel'
  readonly protocol: typeof V2_WORKER_PROTOCOL
  readonly ids: readonly number[]
}

export interface V2SuspendRequest {
  readonly type: 'suspend'
  readonly protocol: typeof V2_WORKER_PROTOCOL
  readonly suspended: boolean
}

export interface V2DisposeRequest {
  readonly type: 'dispose'
  readonly protocol: typeof V2_WORKER_PROTOCOL
}

export type V2WorkerRequest =
  | V2RenderRequest
  | V2CancelRequest
  | V2SuspendRequest
  | V2DisposeRequest

export interface V2PhaseResponse {
  readonly type: 'phase'
  readonly protocol: typeof V2_WORKER_PROTOCOL
  readonly id: number
  readonly slot: string
  readonly event: TerrainV2PhaseEvent
}

export interface V2FlatArtifactResponse {
  readonly type: 'artifact'
  readonly protocol: typeof V2_WORKER_PROTOCOL
  readonly id: number
  readonly slot: string
  readonly canonicalKey: string
  readonly artifact: {
    readonly kind: 'flat'
    readonly width: number
    readonly height: number
    readonly rgba: ArrayBuffer
    /** Present only when asked for, and only when the world has clouds at all. */
    readonly clouds?: V2LayerPayload
    readonly normalMap?: V2LayerPayload
  }
}

/** An extra equirectangular layer, carried at its own resolution. */
export interface V2LayerPayload {
  readonly width: number
  readonly height: number
  readonly rgba: ArrayBuffer
}

export interface V2DetailedArtifactResponse {
  readonly type: 'artifact'
  readonly protocol: typeof V2_WORKER_PROTOCOL
  readonly id: number
  readonly slot: string
  readonly canonicalKey: string
  readonly artifact: {
    readonly kind: 'detailed'
    readonly widthSegments: number
    readonly heightSegments: number
    readonly positions: ArrayBuffer
    readonly colors: ArrayBuffer
    readonly normals: ArrayBuffer
    readonly normalMap: ArrayBuffer
    readonly detailMapWidth: number
    readonly detailMapHeight: number
    readonly seaRadius: number
  }
}

export interface V2CancelledResponse {
  readonly type: 'cancelled'
  readonly protocol: typeof V2_WORKER_PROTOCOL
  readonly id: number
  readonly slot: string
  readonly phase?: TerrainV2Phase
}

export interface V2ErrorResponse {
  readonly type: 'error'
  readonly protocol: typeof V2_WORKER_PROTOCOL
  readonly id: number
  readonly slot: string
  readonly message: string
}

/** Snapshot of worker-owned canonical models; fixed graph bytes are excluded. */
export interface V2CanonicalCacheTelemetry {
  readonly maxModels: number
  readonly size: number
  readonly hits: number
  readonly misses: number
  readonly evictions: number
  /** Sum of unique canonical-model typed-array buffers currently retained. */
  readonly accountedBytes: number
}

interface V2WorkerTelemetryBase {
  /** Pending jobs only; the currently executing job is not included. */
  readonly queueDepth: number
  /** Measured on the worker clock since this job began. */
  readonly workerElapsedMs: number
  /** Snapshot at the lifecycle point, including the fixed 12-model cap. */
  readonly cache: V2CanonicalCacheTelemetry
}

export interface V2JobTelemetryEvent extends V2WorkerTelemetryBase {
  readonly lifecycle: 'job'
  readonly state: 'start' | 'complete' | 'cancelled' | 'error'
  readonly phase?: TerrainV2Phase
}

export interface V2ArtifactTelemetryEvent extends V2WorkerTelemetryBase {
  readonly lifecycle: 'artifact'
  readonly state: 'start' | 'complete' | 'discarded'
  /** Present after the synchronous flat/detail artifact loop returns. */
  readonly artifactElapsedMs?: number
  /** Bytes handed to postMessage only for a completed artifact. */
  readonly transferBytes?: number
}

export interface V2CacheTelemetryEvent extends V2WorkerTelemetryBase {
  readonly lifecycle: 'cache'
  readonly state: 'lookup' | 'store'
  /** A lookup hit only; a store always follows a miss that completed. */
  readonly hit: boolean
}

export type V2WorkerTelemetryEvent =
  | V2JobTelemetryEvent
  | V2ArtifactTelemetryEvent
  | V2CacheTelemetryEvent

/** Emitted exclusively in response to a render request with `measure: true`. */
export interface V2TelemetryResponse {
  readonly type: 'telemetry'
  readonly protocol: typeof V2_WORKER_PROTOCOL
  readonly id: number
  readonly slot: string
  readonly event: V2WorkerTelemetryEvent
}

export type V2WorkerResponse =
  | V2PhaseResponse
  | V2FlatArtifactResponse
  | V2DetailedArtifactResponse
  | V2CancelledResponse
  | V2ErrorResponse
  | V2TelemetryResponse

export function isV2WorkerResponse(value: unknown): value is V2WorkerResponse {
  if (!value || typeof value !== 'object') return false
  const message = value as { protocol?: unknown; type?: unknown }
  return message.protocol === V2_WORKER_PROTOCOL && typeof message.type === 'string'
}
