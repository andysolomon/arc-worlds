import { describe, expect, it } from 'vitest'
import {
  ALPHA_CENTAURI, ANDROMEDA, ERIDANI_40, KEPLER_452, MILKY_WAY,
  PEGASI_51, PROXIMA, TAU_CETI, TRAPPIST,
} from '../data/systems'
import { ORBITS } from '../engine/planets'
import { periodFor, sameDist, starRadius, starSize } from '../engine/scale'
import {
  A_MAX, MASS_MAX, MASS_MIN, MAX_BODIES, STAR_KINDS,
  addRolledWorld, addWorld, bodyFromWorld, dayFor, duplicateBody, duplicateSystem,
  emptySystem, hasRoom, nextDistance, retime, rollSystem, sanitizeSystem, sortByDistance,
  worldInSystem,
} from './systems'
import { DEFAULT_PARAMS } from './params'

describe('periodFor', () => {
  it('reproduces the measured periods of the real planets', () => {
    // Kepler's third law is the whole reason a custom system can be given a
    // distance and still orbit believably, so it has to match the real ones.
    for (const [name, a, period] of ORBITS) {
      expect(periodFor(a, 1), `${name}`).toBeCloseTo(period, 0)
    }
  })

  it('speeds everything up around a heavier star', () => {
    expect(periodFor(1, 2)).toBeLessThan(periodFor(1, 1))
    expect(periodFor(1, 0.5)).toBeGreaterThan(periodFor(1, 1))
  })
})

describe('starRadius', () => {
  it('matches the real stars each kind stands in for', () => {
    // Rough measured radii: Proxima-like M dwarfs track mass almost exactly,
    // while Sirius A (2.06 M☉) is only 1.71 R☉ — the swelling slows above the Sun.
    const measured: Array<[number, number]> = [
      [0.28, 0.29], [0.78, 0.79], [1, 1], [1.6, 1.5], [2.4, 2.05],
    ]
    for (const [mass, radius] of measured) {
      expect(starRadius(mass), `${mass} M☉`).toBeCloseTo(radius, 1)
    }
  })

  it('tracks mass below the Sun and lags behind it above', () => {
    for (const m of [0.1, 0.3, 0.5]) expect(starRadius(m)).toBeCloseTo(m, 6)
    for (const m of [1.2, 2, 3]) {
      expect(starRadius(m * 1.5)).toBeGreaterThan(starRadius(m))
      expect(starRadius(m * 1.5)).toBeLessThan(starRadius(m) * 1.5)
    }
  })
})

describe('starSize', () => {
  it('leaves the Sun exactly where it was, so the Solar System is untouched', () => {
    expect(starSize(1)).toBe(1)
  })

  it('draws every star kind at a distinguishable size', () => {
    const drawn = STAR_KINDS.map((k) => Math.round(10 * starSize(k.mass)))
    expect(drawn).toEqual([...drawn].sort((a, b) => a - b))
    expect(new Set(drawn).size).toBe(STAR_KINDS.length)
  })

  it('compresses the range, so no star swallows the innermost orbit', () => {
    // True radii span about 7×; drawn, that is pulled in to roughly 2×, which
    // is the whole reason a blue-white star still leaves its inner planets room.
    const spread = starSize(2.4) / starSize(0.28)
    expect(spread).toBeGreaterThan(1.7)
    expect(spread).toBeLessThan(2.2)
  })

  it('stays sane at both ends of the mass slider', () => {
    for (const m of [MASS_MIN, MASS_MAX, 0, -5, 1e9]) {
      expect(starSize(m)).toBeGreaterThanOrEqual(0.62)
      expect(starSize(m)).toBeLessThanOrEqual(1.3)
    }
  })
})

describe('the built-in systems', () => {
  it('carries the measured orbits straight through to the Solar System', () => {
    expect(MILKY_WAY.origin).toBe('measured')
    expect(MILKY_WAY.bodies).toHaveLength(9)
    MILKY_WAY.bodies.forEach((b, i) => {
      expect(b.a).toBe(ORBITS[i][1])
      expect(b.period).toBe(ORBITS[i][2])
      // Pluto has no CC BY photographic map, so it renders procedurally and
      // claims its measured identity through the canonical seed instead.
      if (b.name === 'Pluto') expect(b.texture).toBeNull()
      else expect(b.texture).toMatch(/^images2k\//)
    })
    expect(MILKY_WAY.bodies.find((b) => b.name === 'Saturn')?.ring).toBeTruthy()
  })

  it("gives Pluto its odd orbit: crossing Neptune's, well out of the plane", () => {
    const pluto = MILKY_WAY.bodies.find((b) => b.name === 'Pluto')!
    const neptune = MILKY_WAY.bodies.find((b) => b.name === 'Neptune')!
    // Perihelion inside Neptune's orbit — the 1979–1999 arrangement, forever.
    expect(pluto.a * (1 - pluto.e)).toBeLessThan(neptune.a)
    expect(pluto.inc).toBeGreaterThan(15)
    // Mutually locked with Charon, spinning backwards, on its side and then some.
    expect(pluto.day).toBeLessThan(0)
    expect(pluto.tilt).toBeGreaterThan(90)
  })

  it('keeps the Sun exactly white, which is what leaves it rendered untouched', () => {
    // The star shader paints the Sun from a hand-tuned ramp and generates every
    // other star from its own colour, crossfading on distance from white. Give
    // the Sun a tint and it quietly stops being the painted one.
    expect(MILKY_WAY.star.color).toBe(0xffffff)
  })

  it('labels the observed systems and gives their imagined surfaces no maps', () => {
    for (const s of [TRAPPIST, PROXIMA, PEGASI_51, KEPLER_452]) {
      expect(s.origin).toBe('observed')
      expect(s.sub).toMatch(/observed/)
      for (const b of s.bodies) expect(b.texture).toBeNull()
    }
  })

  it('carries measured periods that Kepler reproduces from the distances', () => {
    // The observed orbits must be self-consistent under the same law the app
    // uses everywhere, or duplicating one would visibly re-time it on save.
    for (const s of [TRAPPIST, PROXIMA, PEGASI_51, KEPLER_452]) {
      for (const b of s.bodies) {
        const derived = periodFor(b.a, s.star.mass)
        expect(Math.abs(derived - b.period) / b.period, b.name).toBeLessThan(0.02)
      }
    }
  })

  it('lets a duplicated TRAPPIST-1 survive sanitisation intact', () => {
    const out = sanitizeSystem(duplicateSystem(TRAPPIST))
    expect(out.origin).toBe('custom')
    expect(out.bodies).toHaveLength(7)
    // The tightest orbit sits inside the old 0.04 AU floor; the new floor
    // keeps its measured distance rather than shoving it outward.
    expect(out.bodies[0].a).toBeCloseTo(0.01154, 5)
    expect(out.star.mass).toBeCloseTo(0.0898, 4)
  })

  it('marks every homage system as imagined, with no photographic maps', () => {
    for (const s of [ERIDANI_40, TAU_CETI, ALPHA_CENTAURI]) {
      expect(s.origin, s.name).toBe('imagined')
      expect(s.sub, s.name).toMatch(/imagined/)
      for (const b of s.bodies) expect(b.texture, b.name).toBeNull()
    }
  })

  it('derives every homage year from its own star, like everything else', () => {
    // The fictions are invented but the physics is not negotiable: a saved
    // copy re-derives periods on sanitisation, so they must already agree.
    for (const s of [ERIDANI_40, TAU_CETI, ALPHA_CENTAURI]) {
      for (const b of s.bodies) {
        const derived = periodFor(b.a, s.star.mass)
        expect(Math.abs(derived - b.period) / b.period, b.name).toBeLessThan(0.001)
      }
    }
  })

  it('gives every story world its canonical seed, so its scan is the fiction', () => {
    const seeds: Record<string, number | undefined> = {
      Erid: 2021, Adrian: 1021, Pandora: 2009,
    }
    for (const s of [ERIDANI_40, TAU_CETI, ALPHA_CENTAURI]) {
      for (const b of s.bodies) {
        if (seeds[b.name] !== undefined) expect(b.params.seed, b.name).toBe(seeds[b.name])
      }
    }
  })

  it('keeps Pandora outside Polyphemus, since it cannot ride it as a moon', () => {
    const [polyphemus, pandora] = ALPHA_CENTAURI.bodies
    expect(polyphemus.name).toBe('Polyphemus')
    expect(pandora.name).toBe('Pandora')
    expect(pandora.a).toBeGreaterThan(polyphemus.a)
    expect(ALPHA_CENTAURI.sub).toMatch(/moon/)
  })

  it('draws Pandora clear of Polyphemus even at conjunction', () => {
    // In same-size mode every planet is a 0.24-radius disc, so these two
    // drawn orbits need at least 0.48 of separation or a conjunction pushes
    // the moon through its own planet's surface, once a minute, on screen.
    const [polyphemus, pandora] = ALPHA_CENTAURI.bodies
    expect(sameDist(pandora.a) - sameDist(polyphemus.a)).toBeGreaterThan(0.48)
  })

  it('marks Andromeda as imagined and gives it no photographic maps', () => {
    expect(ANDROMEDA.origin).toBe('imagined')
    expect(ANDROMEDA.sub).toMatch(/imagined/)
    for (const b of ANDROMEDA.bodies) expect(b.texture).toBeNull()
  })

  it('derives Andromeda’s years from its own star', () => {
    for (const b of ANDROMEDA.bodies) {
      expect(b.period).toBeCloseTo(periodFor(b.a, ANDROMEDA.star.mass), 6)
    }
  })
})

describe('sanitizeSystem', () => {
  it('never lets a payload claim its numbers are measured', () => {
    const out = sanitizeSystem({ ...MILKY_WAY, origin: 'measured' })
    expect(out.origin).toBe('custom')
  })

  it('clamps everything hostile without throwing', () => {
    const out = sanitizeSystem({
      id: '../../etc/passwd',
      name: '  ',
      star: { name: '', color: 1e12, mass: 9999 },
      bodies: Array.from({ length: 50 }, () => ({
        name: '',
        a: 1e9,
        e: 5,
        radius: 999,
        period: 0.0001,
        params: { preset: 'temperate', water: 5, texture: '../../etc/passwd' },
        ring: { inner: -5, outer: 1e9, opacity: 44, map: '/etc/passwd', bands: [[9, 9, 9, 9]] },
      })),
    })

    expect(out.id).toBe('etcpasswd')
    expect(out.name).toBe('Untitled system')
    expect(out.star.mass).toBe(MASS_MAX)
    expect(out.star.color).toBeLessThanOrEqual(0xffffff)
    expect(out.bodies).toHaveLength(MAX_BODIES)

    const b = out.bodies[0]
    expect(b.a).toBe(A_MAX)
    expect(b.e).toBeLessThanOrEqual(0.7)
    expect(b.radius).toBeLessThanOrEqual(16)
    expect(b.params.texture).toBeNull()
    expect(b.params.water).toBe(1)
    expect(b.ring?.map).toBeUndefined()
    expect(b.ring?.opacity).toBeLessThanOrEqual(1)
  })

  it('derives the period rather than trusting the one it was sent', () => {
    const out = sanitizeSystem({
      star: { mass: 1 },
      bodies: [{ name: 'X', a: 4, period: 0.001, params: DEFAULT_PARAMS }],
    })
    expect(out.bodies[0].period).toBeCloseTo(periodFor(4, 1), 6)
  })

  it('survives rubbish input', () => {
    for (const junk of [null, undefined, 42, 'nope', [], { bodies: 'no' }]) {
      const out = sanitizeSystem(junk)
      expect(out.origin).toBe('custom')
      expect(out.bodies).toEqual([])
    }
  })

  it('orders a saved system outward from its star', () => {
    const out = sanitizeSystem({
      star: { mass: 1 },
      bodies: [3, 0.5, 9, 1].map((a) => ({ name: `w${a}`, a, params: DEFAULT_PARAMS })),
    })
    expect(out.bodies.map((b) => b.a)).toEqual([0.5, 1, 3, 9])
  })
})

describe('duplicateSystem', () => {
  const copy = duplicateSystem(MILKY_WAY)

  it('becomes editable but keeps what makes the planets look right', () => {
    expect(copy.origin).toBe('custom')
    expect(copy.bodies.map((b) => b.texture)).toEqual(MILKY_WAY.bodies.map((b) => b.texture))
    expect(copy.bodies.find((b) => b.name === 'Saturn')?.ring).toBeTruthy()
  })

  it('does not share state with the original', () => {
    const c = duplicateSystem(MILKY_WAY)
    c.bodies[0].a = 99
    c.bodies[0].params.seed = 1
    c.star.mass = 2
    expect(MILKY_WAY.bodies[0].a).toBe(ORBITS[0][1])
    expect(MILKY_WAY.bodies[0].params.seed).not.toBe(1)
    expect(MILKY_WAY.star.mass).toBe(1)
  })
})

describe('retime', () => {
  it('re-derives every period when the star changes', () => {
    const heavier = retime({ ...duplicateSystem(ANDROMEDA), star: { ...ANDROMEDA.star, mass: 2 } })
    heavier.bodies.forEach((b, i) => {
      expect(b.period).toBeCloseTo(periodFor(b.a, 2), 6)
      expect(b.period).toBeLessThan(ANDROMEDA.bodies[i].period)
    })
  })
})

describe('bodyFromWorld', () => {
  it('is deterministic for a given world', () => {
    const a = bodyFromWorld('X', DEFAULT_PARAMS, 1, 1)
    const b = bodyFromWorld('X', DEFAULT_PARAMS, 1, 1)
    expect(a).toEqual(b)
  })

  it('turns a retrograde sculpt into a retrograde day', () => {
    expect(dayFor({ ...DEFAULT_PARAMS, spinDir: -1 })).toBeLessThan(0)
    expect(dayFor({ ...DEFAULT_PARAMS, spinDir: 1 })).toBeGreaterThan(0)
    // A faster spin slider means a shorter day.
    expect(dayFor({ ...DEFAULT_PARAMS, spinSpeed: 1 })).toBeLessThan(
      dayFor({ ...DEFAULT_PARAMS, spinSpeed: 0 }),
    )
  })

  it('places each new world outside the last', () => {
    let def = { ...ANDROMEDA, bodies: [] as typeof ANDROMEDA.bodies }
    for (let i = 0; i < 3; i++) {
      const a = nextDistance(def)
      def = { ...def, bodies: sortByDistance([...def.bodies, bodyFromWorld(`w${i}`, DEFAULT_PARAMS, a, 1)]) }
    }
    const dists = def.bodies.map((b) => b.a)
    expect(dists).toEqual([...dists].sort((x, y) => x - y))
    expect(new Set(dists).size).toBe(3)
  })
})

describe('adding a world', () => {
  /** A system filled to the limit, one rolled world at a time. */
  const filled = () => {
    let s = emptySystem(3)
    for (let i = 0; i < MAX_BODIES; i++) s = addRolledWorld(s, undefined, i)
    return s
  }

  it('rolls the type it was asked for, straight into orbit', () => {
    // The point of this route is that a world need never pass through the
    // sculptor at all, so the system has to come back with one already in it.
    const s = addRolledWorld(emptySystem(7), 'ice', 42)
    expect(s.bodies).toHaveLength(1)
    expect(s.bodies[0].params.preset).toBe('ice')
  })

  it('is reproducible from its seed', () => {
    expect(addRolledWorld(emptySystem(7), 'lava', 9)).toEqual(addRolledWorld(emptySystem(7), 'lava', 9))
  })

  it('keeps every orbit distinct even when the system is filled to the limit', () => {
    // Geometric spacing alone overshoots the outer limit around the tenth
    // world; clamping there would stack the last few at the same distance.
    const dists = filled().bodies.map((b) => b.a)
    expect(dists).toHaveLength(MAX_BODIES)
    for (let i = 1; i < dists.length; i++) expect(dists[i]).toBeGreaterThan(dists[i - 1])
    expect(Math.max(...dists)).toBeLessThanOrEqual(A_MAX)
  })

  it('refuses a full system rather than dropping the world in silence', () => {
    const s = filled()
    expect(hasRoom(s)).toBe(false)
    expect(addWorld(s, 'One more', DEFAULT_PARAMS)).toBe(s)
  })

  it('adds to an editable copy when the system is read-only', () => {
    // From the world gallery the system is not even on screen, so refusing the
    // click would be inexplicable — copying the Solar System is the honest move.
    const out = addWorld(MILKY_WAY, 'Peachmoss', DEFAULT_PARAMS)
    expect(out.origin).toBe('custom')
    expect(out.bodies).toHaveLength(MILKY_WAY.bodies.length + 1)
    expect(out.bodies.at(-1)?.name).toBe('Peachmoss')
    expect(out.bodies.at(-1)!.a).toBeGreaterThan(MILKY_WAY.bodies.at(-1)!.a)

    expect(MILKY_WAY.origin).toBe('measured')
    expect(MILKY_WAY.bodies).toHaveLength(9)
  })

  it('never leaves a world nameless', () => {
    expect(addWorld(emptySystem(1), '   ', DEFAULT_PARAMS).bodies[0].name).toBe('Untitled world')
  })
})

describe('duplicateBody', () => {
  const base = addWorld(emptySystem(5), 'Mirabelle', DEFAULT_PARAMS)
  const dup = duplicateBody(base, 0)

  it('copies the world onto its own orbit further out', () => {
    expect(dup.bodies).toHaveLength(2)
    expect(dup.bodies[1].a).toBeGreaterThan(dup.bodies[0].a)
    expect(dup.bodies[1].period).toBeCloseTo(periodFor(dup.bodies[1].a, dup.star.mass), 6)
    expect(dup.bodies[1].params).toEqual(base.bodies[0].params)
  })

  it('carries the name on down the line rather than calling it a copy', () => {
    expect(dup.bodies[1].name).toBe('Mirabelle II')
    expect(duplicateBody(dup, 0).bodies.at(-1)?.name).toBe('Mirabelle III')
    // A world that already has a suffix carries on from where it is, rather
    // than backfilling a lower numeral: a copy of Mirabelle II is Mirabelle III.
    expect(duplicateBody(dup, 1).bodies.at(-1)?.name).toBe('Mirabelle III')
    const iv = addWorld(emptySystem(5), 'Mirabelle IV', DEFAULT_PARAMS)
    expect(duplicateBody(iv, 0).bodies.at(-1)?.name).toBe('Mirabelle V')
    // Names a sculpted world happens to carry are never mistaken for numerals.
    const minor = addWorld(emptySystem(5), 'Glimkin Minor', DEFAULT_PARAMS)
    expect(duplicateBody(minor, 0).bodies.at(-1)?.name).toBe('Glimkin Minor II')
  })

  it('does not share state with the world it copied', () => {
    const d = duplicateBody(base, 0)
    d.bodies[1].params.seed = 999
    expect(base.bodies[0].params.seed).not.toBe(999)
  })

  it('refuses an index that is not a world, or a system it may not edit', () => {
    expect(duplicateBody(base, 9)).toBe(base)
    expect(duplicateBody(MILKY_WAY, 0)).toBe(MILKY_WAY)
  })
})

describe('rollSystem', () => {
  it('is reproducible from its seed', () => {
    expect(rollSystem(1234)).toEqual(rollSystem(1234))
    expect(rollSystem(1234).name).not.toBe(rollSystem(4321).name)
  })

  it('always produces something the server would accept unchanged', () => {
    for (let seed = 0; seed < 40; seed++) {
      const rolled = rollSystem(seed)
      expect(rolled.bodies.length).toBeGreaterThanOrEqual(3)
      expect(rolled.bodies.length).toBeLessThanOrEqual(MAX_BODIES)

      const clean = sanitizeSystem(rolled)
      expect(clean.bodies).toHaveLength(rolled.bodies.length)
      // Distances strictly increase outward, so no two worlds share an orbit.
      const dists = clean.bodies.map((b) => b.a)
      for (let i = 1; i < dists.length; i++) expect(dists[i]).toBeGreaterThan(dists[i - 1])
      // And every year is the one its distance implies.
      for (const b of clean.bodies) {
        expect(b.period).toBeCloseTo(periodFor(b.a, clean.star.mass), 6)
      }
    }
  })
})

describe('worldInSystem', () => {
  const params = { ...DEFAULT_PARAMS, seed: 777 }

  it('finds a world that was added, whatever it was renamed to', () => {
    const sys = addWorld(emptySystem(1), 'Original', params)
    expect(worldInSystem(sys, params)).toBe(true)
    // Identity is the params, not the name on the card.
    const renamed = {
      ...sys,
      bodies: sys.bodies.map((b) => ({ ...b, name: 'Something else' })),
    }
    expect(worldInSystem(renamed, params)).toBe(true)
  })

  it('does not match a different world of the same type', () => {
    const sys = addWorld(emptySystem(1), 'Original', params)
    expect(worldInSystem(sys, { ...params, seed: 778 })).toBe(false)
    expect(worldInSystem(sys, { ...params, water: params.water + 0.2 })).toBe(false)
  })

  it('ignores render controls, which are not part of a world', () => {
    const sys = addWorld(emptySystem(1), 'Original', params)
    expect(
      worldInSystem(sys, { ...params, mode: 'system', sizeMode: 'scale', showPaths: false }),
    ).toBe(true)
  })

  it('is empty-system safe', () => {
    expect(worldInSystem(emptySystem(1), params)).toBe(false)
  })
})
