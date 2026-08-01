import { describe, expect, it } from 'vitest'
import { MILKY_WAY } from '../data/systems'
import { skyFrom } from './sky'

const DEG = 180 / Math.PI
const ARCSEC = DEG * 3600

/** Angular diameter in degrees, which is how everybody quotes a sun. */
const across = (ang: number) => 2 * ang * DEG

describe('the sun in somebody’s sky', () => {
  it('is the size it really is, from wherever you stand', () => {
    // These are the numbers in every textbook, and the reason the option is
    // worth having: the orbit view pulls Neptune in to eight times Mercury's
    // distance rather than seventy-seven, so nothing in it can show you this.
    //
    // Quoted as a range because an orbit is an ellipse and these are the two
    // ends of it — Mercury's sun really does swell by half again between
    // aphelion and perihelion, and Pluto's by two thirds.
    const span = (name: string, period: number) => {
      let lo = Infinity
      let hi = 0
      for (let i = 0; i < 200; i++) {
        const d = across(skyFrom(MILKY_WAY, name, (i / 200) * period)!.star.ang)
        lo = Math.min(lo, d)
        hi = Math.max(hi, d)
      }
      return [lo, hi]
    }
    const [mercLo, mercHi] = span('Mercury', 0.2408)
    expect(mercLo).toBeCloseTo(1.14, 2)
    expect(mercHi).toBeCloseTo(1.73, 2)
    const [earthLo, earthHi] = span('Earth', 1)
    expect(earthLo).toBeCloseTo(0.525, 3)
    expect(earthHi).toBeCloseTo(0.542, 3)
    const [plutoLo, plutoHi] = span('Pluto', 247.94)
    expect(plutoLo).toBeCloseTo(0.0108, 4)
    expect(plutoHi).toBeCloseTo(0.018, 4)
    // Mercury's sun is a hundred times the width of Pluto's, and the sky is
    // the only place in the app where that ratio is drawn as it stands.
    expect(mercHi / plutoLo).toBeGreaterThan(100)
  })

  it('is a point of light from the far end of the system', () => {
    // Under a hundredth of a degree. A renderer that draws this honestly has
    // to give it a floor or it disappears, which is worth saying out loud.
    expect(across(skyFrom(MILKY_WAY, 'Pluto', 0)!.star.ang)).toBeLessThan(0.02)
  })
})

describe('the planets in somebody’s sky', () => {
  it('are points of light, every one of them, from Earth', () => {
    // The whole argument for drawing them as points. Jupiter is the largest
    // planet in the sky and it is still under a minute of arc — a fiftieth of
    // the Moon, which is the one thing up there that is not a point.
    const sky = skyFrom(MILKY_WAY, 'Earth', 0)!
    for (const b of sky.bodies) {
      expect(across(b.ang) * 60, b.name).toBeLessThan(1)
    }
    const jupiter = sky.bodies.find((b) => b.name === 'Jupiter')!
    expect(across(jupiter.ang) * ARCSEC / DEG).toBeGreaterThan(20)
  })

  it('never includes the world you are standing on', () => {
    for (const name of ['Earth', 'Mars', 'Neptune']) {
      const sky = skyFrom(MILKY_WAY, name, 0)!
      expect(sky.bodies.map((b) => b.name)).not.toContain(name)
    }
  })

  it('is dimmer the further away the same body gets', () => {
    // Mars from Earth against Mars from Neptune: same disc, same sunlight
    // falling on it, thirty times further to travel back.
    const near = skyFrom(MILKY_WAY, 'Earth', 0)!.bodies.find((b) => b.name === 'Mars')!
    const far = skyFrom(MILKY_WAY, 'Neptune', 0)!.bodies.find((b) => b.name === 'Mars')!
    expect(near.bright).toBeGreaterThan(far.bright * 50)
  })

  it('shows a phase, and it is full when the sun is behind you', () => {
    const sky = skyFrom(MILKY_WAY, 'Earth', 0)!
    for (const b of sky.bodies) {
      expect(b.phase, b.name).toBeGreaterThanOrEqual(0)
      expect(b.phase, b.name).toBeLessThanOrEqual(1)
    }
    // An outer planet seen from an inner one is never far from full: the sun
    // is always more or less behind the observer.
    const neptune = sky.bodies.find((b) => b.name === 'Neptune')!
    expect(neptune.phase).toBeGreaterThan(0.9)
  })
})

describe('a moon’s sky', () => {
  it('is its planet’s sky, without the planet in it', () => {
    // Titan is 0.008 AU from Saturn — a twentieth of a degree of parallax on
    // the Sun, and nothing at all on anything else. It observes from Saturn.
    const titan = skyFrom(MILKY_WAY, 'Titan', 0)!
    const saturn = skyFrom(MILKY_WAY, 'Saturn', 0)!
    expect(titan.star.ang).toBeCloseTo(saturn.star.ang, 6)
    for (let i = 0; i < 3; i++) {
      expect(titan.star.dir[i]).toBeCloseTo(saturn.star.dir[i], 6)
    }
    // Saturn itself is left out: the view already draws it, filling 28° of
    // Titan's sky, and drawing it twice would be worse than not at all.
    expect(titan.bodies.map((b) => b.name)).not.toContain('Saturn')
    expect(titan.bodies.map((b) => b.name)).toContain('Jupiter')
  })

  it('leaves other planets’ moons out, being specks beside their planets', () => {
    const sky = skyFrom(MILKY_WAY, 'Earth', 0)!
    for (const name of ['Titan', 'Io', 'Europa', 'Moon', 'Triton']) {
      expect(sky.bodies.map((b) => b.name)).not.toContain(name)
    }
  })
})

describe('the sky moves', () => {
  it('turns as the years pass, and comes back round', () => {
    const at = (t: number) => skyFrom(MILKY_WAY, 'Earth', t)!.star.dir
    const start = at(0)
    // Half a year: Earth is round the other side, so the Sun is very nearly
    // opposite — nearly, and not exactly, because the orbit is an ellipse and
    // half a period is not half a lap. The miss peaks at four times the
    // eccentricity in radians, which for Earth's 0.0167 is 3.8°. That it is
    // not zero is the ellipse showing through, and worth asserting both ways.
    const half = at(0.5)
    const opposed = -(start[0] * half[0] + start[1] * half[1] + start[2] * half[2])
    const missDeg = (Math.acos(Math.min(1, opposed)) * 180) / Math.PI
    expect(missDeg).toBeGreaterThan(0)
    expect(missDeg).toBeLessThanOrEqual((4 * 0.0167 * 180) / Math.PI)
    // A full year and it is back where it began — to within the few parts per
    // million the shared Kepler solver leaves after its five iterations, which
    // is a thousandth of a pixel anywhere it could possibly be drawn.
    const full = at(1)
    for (let i = 0; i < 3; i++) expect(full[i]).toBeCloseTo(start[i], 4)
  })

  it('has nothing to say about a world that is not in the system', () => {
    expect(skyFrom(MILKY_WAY, 'Peachmoss', 0)).toBeNull()
  })
})
