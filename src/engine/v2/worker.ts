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
  type V2WorkerRequest,
  type V2WorkerResponse,
} from './protocol.js'

interface QueuedJob {
  readonly request: V2RenderRequest
  readonly sequence: number
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
  }
}

/** Yield a task, not a microtask, so `onmessage` can set cancellation flags. */
function yieldToMessages(): Promise<void> {
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
  if (cancelledJob(job)) {
    postCancelled(job)
    cancelled.delete(job.request.id)
    return
  }

  const key = terrainV2CanonicalKey(request.params)
  let model = touchModel(key)
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
        return
      }
      storeModel(key, model)
    }

    // Give a cancellation/control message one final task before the output
    // loops. Artifact builders never touch canonical data and their result is
    // dropped outright when a newer request wins.
    await yieldToMessages()
    if (cancelledJob(job)) {
      postCancelled(job)
      return
    }

    if (request.artifact.kind === 'flat') {
      const artifact = deriveV2FlatArtifact(
        model,
        request.artifact.width,
        request.artifact.height,
        { clouds: request.params.clouds, cloudSeed: request.params.seed },
      )
      if (cancelledJob(job)) {
        postCancelled(job)
        return
      }
      const rgba = transferBuffer(artifact.rgba)
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
      return
    }

    const artifact = deriveV2DetailedArtifact(model, {
      widthSegments: request.artifact.widthSegments,
      heightSegments: request.artifact.heightSegments,
    })
    if (cancelledJob(job)) {
      postCancelled(job)
      return
    }
    const positions = transferBuffer(artifact.positions)
    const colors = transferBuffer(artifact.colors)
    const normals = transferBuffer(artifact.normals)
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
        seaRadius: artifact.seaRadius,
      },
    }, [positions, colors, normals])
  } catch (error) {
    if (error instanceof TerrainV2CancelledError || cancelledJob(job)) {
      postCancelled(job, error instanceof TerrainV2CancelledError ? error.phase : undefined)
      return
    }
    postError(job, error)
  }
}

function takeNext(): QueuedJob | null {
  while (queue.length) {
    queue.sort((a, b) => priority(a) - priority(b) || a.sequence - b.sequence)
    const job = queue.shift()!
    if (cancelledJob(job)) {
      postCancelled(job)
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
  const job = { request, sequence: ++sequence }
  // A focused result should never wait for an obsolete preview's remaining
  // canonical phase. The async compiler observes this at its next yield.
  if (active && priority(job) < priority(active)) cancelled.add(active.request.id)
  if (suspended) {
    postCancelled(job)
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
      self.close()
      break
  }
}
