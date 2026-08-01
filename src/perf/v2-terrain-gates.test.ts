import { describe, expect, it } from 'vitest'
import {
  V2_STRESS_LIMITS,
  evaluateV2StressGates,
  type V2StressMetrics,
} from './v2-terrain-gates'

const passing: V2StressMetrics = {
  previewArtifacts: 24,
  previewSettledMs: 2_999,
  focusedSettledMs: 999,
  maxPhaseMs: 49.9,
  supersededMs: 99.9,
  artifactSupersededMs: 99.9,
  maxMainThreadLongTaskMs: 50,
  maxCanonicalCacheEntries: 12,
  obsoleteArtifactsAccepted: 0,
  errorCount: 0,
  accountedIncrementalBytes: V2_STRESS_LIMITS.incrementalMemoryBytes,
  measuredIncrementalMemoryBytes: null,
}

describe('v2 terrain stress gates', () => {
  it('accepts every research limit at its inclusive boundary', () => {
    expect(evaluateV2StressGates(passing).every((gate) => gate.passed)).toBe(true)
  })

  it('fails each structural or performance regression', () => {
    const regressions: Partial<V2StressMetrics>[] = [
      { previewArtifacts: 23 },
      { previewSettledMs: 3_001 },
      { focusedSettledMs: 1_001 },
      { maxPhaseMs: 50.1 },
      { supersededMs: 100.1 },
      { artifactSupersededMs: 100.1 },
      { maxMainThreadLongTaskMs: 50.1 },
      { maxCanonicalCacheEntries: 13 },
      { obsoleteArtifactsAccepted: 1 },
      { errorCount: 1 },
      { accountedIncrementalBytes: V2_STRESS_LIMITS.incrementalMemoryBytes + 1 },
    ]

    for (const regression of regressions) {
      const gates = evaluateV2StressGates({ ...passing, ...regression })
      expect(gates.some((gate) => !gate.passed), JSON.stringify(regression)).toBe(true)
    }
  })

  it('prefers a real UA memory delta when the browser exposes one', () => {
    const gates = evaluateV2StressGates({
      ...passing,
      measuredIncrementalMemoryBytes: V2_STRESS_LIMITS.incrementalMemoryBytes + 1,
    })
    const memory = gates.find((gate) => gate.name === 'measuredIncrementalMemoryBytes')
    expect(memory).toMatchObject({ passed: false })
  })
})
