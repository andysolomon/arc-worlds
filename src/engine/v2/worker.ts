/**
 * Long-lived, separately loaded v2 terrain worker.
 *
 * It owns canonical models and their graph buffers. The main thread receives
 * only completed RGBA or position/color/normal artifacts, never geography
 * arrays that would detach this cache.
 */
import {
  deriveV2DetailedArtifact,
  deriveV2FlatArtifact,
} from './artifacts.js'
import {
  TerrainV2CancelledError,
  compileTerrainV2Async,
  terrainV2CanonicalKey,
  type TerrainV2Model,
} from './model.js'
import {
  V2_WORKER_PROTOCOL,
  type V2RenderRequest,
  type V2WorkerTelemetryEvent,
  type V2WorkerRequest,
  type V2WorkerResponse,
} from './protocol.js'

interface QueuedJob {
  readonly request: V2RenderRequest
  readonly sequence: number
  /** Only populated for an opt-in measurement, never used for scheduling. */
  readonly measuredAt: number
}

const MAX_CANONICAL_MODELS = 12

const queue: QueuedJob[] = []
const cancelled = new Set<number>()
/** LRU cache: re-inserting a key marks it most recently used. */
const canonicalModels = new Map<string, TerrainV2Model>()
let active: QueuedJob | null = null
let sequence = 0
let pumping = false
let suspended = false
let disposed = false
let cacheHits = 0
let cacheMisses = 0
let cacheEvictions = 0

// Chromium may clamp a worker's nominal setTimeout(0) to roughly 20 ms. A
// 24-body miss workload has more than 150 cooperative phase boundaries, so
// timer clamping alone can consume several seconds. MessageChannel schedules a
// real task without that timer floor and still returns to the worker event loop
// so queued cancel/focus messages can run between phases.
const controlChannel = typeof MessageChannel !== 'undefined'
  ? new MessageChannel()
  : null
const controlYields: Array<() => void> = []
if (controlChannel) {
  // Node exposes MessageChannel while running the worker module's unit tests;
  // unref is absent in browsers and only prevents those test ports keeping the
  // process alive after the fake worker scope is restored.
  const nodePort1 = controlChannel.port1 as MessagePort & { unref?: () => void }
  const nodePort2 = controlChannel.port2 as MessagePort & { unref?: () => void }
  nodePort1.unref?.()
  nodePort2.unref?.()
  controlChannel.port1.onmessage = () => controlYields.shift()?.()
}

function priority(job: QueuedJob): number {
  return job.request.priority === 'focused' ? 0 : 1
}

function cancelledJob(job: QueuedJob | null): boolean {
  return !!job && (disposed || suspended || cancelled.has(job.request.id))
}

function post(message: V2WorkerResponse, transfer: Transferable[] = []) {
  if (disposed) return
  self.postMessage(message, { transfer })
}

function now(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}

function elapsed(start: number): number {
  return Math.max(0, now() - start)
}

function canonicalCacheBytes(): number {
  const buffers = new Set<ArrayBufferLike>()
  for (const model of canonicalModels.values()) {
    buffers.add(model.elevation.buffer)
    buffers.add(model.ridgeDistance.buffer)
    buffers.add(model.filledElevation.buffer)
    buffers.add(model.downslope.buffer)
    buffers.add(model.outlets.buffer)
    buffers.add(model.flow.buffer)
    buffers.add(model.moisture.buffer)
    buffers.add(model.temperature.buffer)
    buffers.add(model.biome.buffer)
  }
  let bytes = 0
  for (const buffer of buffers) bytes += buffer.byteLength
  return bytes
}

function canonicalCacheTelemetry() {
  return {
    maxModels: MAX_CANONICAL_MODELS,
    size: canonicalModels.size,
    hits: cacheHits,
    misses: cacheMisses,
    evictions: cacheEvictions,
    accountedBytes: canonicalCacheBytes(),
  }
}

function postTelemetry(job: QueuedJob, event: V2WorkerTelemetryEvent) {
  if (!job.request.measure) return
  post({
    type: 'telemetry',
    protocol: V2_WORKER_PROTOCOL,
    id: job.request.id,
    slot: job.request.slot,
    event,
  })
}

function postJobTelemetry(
  job: QueuedJob,
  startedAt: number,
  state: Extract<V2WorkerTelemetryEvent, { lifecycle: 'job' }>['state'],
  phase?: TerrainV2CancelledError['phase'],
) {
  if (!job.request.measure) return
  postTelemetry(job, {
    lifecycle: 'job',
    state,
    queueDepth: queue.length,
    workerElapsedMs: elapsed(startedAt),
    cache: canonicalCacheTelemetry(),
    ...(phase ? { phase } : null),
  })
}

function postCacheTelemetry(
  job: QueuedJob,
  startedAt: number,
  state: Extract<V2WorkerTelemetryEvent, { lifecycle: 'cache' }>['state'],
  hit: boolean,
) {
  if (!job.request.measure) return
  postTelemetry(job, {
    lifecycle: 'cache',
    state,
    hit,
    queueDepth: queue.length,
    workerElapsedMs: elapsed(startedAt),
    cache: canonicalCacheTelemetry(),
  })
}

function postArtifactTelemetry(
  job: QueuedJob,
  startedAt: number,
  state: Extract<V2WorkerTelemetryEvent, { lifecycle: 'artifact' }>['state'],
  artifactElapsedMs?: number,
  transferBytes?: number,
) {
  if (!job.request.measure) return
  postTelemetry(job, {
    lifecycle: 'artifact',
    state,
    queueDepth: queue.length,
    workerElapsedMs: elapsed(startedAt),
    cache: canonicalCacheTelemetry(),
    ...(artifactElapsedMs === undefined ? null : { artifactElapsedMs }),
    ...(transferBytes === undefined ? null : { transferBytes }),
  })
}

function postCancelled(job: QueuedJob, phase?: TerrainV2CancelledError['phase']) {
  post({
    type: 'cancelled',
    protocol: V2_WORKER_PROTOCOL,
    id: job.request.id,
    slot: job.request.slot,
    ...(phase ? { phase } : null),
  })
}

function postError(job: QueuedJob, error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown v2 terrain worker error.'
  post({
    type: 'error',
    protocol: V2_WORKER_PROTOCOL,
    id: job.request.id,
    slot: job.request.slot,
    message,
  })
}

function touchModel(key: string): TerrainV2Model | undefined {
  const cached = canonicalModels.get(key)
  if (!cached) return undefined
  canonicalModels.delete(key)
  canonicalModels.set(key, cached)
  return cached
}

function storeModel(key: string, model: TerrainV2Model) {
  canonicalModels.delete(key)
  canonicalModels.set(key, model)
  while (canonicalModels.size > MAX_CANONICAL_MODELS) {
    const oldest = canonicalModels.keys().next().value
    if (oldest === undefined) break
    canonicalModels.delete(oldest)
    cacheEvictions++
  }
}

/** Yield a task, not a microtask, so `onmessage` can set cancellation flags. */
function yieldToMessages(): Promise<void> {
  if (controlChannel) {
    return new Promise((resolve) => {
      controlYields.push(resolve)
      controlChannel.port2.postMessage(null)
    })
  }
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function transferBuffer(bytes: Uint8Array | Float32Array): ArrayBuffer {
  if (
    bytes.buffer instanceof ArrayBuffer &&
    bytes.byteOffset === 0 &&
    bytes.byteLength === bytes.buffer.byteLength
  ) return bytes.buffer

  const copy = new Uint8Array(bytes.byteLength)
  copy.set(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength))
  return copy.buffer
}

async function process(job: QueuedJob) {
  const { request } = job
  const startedAt = request.measure ? now() : 0
  if (cancelledJob(job)) {
    postCancelled(job)
    postJobTelemetry(job, startedAt, 'cancelled')
    cancelled.delete(job.request.id)
    return
  }

  postJobTelemetry(job, startedAt, 'start')

  const key = terrainV2CanonicalKey(request.params)
  let model = touchModel(key)
  const cacheHit = !!model
  if (cacheHit) cacheHits++
  else cacheMisses++
  postCacheTelemetry(job, startedAt, 'lookup', cacheHit)
  try {
    if (!model) {
      model = await compileTerrainV2Async(request.params, {
        shouldCancel: () => cancelledJob(job),
        onPhase: (event) => {
          if (!cancelledJob(job)) {
            post({
              type: 'phase',
              protocol: V2_WORKER_PROTOCOL,
              id: request.id,
              slot: request.slot,
              event,
            })
          }
        },
        yieldControl: yieldToMessages,
      })
      if (cancelledJob(job)) {
        postCancelled(job)
        postJobTelemetry(job, startedAt, 'cancelled')
        return
      }
      storeModel(key, model)
      postCacheTelemetry(job, startedAt, 'store', false)
    }

    // Give a cancellation/control message one final task before the output
    // loops. Artifact builders never touch canonical data and their result is
    // dropped outright when a newer request wins.
    await yieldToMessages()
    if (cancelledJob(job)) {
      postCancelled(job)
      postJobTelemetry(job, startedAt, 'cancelled')
      return
    }

    if (request.artifact.kind === 'flat') {
      postArtifactTelemetry(job, startedAt, 'start')
      const artifactStartedAt = request.measure ? now() : 0
      const artifact = deriveV2FlatArtifact(
        model,
        request.artifact.width,
        request.artifact.height,
        { clouds: request.params.clouds, cloudSeed: request.params.seed },
      )
      const artifactElapsedMs = request.measure ? elapsed(artifactStartedAt) : undefined
      if (cancelledJob(job)) {
        postArtifactTelemetry(job, startedAt, 'discarded', artifactElapsedMs)
        postCancelled(job)
        postJobTelemetry(job, startedAt, 'cancelled')
        return
      }
      const rgba = transferBuffer(artifact.rgba)
      postArtifactTelemetry(job, startedAt, 'complete', artifactElapsedMs, rgba.byteLength)
      post({
        type: 'artifact',
        protocol: V2_WORKER_PROTOCOL,
        id: request.id,
        slot: request.slot,
        canonicalKey: key,
        artifact: {
          kind: 'flat',
          width: artifact.width,
          height: artifact.height,
          rgba,
        },
      }, [rgba])
      postJobTelemetry(job, startedAt, 'complete')
      return
    }

    postArtifactTelemetry(job, startedAt, 'start')
    const artifactStartedAt = request.measure ? now() : 0
    const artifact = deriveV2DetailedArtifact(model, {
      widthSegments: request.artifact.widthSegments,
      heightSegments: request.artifact.heightSegments,
    })
    const artifactElapsedMs = request.measure ? elapsed(artifactStartedAt) : undefined
    if (cancelledJob(job)) {
      postArtifactTelemetry(job, startedAt, 'discarded', artifactElapsedMs)
      postCancelled(job)
      postJobTelemetry(job, startedAt, 'cancelled')
      return
    }
    const positions = transferBuffer(artifact.positions)
    const colors = transferBuffer(artifact.colors)
    const normals = transferBuffer(artifact.normals)
    const normalMap = transferBuffer(artifact.normalMap)
    const transferBytes = positions.byteLength + colors.byteLength + normals.byteLength
      + normalMap.byteLength
    postArtifactTelemetry(job, startedAt, 'complete', artifactElapsedMs, transferBytes)
    post({
      type: 'artifact',
      protocol: V2_WORKER_PROTOCOL,
      id: request.id,
      slot: request.slot,
      canonicalKey: key,
      artifact: {
        kind: 'detailed',
        widthSegments: artifact.widthSegments,
        heightSegments: artifact.heightSegments,
        positions,
        colors,
        normals,
        normalMap,
        detailMapWidth: artifact.detailMapWidth,
        detailMapHeight: artifact.detailMapHeight,
        seaRadius: artifact.seaRadius,
      },
    }, [positions, colors, normals, normalMap])
    postJobTelemetry(job, startedAt, 'complete')
  } catch (error) {
    if (error instanceof TerrainV2CancelledError || cancelledJob(job)) {
      const phase = error instanceof TerrainV2CancelledError ? error.phase : undefined
      postCancelled(job, phase)
      postJobTelemetry(job, startedAt, 'cancelled', phase)
      return
    }
    postError(job, error)
    postJobTelemetry(job, startedAt, 'error')
  }
}

function takeNext(): QueuedJob | null {
  while (queue.length) {
    queue.sort((a, b) => priority(a) - priority(b) || a.sequence - b.sequence)
    const job = queue.shift()!
    if (cancelledJob(job)) {
      postCancelled(job)
      postJobTelemetry(job, job.measuredAt, 'cancelled')
      cancelled.delete(job.request.id)
      continue
    }
    return job
  }
  return null
}

async function pump() {
  if (pumping || disposed || suspended) return
  pumping = true
  try {
    while (!disposed && !suspended) {
      const job = takeNext()
      if (!job) break
      active = job
      await process(job)
      cancelled.delete(job.request.id)
      active = null
      // Let a focused request posted while a preview artifact was derived win
      // before the next preview starts.
      await yieldToMessages()
    }
  } finally {
    pumping = false
    if (!disposed && !suspended && queue.length) void pump()
  }
}

function enqueue(request: V2RenderRequest) {
  if (disposed) return
  const job = { request, sequence: ++sequence, measuredAt: request.measure ? now() : 0 }
  // A focused result should never wait for an obsolete preview's remaining
  // canonical phase. The async compiler observes this at its next yield.
  if (active && priority(job) < priority(active)) cancelled.add(active.request.id)
  if (suspended) {
    postCancelled(job)
    postJobTelemetry(job, job.measuredAt, 'cancelled')
    return
  }
  queue.push(job)
  void pump()
}

function cancel(ids: readonly number[]) {
  for (const id of ids) cancelled.add(id)
  // Remove queued work immediately; an active compile observes its flag after
  // the next yielding phase boundary.
  for (let index = queue.length - 1; index >= 0; index--) {
    const job = queue[index]
    if (!cancelled.has(job.request.id)) continue
    queue.splice(index, 1)
    postCancelled(job)
    postJobTelemetry(job, job.measuredAt, 'cancelled')
    cancelled.delete(job.request.id)
  }
}

function setSuspended(next: boolean) {
  suspended = next
  if (!next) {
    void pump()
    return
  }
  if (active) cancelled.add(active.request.id)
  while (queue.length) {
    const job = queue.shift()!
    postCancelled(job)
    postJobTelemetry(job, job.measuredAt, 'cancelled')
  }
}

self.onmessage = (event: MessageEvent<V2WorkerRequest>) => {
  const message = event.data
  if (!message || message.protocol !== V2_WORKER_PROTOCOL || disposed) return
  switch (message.type) {
    case 'render':
      enqueue(message)
      break
    case 'cancel':
      cancel(message.ids)
      break
    case 'suspend':
      setSuspended(message.suspended)
      break
    case 'dispose':
      disposed = true
      if (active) cancelled.add(active.request.id)
      queue.length = 0
      canonicalModels.clear()
      cancelled.clear()
      controlChannel?.port1.close()
      controlChannel?.port2.close()
      controlYields.splice(0).forEach((resolve) => resolve())
      self.close()
      break
  }
}
