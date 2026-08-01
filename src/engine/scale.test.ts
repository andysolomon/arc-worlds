import { describe, expect, it } from 'vitest'
import { ORBITS, parentOf, REAL } from './planets'
import { MILKY_WAY, TRAPPIST } from '../data/systems'
import { MOONS } from '../data/presets'
import {
  kepler, moonDist, moonPeriodSec, moonRad, sameDist, satMult, satRadii,
  satRank, satTempo, sizeMap, systemStretch, tempoFor, visDist,
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
    // …and the floor is the only thing it does. Deimos is lifted eight times
    // its true size to stay on screen; a moon big enough not to need that is
    // drawn at the measurement, which is the whole point of the Earth–Moon
    // pair. Charon is over half of Pluto, and drawing it a fifth of that was
    // the difference between a double world and a pebble.
    expect(moonRad(0.00183)).toBeGreaterThan(0.00183)
    expect(moonRad(0.2727)).toBeCloseTo(0.2727, 10)
    expect(moonRad(0.512)).toBeCloseTo(0.512, 10)
    // Never smaller than life, whatever the moon.
    for (const key of Object.keys(REAL)) {
      for (const m of REAL[key].moons) {
        expect(moonRad(m.r), `${key}/${m.n}`).toBeGreaterThanOrEqual(m.r)
      }
    }
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
    // The one thing that must never happen: a moon buried in its own planet.
    // The gap has to clear both radii — in same-size mode a planet is drawn
    // 0.24 and its moon 0.092 — and room goes negative there, since planets
    // sit 0.29 apart and already overlap at conjunction. So the floor has to
    // hold on its own, without any room to spend.
    const MOON_R = 0.092
    for (const room of [-2, -0.093, 0, 0.385, 5.4]) {
      for (const [r, moonR] of [[0.24, MOON_R], [0.616, 0.12], [1.524, 0.3]]) {
        for (const t of [0, 0.5, 1]) {
          const surfaceGap = r * satMult(t, r, room) - r - moonR
          expect(surfaceGap, `room ${room}, radius ${r}, t ${t}`).toBeGreaterThan(0)
        }
      }
    }
  })

  it('spends the room it is given, where there is room to spend', () => {
    // Jupiter has 5.4 units of clearance in scale mode and Earth has 0.385,
    // so Jupiter's moons should spread further out in its own radii.
    expect(satMult(1, 1.524, 5.448)).toBeGreaterThan(satMult(1, 0.616, 0.385))
    // Where there is genuinely room, the outermost moon stays inside it.
    expect(1.524 * satMult(1, 1.524, 5.448) - 1.524).toBeLessThanOrEqual(5.448)
  })

  it('never stacks two moons on the same orbit, however tight it gets', () => {
    // A band with no width would put every moon of a planet in one place,
    // which is worse than crossing a neighbouring orbit line — so the band
    // keeps a minimum width even when the room available is negative.
    for (const room of [-2, 0, 0.4, 5]) {
      expect(satMult(1, 1.524, room) - satMult(0, 1.524, room)).toBeGreaterThan(0.2)
    }
  })

  it('keeps moons in their true order, however tight the band', () => {
    const inner = satRank(6.03, 6.03, 15.31) // Io
    const outer = satRank(15.31, 6.03, 15.31) // Ganymede
    expect(inner).toBeLessThan(outer)
    for (const room of [-1, 0.4, 5]) {
      expect(satMult(inner, 1.524, room)).toBeLessThan(satMult(outer, 1.524, room))
    }
  })

  it('carries every satellite into the system as a tidally locked one', () => {
    // The orbit view reads the lock off the data rather than being told about
    // it: a satellite whose sidereal day is its orbital period gets its spin
    // from its orbit, so the same face stays inward however the two clocks are
    // compressed. That inference is only sound while the tables agree, and
    // every satellite drawn in a system is a real moon, and every real moon
    // large enough to be here is locked.
    const sats = MILKY_WAY.bodies.filter((b) => b.orbits)
    expect(sats.length).toBeGreaterThan(0)
    for (const b of sats) {
      expect(Math.abs(b.day) / 24, b.name).toBeCloseTo(b.period * 365.25, 6)
    }
  })

  it('keeps a moon’s year tied to its planet’s, not to the wall clock', () => {
    // The Moon takes 27.32 days against Earth's 365.25, so a drawn Earth year
    // has to contain something close to thirteen drawn lunar months. The old
    // easing gave it one every four years, which is why it read as standing
    // still. A factor of 1.2 is all our own Moon needs.
    const moon = 27.322 / 365.25
    const K = satTempo(moon)
    expect(K).toBeLessThan(1.25)
    expect(1 / (moon * K)).toBeGreaterThan(10)

    // Jupiter's family needs a real slowing — Io's 1.77 days is 68 ms at the
    // system's pace — but the ratios inside it survive exactly.
    const io = 1.769 / 365.25
    const europa = 3.551 / 365.25
    const J = satTempo(io)
    expect(J).toBeGreaterThan(10)
    expect((europa * J) / (io * J)).toBeCloseTo(europa / io, 12)
    // Every family is slowed to the same fastest orbit, so no moon anywhere
    // is a blur and none of them is slower than it has to be.
    expect(io * J).toBeCloseTo(moon * K, 12)
  })

  it('converts a satellite distance into its planet’s radii', () => {
    // The Moon is a shade over sixty Earth radii away, which is the number
    // the measured moon table has always carried.
    expect(satRadii(0.002569, 1)).toBeCloseTo(60.3, 1)
  })
})

describe('a moon knows its planet', () => {
  it('finds a parent for every moon that is a world, and nothing else', () => {
    for (const m of MOONS) {
      const parent = parentOf({ preset: m.key, seed: m.params.seed! })
      expect(parent, m.name).not.toBeNull()
      expect(parent!.distance, m.name).toBeGreaterThan(parent!.radius)
    }
    // A planet is not a moon, and neither is a world nobody has placed.
    expect(parentOf({ preset: 'jupiter', seed: 55 })).toBeNull()
    expect(parentOf({ preset: 'temperate', seed: 4242 })).toBeNull()
    // Reseeding detaches it here too, exactly as it does everywhere else.
    expect(parentOf({ preset: 'europa', seed: 1 })).toBeNull()
  })

  it('reports each planet at the size it really looks from that moon', () => {
    // Degrees across, from the measured radius and distance. These are the
    // numbers that make the view worth having: Jupiter dominates Io's sky,
    // Saturn more than half fills Enceladus's, and Earth from our own Moon is
    // a modest disc — about four times the Moon as we see it, and no more.
    const apparent = (preset: string, seed: number) => {
      const p = parentOf({ preset: preset as never, seed })!
      return (2 * Math.atan(p.radius / p.distance) * 180) / Math.PI
    }
    expect(apparent('luna', 1969)).toBeCloseTo(1.9, 1)
    expect(apparent('io', 1610)).toBeCloseTo(18.8, 0)
    expect(apparent('europa', 1611)).toBeCloseTo(11.9, 0)
    expect(apparent('enceladus', 1789)).toBeCloseTo(27.5, 0)
    // And the ordering is the physical one: closer or bigger looks larger.
    expect(apparent('io', 1610)).toBeGreaterThan(apparent('europa', 1611))
    expect(apparent('europa', 1611)).toBeGreaterThan(apparent('ganymede', 1612))
  })
})
