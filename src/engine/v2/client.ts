/**
 * Main-thread owner for the lazy v2 terrain worker.
 *
 * It is intentionally small: generation remains in `worker.ts`, while this
 * class gives view consumers latest-wins slots, suspension, and stale-result
 * filtering. Constructing it does not create a worker; the first unsuspended
 * request does.
 */
import {
  V2_WORKER_PROTOCOL,
  isV2WorkerResponse,
  type V2ArtifactSpec,
  type V2JobPriority,
  type V2RenderRequest,
  type V2WorkerResponse,
} from './protocol'
import type { PlanetParams } from '../types'

export interface V2WorkerEndpoint {
  onmessage: ((event: MessageEvent<V2WorkerResponse>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  postMessage(message: unknown, transfer?: Transferable[]): void
  terminate(): void
}

export interface V2RenderInput {
  readonly params: PlanetParams
  readonly priority: V2JobPriority
  readonly artifact: V2ArtifactSpec
}

export interface V2TerrainClientOptions {
  readonly onArtifact: (response: Extract<V2WorkerResponse, { type: 'artifact' }>) => void
  readonly onPhase?: (response: Extract<V2WorkerResponse, { type: 'phase' }>) => void
  readonly onError?: (message: string) => void
  /** Injected by focused tests; production stays a separately loaded module worker. */
  readonly createWorker?: () => V2WorkerEndpoint
}

function createWorker(): V2WorkerEndpoint {
  return new Worker(new URL('./terrain.worker.ts', import.meta.url), { type: 'module' })
}

/**
 * A client has named consumer slots rather than a global “latest” request:
 * the focused detailed world may run alongside lower-priority orbit previews,
 * while replacing either consumer cancels only its own obsolete work.
 */
export class V2TerrainClient {
  private readonly onArtifact: V2TerrainClientOptions['onArtifact']
  private readonly onPhase: V2TerrainClientOptions['onPhase']
  private readonly onError: V2TerrainClientOptions['onError']
  private readonly factory: () => V2WorkerEndpoint
  private worker: V2WorkerEndpoint | null = null
  private readonly desired = new Map<string, V2RenderInput>()
  private readonly active = new Map<string, number>()
  private readonly completed = new Set<string>()
  private nextId = 0
  private suspended = false
  private disposed = false

  constructor(options: V2TerrainClientOptions) {
    this.onArtifact = options.onArtifact
    this.onPhase = options.onPhase
    this.onError = options.onError
    this.factory = options.createWorker ?? createWorker
  }

  /** Request the newest artifact for one consumer slot. */
  request(slot: string, input: V2RenderInput): number {
    if (this.disposed) return 0
    this.cancelActive(slot)
    // The worker must never observe caller-owned mutable params.
    this.desired.set(slot, { ...input, params: { ...input.params } })
    this.completed.delete(slot)
    return this.suspended ? 0 : this.dispatch(slot)
  }

  /** Stop caring about a consumer altogether (for example, torn-down previews). */
  cancel(slot: string) {
    this.cancelActive(slot)
    this.desired.delete(slot)
    this.completed.delete(slot)
  }

  /** Suspend all starts and cancel active/queued work at its next yield boundary. */
  setSuspended(suspended: boolean) {
    if (this.disposed || this.suspended === suspended) return
    this.suspended = suspended
    const worker = this.worker
    if (suspended) {
      const ids = [...this.active.values()]
      if (ids.length && worker) worker.postMessage({ type: 'cancel', protocol: V2_WORKER_PROTOCOL, ids })
      this.active.clear()
      worker?.postMessage({ type: 'suspend', protocol: V2_WORKER_PROTOCOL, suspended: true })
      return
    }

    worker?.postMessage({ type: 'suspend', protocol: V2_WORKER_PROTOCOL, suspended: false })
    // Only jobs interrupted before completion need a fresh request. The worker
    // retains canonical models, so resume still avoids recomputing geography.
    for (const slot of this.desired.keys()) {
      if (!this.completed.has(slot) && !this.active.has(slot)) this.dispatch(slot)
    }
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.desired.clear()
    this.active.clear()
    this.completed.clear()
    if (this.worker) {
      this.worker.postMessage({ type: 'dispose', protocol: V2_WORKER_PROTOCOL })
      this.worker.terminate()
      this.worker = null
    }
  }

  private ensureWorker(): V2WorkerEndpoint {
    if (this.worker) return this.worker
    const worker = this.factory()
    worker.onmessage = (event) => this.receive(event)
    worker.onerror = () => {
      if (this.worker !== worker) return
      this.worker = null
      this.active.clear()
      this.onError?.('The v2 terrain worker stopped unexpectedly.')
    }
    this.worker = worker
    return worker
  }

  private dispatch(slot: string): number {
    const input = this.desired.get(slot)
    if (!input || this.suspended || this.disposed) return 0
    const id = ++this.nextId
    const request: V2RenderRequest = {
      type: 'render',
      protocol: V2_WORKER_PROTOCOL,
      id,
      slot,
      params: input.params,
      priority: input.priority,
      artifact: input.artifact,
    }
    this.active.set(slot, id)
    this.ensureWorker().postMessage(request)
    return id
  }

  private cancelActive(slot: string) {
    const id = this.active.get(slot)
    if (id === undefined) return
    this.active.delete(slot)
    this.worker?.postMessage({ type: 'cancel', protocol: V2_WORKER_PROTOCOL, ids: [id] })
  }

  private receive(event: MessageEvent<V2WorkerResponse>) {
    const response = event.data
    if (this.disposed || !isV2WorkerResponse(response)) return
    const activeId = this.active.get(response.slot)

    // Results from a replaced/suspended slot can never reach a GPU upload.
    if (response.type === 'phase') {
      if (!this.suspended && activeId === response.id) this.onPhase?.(response)
      return
    }
    if (response.type === 'artifact') {
      if (this.suspended || activeId !== response.id) return
      this.active.delete(response.slot)
      this.completed.add(response.slot)
      this.onArtifact(response)
      return
    }
    if (response.type === 'cancelled') {
      if (activeId === response.id) this.active.delete(response.slot)
      return
    }
    if (response.type === 'error') {
      if (activeId === response.id) this.active.delete(response.slot)
      this.onError?.(response.message)
    }
  }
}
