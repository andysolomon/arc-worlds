import { standaloneClimate } from '../engine/climate'
import type { PlanetParams, PresetKey } from '../engine/types'
import { V2TerrainClient, type V2WorkerEndpoint } from '../engine/v2/client'
import {
  V2_WORKER_PROTOCOL,
  isV2WorkerResponse,
  type V2ArtifactTelemetryEvent,
  type V2CacheTelemetryEvent,
  type V2JobTelemetryEvent,
  type V2PhaseResponse,
  type V2RenderRequest,
  type V2TelemetryResponse,
  type V2WorkerResponse,
} from '../engine/v2/protocol'
import { CURRENT_PARAMS } from '../lib/params'
import {
  evaluateV2StressGates,
  type V2StressMetrics,
} from './v2-terrain-gates'

const FLAT = { kind: 'flat' as const, width: 256, height: 128 }
const STANDARD_DETAIL = { kind: 'detailed' as const, widthSegments: 150, heightSegments: 104 }
const HIGH_DETAIL = { kind: 'detailed' as const, widthSegments: 220, heightSegments: 150 }

const ROCKY_PRESETS: readonly PresetKey[] = [
  'temperate', 'desert', 'ice', 'lava', 'candy', 'archean',
  'proterozoic', 'noachian', 'erid', 'adrian', 'pandora', 'luna',
  'io', 'europa', 'ganymede', 'titan', 'enceladus', 'triton',
  'mercury', 'venus', 'mars', 'pluto', 'temperate', 'desert',
]

interface TimedResponse {
  readonly at: number
  readonly response: V2WorkerResponse
}

interface MemorySample {
  readonly source: 'measureUserAgentSpecificMemory' | 'performance.memory' | 'unavailable'
  readonly bytes: number | null
}

interface BenchmarkResult {
  readonly workload: {
    readonly bodies: number
    readonly flat: typeof FLAT
    readonly standardDetail: typeof STANDARD_DETAIL
    readonly highDetail: typeof HIGH_DETAIL
  }
  readonly metrics: V2StressMetrics & {
    readonly phaseCpuTotalMs: number
    readonly workerJobTotalMs: number
    readonly artifactTotalMs: number
    readonly maxArtifactMs: number
    readonly maxMainThreadLongTaskMs: number
    readonly transferBytes: number
    readonly maxCanonicalCacheBytes: number
    readonly cacheHits: number
    readonly cacheMisses: number
    readonly cacheEvictions: number
    readonly obsoleteArtifactsReceived: number
  }
  readonly memory: {
    readonly before: MemorySample
    readonly after: MemorySample
    readonly disposed: MemorySample
  }
  readonly gates: ReturnType<typeof evaluateV2StressGates>
  readonly passed: boolean
  readonly errors: readonly string[]
}

declare global {
  interface Window {
    runV2TerrainBenchmark: () => Promise<BenchmarkResult>
  }
}

function benchmarkParams(index: number): PlanetParams {
  const values = [0.08, 0.24, 0.42, 0.6, 0.78, 0.94]
  const base: PlanetParams = {
    ...CURRENT_PARAMS,
    seed: 120_011 + index * 31_337,
    preset: ROCKY_PRESETS[index],
    mountains: values[index % values.length],
    water: values[(index + 2) % values.length],
    roughness: values[(index + 4) % values.length],
    ice: values[(index + 1) % values.length],
    clouds: values[(index + 3) % values.length],
    texture: null,
    cloudTexture: null,
  }
  return { ...base, climate: standaloneClimate(base) }
}

function transferBytes(response: Extract<V2WorkerResponse, { type: 'artifact' }>): number {
  if (response.artifact.kind === 'flat') return response.artifact.rgba.byteLength
  return response.artifact.positions.byteLength
    + response.artifact.colors.byteLength
    + response.artifact.normals.byteLength
    + response.artifact.normalMap.byteLength
}

function memorySample(): Promise<MemorySample> {
  const measured = performance as Performance & {
    measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }>
    memory?: { usedJSHeapSize: number }
  }
  if (typeof measured.measureUserAgentSpecificMemory === 'function') {
    return measured.measureUserAgentSpecificMemory()
      .then((sample) => ({ source: 'measureUserAgentSpecificMemory' as const, bytes: sample.bytes }))
      .catch(() => measured.memory
        ? { source: 'performance.memory' as const, bytes: measured.memory.usedJSHeapSize }
        : { source: 'unavailable' as const, bytes: null })
  }
  return Promise.resolve(measured.memory
    ? { source: 'performance.memory' as const, bytes: measured.memory.usedJSHeapSize }
    : { source: 'unavailable' as const, bytes: null })
}

function makeWorkerHarness() {
  const worker = new Worker(new URL('../engine/v2/terrain.worker.ts', import.meta.url), {
    type: 'module',
  })
  const events: TimedResponse[] = []
  const errors: string[] = []
  const waiters = new Set<{
    predicate: (response: V2WorkerResponse) => boolean
    resolve: (event: TimedResponse) => void
    reject: (error: Error) => void
    timeout: number
  }>()

  const settleWaiter = (event: TimedResponse) => {
    for (const waiter of waiters) {
      if (!waiter.predicate(event.response)) continue
      clearTimeout(waiter.timeout)
      waiters.delete(waiter)
      waiter.resolve(event)
    }
  }

  worker.onmessage = (message: MessageEvent<unknown>) => {
    if (!isV2WorkerResponse(message.data)) return
    const event = { at: performance.now(), response: message.data }
    events.push(event)
    settleWaiter(event)
  }
  worker.onerror = (event) => {
    const error = `Worker error: ${event.message}`
    errors.push(error)
    for (const waiter of waiters) waiter.reject(new Error(error))
    waiters.clear()
  }

  return {
    worker,
    events,
    errors,
    post(request: V2RenderRequest) {
      worker.postMessage(request)
    },
    cancel(ids: readonly number[]) {
      worker.postMessage({ type: 'cancel', protocol: V2_WORKER_PROTOCOL, ids })
    },
    waitFor(predicate: (response: V2WorkerResponse) => boolean, timeoutMs = 15_000) {
      const present = events.find((event) => predicate(event.response))
      if (present) return Promise.resolve(present)
      return new Promise<TimedResponse>((resolve, reject) => {
        const waiter = {
          predicate,
          resolve,
          reject,
          timeout: window.setTimeout(() => {
            waiters.delete(waiter)
            reject(new Error(`Timed out after ${timeoutMs} ms waiting for a worker response.`))
          }, timeoutMs),
        }
        waiters.add(waiter)
      })
    },
    dispose() {
      worker.postMessage({ type: 'dispose', protocol: V2_WORKER_PROTOCOL })
      worker.terminate()
      for (const waiter of waiters) waiter.reject(new Error('Worker disposed.'))
      waiters.clear()
    },
  }
}

/** Real production client backed by the real worker, with wire observation. */
function makeClientHarness() {
  const worker = new Worker(new URL('../engine/v2/terrain.worker.ts', import.meta.url), {
    type: 'module',
  })
  const events: TimedResponse[] = []
  const errors: string[] = []
  const accepted: Extract<V2WorkerResponse, { type: 'artifact' }>[] = []
  const waiters = new Set<{
    predicate: (response: V2WorkerResponse) => boolean
    resolve: (event: TimedResponse) => void
    reject: (error: Error) => void
    timeout: number
  }>()
  const endpoint: V2WorkerEndpoint = {
    onmessage: null,
    onerror: null,
    postMessage(message) {
      const candidate = message as Partial<V2RenderRequest>
      worker.postMessage(candidate.type === 'render' ? { ...candidate, measure: true } : message)
    },
    terminate() {
      worker.terminate()
    },
  }
  worker.onmessage = (message: MessageEvent<unknown>) => {
    if (!isV2WorkerResponse(message.data)) return
    const event = { at: performance.now(), response: message.data }
    events.push(event)
    for (const waiter of waiters) {
      if (!waiter.predicate(event.response)) continue
      clearTimeout(waiter.timeout)
      waiters.delete(waiter)
      waiter.resolve(event)
    }
    endpoint.onmessage?.({ data: message.data } as MessageEvent<V2WorkerResponse>)
  }
  worker.onerror = (event) => {
    const error = `Worker error: ${event.message}`
    errors.push(error)
    endpoint.onerror?.(event)
    for (const waiter of waiters) waiter.reject(new Error(error))
    waiters.clear()
  }
  const client = new V2TerrainClient({
    createWorker: () => endpoint,
    onArtifact: (artifact) => accepted.push(artifact),
    onError: (message) => errors.push(message),
  })

  return {
    client,
    events,
    errors,
    accepted,
    waitFor(predicate: (response: V2WorkerResponse) => boolean, timeoutMs = 15_000) {
      const present = events.find((event) => predicate(event.response))
      if (present) return Promise.resolve(present)
      return new Promise<TimedResponse>((resolve, reject) => {
        const waiter = {
          predicate,
          resolve,
          reject,
          timeout: window.setTimeout(() => {
            waiters.delete(waiter)
            reject(new Error(`Timed out after ${timeoutMs} ms waiting for a client worker response.`))
          }, timeoutMs),
        }
        waiters.add(waiter)
      })
    },
    dispose() {
      client.dispose()
      for (const waiter of waiters) waiter.reject(new Error('Client disposed.'))
      waiters.clear()
    },
  }
}

function renderRequest(
  id: number,
  slot: string,
  params: PlanetParams,
  priority: V2RenderRequest['priority'],
  artifact: V2RenderRequest['artifact'],
): V2RenderRequest {
  return { type: 'render', protocol: V2_WORKER_PROTOCOL, id, slot, params, priority, artifact, measure: true }
}

async function waitFrames(count = 2) {
  for (let frame = 0; frame < count; frame++) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
}

async function run(): Promise<BenchmarkResult> {
  const status = document.querySelector<HTMLOutputElement>('#status')
  if (status) status.value = 'Running…'
  const errors: string[] = []
  const longTasks: number[] = []
  const longTaskObserver = PerformanceObserver.supportedEntryTypes.includes('longtask')
    ? new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) longTasks.push(entry.duration)
    })
    : null
  longTaskObserver?.observe({ type: 'longtask', buffered: true })

  const memoryBefore = await memorySample()
  const main = makeWorkerHarness()
  const params = ROCKY_PRESETS.map((_, index) => benchmarkParams(index))
  let nextId = 0
  let previewSettledMs = Infinity
  let focusedSettledMs = 0
  let supersededMs = Infinity
  let artifactSupersededMs = Infinity
  let obsoleteArtifactsAccepted = 0
  let obsoleteArtifactsReceived = 0
  const accepted = new Set<number>()

  try {
    const previewStart = performance.now()
    const previewIds = params.map((world, index) => {
      const id = ++nextId
      const slot = `preview:${index}`
      main.post(renderRequest(id, slot, world, 'preview', FLAT))
      return id
    })
    await Promise.all(previewIds.map((id) => main.waitFor((response) =>
      response.id === id && (response.type === 'artifact' || response.type === 'error'),
    )))
    previewSettledMs = performance.now() - previewStart

    const detailParam = params.at(-1)!
    for (const artifact of [STANDARD_DETAIL, HIGH_DETAIL]) {
      const id = ++nextId
      const slot = `focused:${artifact.widthSegments}`
      const started = performance.now()
      main.post(renderRequest(id, slot, detailParam, 'focused', artifact))
      await main.waitFor((response) => response.id === id && response.type === 'artifact')
      focusedSettledMs = Math.max(focusedSettledMs, performance.now() - started)
    }

    // Prove the LRU boundary: the newest model is a hit while the oldest of 24
    // is a miss after the 12-entry worker cache has evicted it.
    for (const [label, world] of [['recent', params.at(-1)!], ['evicted', params[0]]] as const) {
      const id = ++nextId
      const slot = `cache:${label}`
      main.post(renderRequest(id, slot, world, 'preview', FLAT))
      await main.waitFor((response) => response.id === id && response.type === 'artifact')
    }

    // Fresh production client: focused work preempts a preview through worker
    // priority alone while other preview jobs remain queued.
    const preemption = makeClientHarness()
    try {
      const obsoleteId = preemption.client.request('preempted', {
        params: params[0], priority: 'preview', artifact: FLAT,
      })
      const queuedIds = [1, 2].map((offset) => {
        return preemption.client.request(`queued:${offset}`, {
          params: params[offset + 1], priority: 'preview', artifact: FLAT,
        })
      })
      await preemption.waitFor((response) => response.id === obsoleteId
        && response.type === 'phase'
        && response.event.phase === 'macro'
        && response.event.state === 'start')

      const replacementAt = performance.now()
      const replacementId = preemption.client.request('focused-priority', {
        params: params[1], priority: 'focused', artifact: HIGH_DETAIL,
      })
      const [cancelled, focused] = await Promise.all([
        preemption.waitFor((response) => response.id === obsoleteId && response.type === 'cancelled'),
        preemption.waitFor((response) => response.id === replacementId && response.type === 'artifact'),
      ])
      supersededMs = cancelled.at - replacementAt
      focusedSettledMs = Math.max(focusedSettledMs, focused.at - replacementAt)
      const queuedBeforeFocused = preemption.events.some((event) => event.at < focused.at
        && event.response.type === 'artifact'
        && queuedIds.includes(event.response.id))
      if (queuedBeforeFocused) errors.push('A queued preview artifact arrived before focused work.')
      obsoleteArtifactsAccepted += preemption.accepted.filter(
        (artifact) => artifact.id === obsoleteId,
      ).length
      errors.push(...preemption.errors)
    } finally {
      preemption.dispose()
    }

    // A second real client replaces the same slot after synchronous artifact
    // derivation has begun. The old wire response may arrive because the
    // worker cannot observe messages mid-loop, but the client callback must
    // suppress it and the remaining wasted time must stay below 100 ms.
    const replacement = makeClientHarness()
    try {
      const oldId = replacement.client.request('latest', {
        params: params[4], priority: 'preview', artifact: FLAT,
      })
      await replacement.waitFor((response) => response.id === oldId
        && response.type === 'telemetry'
        && response.event.lifecycle === 'artifact'
        && response.event.state === 'start')
      const replacementAt = performance.now()
      const newId = replacement.client.request('latest', {
        params: params[5], priority: 'focused', artifact: HIGH_DETAIL,
      })
      const [oldTerminal, newArtifact] = await Promise.all([
        replacement.waitFor((response) => response.id === oldId
          && (response.type === 'artifact' || response.type === 'cancelled')),
        replacement.waitFor((response) => response.id === newId && response.type === 'artifact'),
      ])
      artifactSupersededMs = oldTerminal.at - replacementAt
      focusedSettledMs = Math.max(focusedSettledMs, newArtifact.at - replacementAt)
      if (oldTerminal.response.type === 'artifact') obsoleteArtifactsReceived++
      obsoleteArtifactsAccepted += replacement.accepted.filter(
        (artifact) => artifact.id === oldId,
      ).length
      errors.push(...replacement.errors)
    } finally {
      replacement.dispose()
    }

    for (const event of main.events) {
      const response = event.response
      if (response.type === 'error') errors.push(response.message)
      if (response.type !== 'artifact') continue
      accepted.add(response.id)
    }

    const memoryAfter = await memorySample()
    const phaseEvents = main.events
      .map((event) => event.response)
      .filter((response): response is V2PhaseResponse => response.type === 'phase'
        && response.event.state === 'complete'
        && response.event.durationMs !== undefined)
    const telemetry = main.events
      .map((event) => event.response)
      .filter((response): response is V2TelemetryResponse => response.type === 'telemetry')
    const cacheEvents = telemetry.filter((response): response is V2TelemetryResponse & {
      event: V2CacheTelemetryEvent
    } => response.event.lifecycle === 'cache')
    const artifactEvents = telemetry.filter((response): response is V2TelemetryResponse & {
      event: V2ArtifactTelemetryEvent
    } => response.event.lifecycle === 'artifact')
    const jobEvents = telemetry.filter((response): response is V2TelemetryResponse & {
      event: V2JobTelemetryEvent
    } => response.event.lifecycle === 'job')
    const artifactResponses = main.events
      .map((event) => event.response)
      .filter((response) => response.type === 'artifact')
    const maxCanonicalCacheBytes = Math.max(0, ...cacheEvents.map((response) => response.event.cache.accountedBytes))
    const transferTotal = artifactResponses.reduce((sum, response) => sum + transferBytes(response), 0)
    const telemetryTransferTotal = artifactEvents.reduce(
      (sum, response) => sum + (response.event.transferBytes ?? 0),
      0,
    )
    const expectedTransferTotal = 24 * 256 * 128 * 4
      + (151 * 105 * 3 * 3 * 4 + 256 * 128 * 4)
      + (221 * 151 * 3 * 3 * 4 + 256 * 128 * 4)
      + 2 * 256 * 128 * 4
    if (transferTotal !== expectedTransferTotal) {
      errors.push(`Transferred ${transferTotal} bytes; expected ${expectedTransferTotal}.`)
    }
    if (telemetryTransferTotal !== transferTotal) {
      errors.push(`Telemetry counted ${telemetryTransferTotal} transfer bytes; responses carried ${transferTotal}.`)
    }
    const uaMemoryDelta = memoryBefore.source === 'measureUserAgentSpecificMemory'
      && memoryAfter.source === 'measureUserAgentSpecificMemory'
      && memoryBefore.bytes !== null
      && memoryAfter.bytes !== null
      ? Math.max(0, memoryAfter.bytes - memoryBefore.bytes)
      : null

    main.dispose()
    main.events.length = 0
    await waitFrames()
    const memoryDisposed = await memorySample()
    const metrics = {
      previewArtifacts: previewIds.filter((id) => accepted.has(id)).length,
      previewSettledMs,
      focusedSettledMs,
      maxPhaseMs: Math.max(0, ...phaseEvents.map((response) => response.event.durationMs ?? 0)),
      supersededMs,
      artifactSupersededMs,
      maxCanonicalCacheEntries: Math.max(0, ...cacheEvents.map((response) => response.event.cache.size)),
      obsoleteArtifactsAccepted,
      errorCount: errors.length,
      accountedIncrementalBytes: transferTotal + maxCanonicalCacheBytes,
      measuredIncrementalMemoryBytes: uaMemoryDelta,
      phaseCpuTotalMs: phaseEvents.reduce((sum, response) => sum + (response.event.durationMs ?? 0), 0),
      workerJobTotalMs: jobEvents.reduce(
        (sum, response) => sum + (response.event.state === 'complete' ? response.event.workerElapsedMs : 0),
        0,
      ),
      artifactTotalMs: artifactEvents.reduce(
        (sum, response) => sum + (response.event.state === 'complete' ? response.event.artifactElapsedMs ?? 0 : 0),
        0,
      ),
      maxArtifactMs: Math.max(0, ...artifactEvents.map((response) => response.event.artifactElapsedMs ?? 0)),
      maxMainThreadLongTaskMs: Math.max(0, ...longTasks),
      transferBytes: transferTotal,
      maxCanonicalCacheBytes,
      cacheHits: Math.max(0, ...cacheEvents.map((response) => response.event.cache.hits)),
      cacheMisses: Math.max(0, ...cacheEvents.map((response) => response.event.cache.misses)),
      cacheEvictions: Math.max(0, ...cacheEvents.map((response) => response.event.cache.evictions)),
      obsoleteArtifactsReceived,
    }
    const gates = evaluateV2StressGates(metrics)
    const result: BenchmarkResult = {
      workload: { bodies: params.length, flat: FLAT, standardDetail: STANDARD_DETAIL, highDetail: HIGH_DETAIL },
      metrics,
      memory: { before: memoryBefore, after: memoryAfter, disposed: memoryDisposed },
      gates,
      passed: gates.every((gate) => gate.passed),
      errors,
    }
    if (status) status.value = result.passed ? 'Passed' : 'Failed'
    return result
  } catch (error) {
    main.dispose()
    throw error
  } finally {
    longTaskObserver?.disconnect()
  }
}

window.runV2TerrainBenchmark = run
