import { afterEach, describe, expect, it, vi } from 'vitest'
import { CURRENT_PARAMS } from '../../lib/params'
import { V2_WORKER_PROTOCOL, type V2WorkerRequest, type V2WorkerResponse } from './protocol'

const originalSelf = Object.getOwnPropertyDescriptor(globalThis, 'self')

interface WorkerScopeHarness {
  onmessage: ((event: MessageEvent<V2WorkerRequest>) => void) | null
  readonly messages: V2WorkerResponse[]
  postMessage(message: V2WorkerResponse): void
  close(): void
}

function createScope(): WorkerScopeHarness {
  const messages: V2WorkerResponse[] = []
  return {
    onmessage: null,
    messages,
    postMessage(message) {
      messages.push(message)
    },
    close: vi.fn(),
  }
}

async function bootWorker() {
  const scope = createScope()
  Object.defineProperty(globalThis, 'self', { configurable: true, value: scope })
  await import('./worker')
  return scope
}

function request(id: number, seed: number, measure = false): V2WorkerRequest {
  return {
    type: 'render',
    protocol: V2_WORKER_PROTOCOL,
    id,
    slot: `bench:${id}`,
    params: { ...CURRENT_PARAMS, seed },
    priority: 'preview',
    artifact: { kind: 'flat', width: 2, height: 1 },
    ...(measure ? { measure: true as const } : null),
  }
}

async function waitForMessage(
  scope: WorkerScopeHarness,
  predicate: (message: V2WorkerResponse) => boolean,
) {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    if (scope.messages.some(predicate)) return
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
  throw new Error('Timed out waiting for worker response.')
}

function dispatch(scope: WorkerScopeHarness, message: V2WorkerRequest) {
  scope.onmessage?.({ data: message } as MessageEvent<V2WorkerRequest>)
}

afterEach(() => {
  vi.resetModules()
  if (originalSelf) Object.defineProperty(globalThis, 'self', originalSelf)
  else delete (globalThis as { self?: unknown }).self
})

describe('v2 terrain worker benchmark telemetry', () => {
  it('emits no lifecycle messages unless a request opts in', async () => {
    const scope = await bootWorker()
    dispatch(scope, request(1, 10_001))
    await waitForMessage(scope, (message) => message.type === 'artifact' && message.id === 1)

    expect(scope.messages.some((message) => message.type === 'telemetry')).toBe(false)
    expect(scope.messages.some((message) => message.type === 'artifact' && message.id === 1)).toBe(true)
  })

  it('reports worker, artifact, and bounded-cache lifecycle data for measured jobs', async () => {
    const scope = await bootWorker()
    for (let id = 1; id <= 13; id++) {
      dispatch(scope, request(id, 20_000 + id, true))
      await waitForMessage(scope, (message) => message.type === 'telemetry'
        && message.id === id
        && message.event.lifecycle === 'job'
        && message.event.state === 'complete')
    }
    // Re-request the newest entry: it stays in the 12-entry LRU cache.
    dispatch(scope, request(14, 20_013, true))
    await waitForMessage(scope, (message) => message.type === 'telemetry'
      && message.id === 14
      && message.event.lifecycle === 'job'
      && message.event.state === 'complete')

    const telemetry = scope.messages.filter((message) => message.type === 'telemetry')
    const first = telemetry.filter((message) => message.id === 1)
    expect(first.map((message) => message.event.lifecycle)).toEqual(
      expect.arrayContaining(['job', 'cache', 'artifact']),
    )
    expect(first.some((message) => message.event.lifecycle === 'artifact'
      && message.event.state === 'complete'
      && message.event.transferBytes === 8
      && (message.event.artifactElapsedMs ?? -1) >= 0)).toBe(true)
    expect(first.every((message) => message.event.workerElapsedMs >= 0)).toBe(true)

    const finalStore = telemetry.findLast((message) => message.id === 13
      && message.event.lifecycle === 'cache'
      && message.event.state === 'store')
    expect(finalStore).toMatchObject({
      event: {
        lifecycle: 'cache',
        state: 'store',
        hit: false,
        cache: {
          maxModels: 12,
          size: 12,
          misses: 13,
          evictions: 1,
        },
      },
    })
    if (finalStore?.event.lifecycle === 'cache') {
      expect(finalStore.event.cache.accountedBytes).toBeGreaterThan(0)
    }
    const cacheEvents = telemetry.filter((message) => message.event.lifecycle === 'cache')
    expect(cacheEvents.every((message) => message.event.cache.size <= message.event.cache.maxModels)).toBe(true)
    expect(cacheEvents.some((message) => message.id === 14
      && message.event.lifecycle === 'cache'
      && message.event.state === 'lookup'
      && message.event.hit
      && message.event.cache.hits === 1)).toBe(true)
  })
})
