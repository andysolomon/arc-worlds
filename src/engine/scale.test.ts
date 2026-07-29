import { describe, expect, it } from 'vitest'
import { ORBITS } from './planets'
import { TRAPPIST } from '../data/systems'
import {
  kepler, moonDist, moonPeriodSec, moonRad, sameDist, satMult, satRadii,
  satRank, sizeMap, systemStretch, tempoFor, visDist,
} from './scale'

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

describe('compact systems', () => {
  it('leaves the Solar System exactly alone', () => {
    expect(systemStretch(39.482)).toBe(1)
    expect(tempoFor(0.2408)).toBe(1) // Mercury already clears the floor
  })

  it('stretches TRAPPIST-1 out of the sliver the log maps would leave it in', () => {
    const a = TRAPPIST.bodies.map((b) => b.a)
    const K = systemStretch(Math.max(...a))
    expect(K).toBeGreaterThan(1)
    // Unstretched, all seven orbits fit inside a quarter of one drawn radius…
    expect(sameDist(a[6]) - sameDist(a[0])).toBeLessThan(0.25)
    // …stretched, the system spans real screen distance, in the same order.
    const drawn = a.map((x) => sameDist(x * K))
    for (let i = 1; i < drawn.length; i++) expect(drawn[i]).toBeGreaterThan(drawn[i - 1])
    expect(drawn[6] - drawn[0]).toBeGreaterThan(1.5)
  })

  it('slows the fastest orbit to something an eye can follow, ratios intact', () => {
    const periods = TRAPPIST.bodies.map((b) => b.period)
    const K = tempoFor(Math.min(...periods))
    expect(Math.min(...periods) * K).toBeCloseTo(0.2, 6)
    // h still orbits exactly as many times slower than b as it really does.
    expect((periods[6] * K) / (periods[0] * K)).toBeCloseTo(periods[6] / periods[0], 9)
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

describe('satellite orbits', () => {
  it('always draws a moon clear of the planet it orbits', () => {
    // The one thing that must never happen: a moon inside its own planet.
    // Room goes negative in same-size mode, where every planet is drawn 0.24
    // wide with only 0.29 between orbits, so the floor has to hold there too.
    for (const room of [-2, -0.093, 0, 0.385, 5.4]) {
      for (const r of [0.092, 0.24, 0.616, 1.524]) {
        for (const t of [0, 0.5, 1]) {
          const orbit = r * satMult(t, r, room)
          expect(orbit, `room ${room}, radius ${r}, t ${t}`).toBeGreaterThan(r * 1.25)
        }
      }
    }
  })

  it('spends the room it is given, and no more', () => {
    // Jupiter has 5.4 units of clearance in scale mode and Earth has 0.385.
    // The outermost moon should use its planet's room rather than a constant.
    const jupiter = 1.524 * satMult(1, 1.524, 5.448)
    const earth = 0.616 * satMult(1, 0.616, 0.385)
    expect(jupiter - 1.524).toBeLessThanOrEqual(5.448)
    expect(earth - 0.616).toBeLessThanOrEqual(0.385)
    // And a planet with room to spare puts its moons further out, in radii.
    expect(jupiter / 1.524).toBeGreaterThan(earth / 0.616)
  })

  it('keeps moons in their true order, however tight the band', () => {
    const inner = satRank(6.03, 6.03, 15.31) // Io
    const outer = satRank(15.31, 6.03, 15.31) // Ganymede
    expect(inner).toBeLessThan(outer)
    for (const room of [-1, 0.4, 5]) {
      expect(satMult(inner, 1.524, room)).toBeLessThan(satMult(outer, 1.524, room))
    }
  })

  it('converts a satellite distance into its planet’s radii', () => {
    // The Moon is a shade over sixty Earth radii away, which is the number
    // the measured moon table has always carried.
    expect(satRadii(0.002569, 1)).toBeCloseTo(60.3, 1)
  })
})
