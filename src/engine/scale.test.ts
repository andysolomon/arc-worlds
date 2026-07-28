import { describe, expect, it } from 'vitest'
import { ORBITS } from './planets'
import { kepler, moonDist, moonPeriodSec, moonRad, sameDist, sizeMap, visDist } from './scale'

describe('visDist', () => {
  it('preserves ordering across the whole solar system', () => {
    const au = ORBITS.map((o) => o[1])
    const d = au.map(visDist)
    for (let i = 1; i < d.length; i++) expect(d[i]).toBeGreaterThan(d[i - 1])
  })

  it('compresses the outer system relative to true distance', () => {
    // Neptune is 77.7x Mercury's orbit, but must render far closer than that.
    const ratioTrue = 30.07 / 0.3871
    const ratioDrawn = visDist(30.07) / visDist(0.3871)
    expect(ratioDrawn).toBeLessThan(ratioTrue / 4)
    expect(ratioDrawn).toBeGreaterThan(1)
  })
})

describe('sameDist', () => {
  it('preserves ordering and compresses harder than visDist', () => {
    const au = ORBITS.map((o) => o[1])
    const d = au.map(sameDist)
    for (let i = 1; i < d.length; i++) expect(d[i]).toBeGreaterThan(d[i - 1])
    expect(sameDist(30.07) / sameDist(0.3871)).toBeLessThan(visDist(30.07) / visDist(0.3871))
  })
})

describe('the drawn solar system', () => {
  it("keeps Pluto's perihelion inside Neptune's orbit in both scale models", () => {
    // The engine draws an ellipse of semi-axis model(a), scaled by (1-e) at
    // perihelion — the same arithmetic as applyOrbits. Both compressions are
    // monotonic but nonlinear, so the crossing has to be checked, not assumed:
    // it is the whole point of putting Pluto in the sky.
    const [, plutoA, , plutoE] = ORBITS.find((o) => o[0] === 'pluto')!
    const [, neptuneA] = ORBITS.find((o) => o[0] === 'neptune')!
    expect(visDist(plutoA) * (1 - plutoE)).toBeLessThan(visDist(neptuneA))
    expect(sameDist(plutoA) * (1 - plutoE)).toBeLessThan(sameDist(neptuneA))
    // And it still frames: ordering by semi-major axis is preserved.
    expect(visDist(plutoA)).toBeGreaterThan(visDist(neptuneA))
    expect(sameDist(plutoA)).toBeGreaterThan(sameDist(neptuneA))
  })
})

describe('sizeMap', () => {
  it('clamps below the smallest body and at the Sun', () => {
    expect(sizeMap(100)).toBeCloseTo(0.3, 5)
    expect(sizeMap(696340)).toBeCloseTo(2.8, 5)
    expect(sizeMap(1e9)).toBeCloseTo(2.8, 5)
  })

  it('ranks the planets by true size', () => {
    const earth = sizeMap(6371)
    const jupiter = sizeMap(11.209 * 6371)
    const mercury = sizeMap(0.383 * 6371)
    expect(jupiter).toBeGreaterThan(earth)
    expect(earth).toBeGreaterThan(mercury)
  })
})

describe('kepler', () => {
  it('solves M = E - e·sin(E) for a range of eccentricities', () => {
    for (const e of [0, 0.0167, 0.0934, 0.2056, 0.5, 0.751]) {
      for (let i = 0; i < 12; i++) {
        const M = (i / 12) * 2 * Math.PI
        const E = kepler(M, e)
        expect(E - e * Math.sin(E)).toBeCloseTo(M, 8)
      }
    }
  })

  it('is the identity when the orbit is circular', () => {
    expect(kepler(1.234, 0)).toBeCloseTo(1.234, 12)
  })
})

describe('moon scaling', () => {
  it('keeps moon distances in orbital order', () => {
    // Saturn's inner-to-outer sequence.
    const a = [4.09, 5.06, 6.48, 9.05, 20.98, 61.15]
    const d = a.map(moonDist)
    for (let i = 1; i < d.length; i++) expect(d[i]).toBeGreaterThan(d[i - 1])
  })

  it('gives even the tiniest moon a visible radius', () => {
    // Deimos is the smallest body rendered anywhere in the app.
    expect(moonRad(0.00183)).toBeGreaterThanOrEqual(0.01)
    expect(moonRad(0.2727)).toBeGreaterThan(moonRad(0.00183))
  })

  it('eases long periods so distant moons still move', () => {
    const titan = moonPeriodSec(15.945)
    const iapetus = moonPeriodSec(79.32)
    const nereid = moonPeriodSec(360.14)
    expect(iapetus).toBeGreaterThan(titan)
    expect(nereid).toBeGreaterThan(iapetus)
    // Without easing, Nereid would take 22x Titan's time; eased, far less.
    expect(nereid / titan).toBeLessThan(6)
  })

  it('treats retrograde periods as the same duration', () => {
    expect(moonPeriodSec(-5.877)).toBeCloseTo(moonPeriodSec(5.877), 10)
  })
})
