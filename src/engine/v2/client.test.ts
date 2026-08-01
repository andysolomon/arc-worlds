import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_PARAMS } from '../../lib/params'
import { V2TerrainClient, type V2WorkerEndpoint } from './client'
import { V2_WORKER_PROTOCOL, type V2WorkerResponse } from './protocol'

class FakeWorker implements V2WorkerEndpoint {
  onmessage: ((event: MessageEvent<V2WorkerResponse>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  readonly messages: unknown[] = []
  readonly terminate = vi.fn()

  postMessage(message: unknown): void {
    this.messages.push(message)
  }

  emit(message: V2WorkerResponse): void {
    this.onmessage?.({ data: message } as MessageEvent<V2WorkerResponse>)
  }
}

const flatInput = {
  params: { ...DEFAULT_PARAMS, generatorVersion: 2 as const },
  priority: 'preview' as const,
  artifact: { kind: 'flat' as const, width: 8, height: 4 },
}

function flatResponse(id: number, slot: string): V2WorkerResponse {
  return {
    type: 'artifact',
    protocol: V2_WORKER_PROTOCOL,
    id,
    slot,
    canonicalKey: 'model',
    artifact: { kind: 'flat', width: 1, height: 1, rgba: new ArrayBuffer(4) },
  }
}

function artifactTelemetry(id: number, slot: string): V2WorkerResponse {
  return {
    type: 'telemetry',
    protocol: V2_WORKER_PROTOCOL,
    id,
    slot,
    event: {
      lifecycle: 'artifact',
      state: 'complete',
      queueDepth: 0,
      workerElapsedMs: 1,
      artifactElapsedMs: 1,
      transferBytes: 4,
      cache: {
        maxModels: 12,
        size: 1,
        hits: 0,
        misses: 1,
        evictions: 0,
        accountedBytes: 1,
      },
    },
  }
}

describe('V2TerrainClient', () => {
  it('creates the worker lazily and suppresses replaced results', () => {
    const worker = new FakeWorker()
    const artifacts: V2WorkerResponse[] = []
    const client = new V2TerrainClient({
      createWorker: () => worker,
      onArtifact: (artifact) => artifacts.push(artifact),
    })

    expect(worker.messages).toEqual([])
    const first = client.request('preview:0', flatInput)
    const second = client.request('preview:0', { ...flatInput, priority: 'focused' })
    expect(first).toBe(1)
    expect(second).toBe(2)
    expect(worker.messages.map((message) => (message as { type: string }).type))
      .toEqual(['render', 'cancel', 'render'])

    worker.emit(artifactTelemetry(second, 'preview:0'))
    expect(artifacts).toEqual([])
    worker.emit(flatResponse(first, 'preview:0'))
    expect(artifacts).toEqual([])
    worker.emit(flatResponse(second, 'preview:0'))
    expect(artifacts).toHaveLength(1)
  })

  it('starts no work while suspended, redispatches on resume, and disposes', () => {
    const worker = new FakeWorker()
    const client = new V2TerrainClient({ createWorker: () => worker, onArtifact: vi.fn() })

    client.setSuspended(true)
    expect(client.request('single:detailed', {
      ...flatInput,
      priority: 'focused',
      artifact: { kind: 'detailed', widthSegments: 12, heightSegments: 8 },
    })).toBe(0)
    expect(worker.messages).toEqual([])

    client.setSuspended(false)
    expect(worker.messages).toHaveLength(1)
    expect((worker.messages[0] as { type: string }).type).toBe('render')
    client.setSuspended(true)
    expect(worker.messages.slice(1).map((message) => (message as { type: string }).type))
      .toEqual(['cancel', 'suspend'])

    client.dispose()
    expect((worker.messages.at(-1) as { type: string }).type).toBe('dispose')
    expect(worker.terminate).toHaveBeenCalledOnce()
  })
})
