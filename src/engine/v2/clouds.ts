function clamp(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/** Climate-scaled cloud coverage shared by orbit maps and detailed shells. */
export function v2CloudCoverage(clouds: number, liquidWater: number, gas = false): number {
  const climateFactor = gas ? 1 : 0.12 + clamp(liquidWater) * 0.88
  return clamp(clouds * climateFactor)
}

function cloudNoise(seed: number, x: number, y: number, z: number): number {
  let state = (seed ^ 0x5bd1e995) >>> 0
  let total = 0
  let weight = 0
  for (let octave = 0; octave < 4; octave++) {
    state = (state + 0x6d2b79f5) | 0
    const a = Math.sin(state * 0.0000137) * 0.83
    const b = Math.sin((state ^ 0x9e3779b9) * 0.0000211) * 0.83
    const c = Math.sin((state ^ 0x85ebca6b) * 0.0000173) * 0.83
    const phase = ((state >>> 0) / 4_294_967_296) * Math.PI * 2
    const amplitude = 1 / (1 + octave)
    total += (Math.sin((x * a + y * b + z * c) * (2.5 + octave * 1.8) * Math.PI + phase) * 0.5 + 0.5) * amplitude
    weight += amplitude
  }
  return total / weight
}

/** Seamless seed-stable cloud alpha at a unit-sphere direction. */
export function v2CloudMask(seed: number, coverage: number, x: number, y: number, z: number): number {
  const threshold = 0.78 - clamp(coverage) * 0.55
  return clamp((cloudNoise(seed, x, y, z) - threshold) / 0.22)
}
