export const V2_STRESS_BODY_COUNT = 24
export const V2_STRESS_LIMITS = {
  previewsSettledMs: 3_000,
  focusedSettledMs: 1_000,
  phaseMs: 50,
  supersededMs: 100,
  artifactSupersededMs: 100,
  mainThreadLongTaskMs: 50,
  incrementalMemoryBytes: 64 * 1024 * 1024,
  canonicalCacheEntries: 12,
} as const

export interface V2StressMetrics {
  readonly previewArtifacts: number
  readonly previewSettledMs: number
  readonly focusedSettledMs: number
  readonly maxPhaseMs: number
  readonly supersededMs: number
  readonly artifactSupersededMs: number
  readonly maxMainThreadLongTaskMs: number
  readonly maxCanonicalCacheEntries: number
  readonly obsoleteArtifactsAccepted: number
  readonly errorCount: number
  readonly accountedIncrementalBytes: number
  /** Optional because Chromium may not expose UA-specific memory. */
  readonly measuredIncrementalMemoryBytes: number | null
}

export interface V2StressGate {
  readonly name: string
  readonly passed: boolean
  readonly actual: number | string
  readonly limit: number | string
}

/** Pure evaluation kept separate so benchmark policy has ordinary unit tests. */
export function evaluateV2StressGates(metrics: V2StressMetrics): V2StressGate[] {
  const memory = metrics.measuredIncrementalMemoryBytes
    ?? metrics.accountedIncrementalBytes
  return [
    {
      name: 'previewArtifacts',
      passed: metrics.previewArtifacts === V2_STRESS_BODY_COUNT,
      actual: metrics.previewArtifacts,
      limit: V2_STRESS_BODY_COUNT,
    },
    {
      name: 'previewSettledMs',
      passed: metrics.previewSettledMs <= V2_STRESS_LIMITS.previewsSettledMs,
      actual: metrics.previewSettledMs,
      limit: V2_STRESS_LIMITS.previewsSettledMs,
    },
    {
      name: 'focusedSettledMs',
      passed: metrics.focusedSettledMs <= V2_STRESS_LIMITS.focusedSettledMs,
      actual: metrics.focusedSettledMs,
      limit: V2_STRESS_LIMITS.focusedSettledMs,
    },
    {
      name: 'maxPhaseMs',
      passed: metrics.maxPhaseMs <= V2_STRESS_LIMITS.phaseMs,
      actual: metrics.maxPhaseMs,
      limit: V2_STRESS_LIMITS.phaseMs,
    },
    {
      name: 'supersededMs',
      passed: metrics.supersededMs <= V2_STRESS_LIMITS.supersededMs,
      actual: metrics.supersededMs,
      limit: V2_STRESS_LIMITS.supersededMs,
    },
    {
      name: 'artifactSupersededMs',
      passed: metrics.artifactSupersededMs <= V2_STRESS_LIMITS.artifactSupersededMs,
      actual: metrics.artifactSupersededMs,
      limit: V2_STRESS_LIMITS.artifactSupersededMs,
    },
    {
      name: 'maxMainThreadLongTaskMs',
      passed: metrics.maxMainThreadLongTaskMs <= V2_STRESS_LIMITS.mainThreadLongTaskMs,
      actual: metrics.maxMainThreadLongTaskMs,
      limit: V2_STRESS_LIMITS.mainThreadLongTaskMs,
    },
    {
      name: 'maxCanonicalCacheEntries',
      passed: metrics.maxCanonicalCacheEntries <= V2_STRESS_LIMITS.canonicalCacheEntries,
      actual: metrics.maxCanonicalCacheEntries,
      limit: V2_STRESS_LIMITS.canonicalCacheEntries,
    },
    {
      name: 'obsoleteArtifactsAccepted',
      passed: metrics.obsoleteArtifactsAccepted === 0,
      actual: metrics.obsoleteArtifactsAccepted,
      limit: 0,
    },
    {
      name: 'errorCount',
      passed: metrics.errorCount === 0,
      actual: metrics.errorCount,
      limit: 0,
    },
    {
      name: metrics.measuredIncrementalMemoryBytes === null
        ? 'accountedIncrementalBytes'
        : 'measuredIncrementalMemoryBytes',
      passed: memory <= V2_STRESS_LIMITS.incrementalMemoryBytes,
      actual: memory,
      limit: V2_STRESS_LIMITS.incrementalMemoryBytes,
    },
  ]
}
