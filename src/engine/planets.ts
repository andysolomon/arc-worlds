import type { OrbitRow, PlanetParams, RealBody } from './types'

/**
 * Measured values for the real bodies.
 *
 *   f    oblateness (flattening)
 *   ob   axial tilt, degrees
 *   day  sidereal rotation period, hours (negative = retrograde)
 *
 * Ring radii and moon `a`/`r` are in equatorial planet radii; moon `P` is in
 * days (negative = retrograde) and `inc` is degrees from the planet's equator.
 */
export const REAL: Record<string, RealBody> = {
  mercury: { f: 0.0009, ob: 0.034, day: 1407.6, moons: [] },
  venus: { f: 0.0, ob: 177.36, day: -5832.5, moons: [] },

  temperate: {
    f: 0.00335, ob: 23.44, day: 23.934,
    // The maria are on the near side, and the near side is the only one anyone
    // saw until 1959: the tone pair is the measured albedo difference — pale
    // anorthosite highlands at 13%, dark basalt seas at 7% — and `mark` turns
    // that difference toward us, where the lock holds it.
    moons: [{
      n: 'Moon', r: 0.2727, a: 60.34, P: 27.322, inc: 23.4, c: 0x9a9490,
      tone: [0xa9a39b, 0x565049], mark: Math.PI, world: { preset: 'luna', seed: 1969 },
    }],
  },

  mars: {
    f: 0.00589, ob: 25.19, day: 24.623,
    moons: [
      { n: 'Phobos', r: 0.00332, a: 2.76, P: 0.3189, inc: 1.08, c: 0x6d6157, irr: [1, 0.81, 0.67] },
      { n: 'Deimos', r: 0.00183, a: 6.92, P: 1.2624, inc: 1.79, c: 0x7d7268, irr: [1, 0.81, 0.73] },
    ],
  },

  jupiter: {
    f: 0.06487, ob: 3.13, day: 9.925,
    ring: { inner: 1.72, outer: 1.81, color: 0xb08a70, opacity: 0.1, profile: 3 },
    moons: [
      { n: 'Io', r: 0.02605, a: 6.03, P: 1.769, inc: 0.05, c: 0xd9c162, world: { preset: 'io', seed: 1610 } },
      { n: 'Europa', r: 0.02233, a: 9.6, P: 3.551, inc: 0.47, c: 0xcdbda6, world: { preset: 'europa', seed: 1611 } },
      { n: 'Ganymede', r: 0.03768, a: 15.31, P: 7.155, inc: 0.2, c: 0x9a8b7c, world: { preset: 'ganymede', seed: 1612 } },
      { n: 'Callisto', r: 0.03448, a: 26.93, P: 16.689, inc: 0.19, c: 0x6a5f55 },
    ],
  },

  saturn: {
    f: 0.09796, ob: 26.73, day: 10.656,
    ring: { inner: 1.11, outer: 2.32, color: 0xffffff, opacity: 1, profile: 4 },
    moons: [
      { n: 'Enceladus', r: 0.00433, a: 4.09, P: 1.37, inc: 0.02, c: 0xf4f2ec, world: { preset: 'enceladus', seed: 1789 } },
      { n: 'Tethys', r: 0.00912, a: 5.06, P: 1.888, inc: 1.09, c: 0xd8d4cb },
      { n: 'Dione', r: 0.00964, a: 6.48, P: 2.737, inc: 0.02, c: 0xcfcabf },
      { n: 'Rhea', r: 0.01312, a: 9.05, P: 4.518, inc: 0.35, c: 0xc6c0b5 },
      { n: 'Titan', r: 0.04422, a: 20.98, P: 15.945, inc: 0.33, c: 0xd9a054, world: { preset: 'titan', seed: 1655 } },
      // Cassini Regio faces the way Iapetus is going: it is dark because of
      // what it sweeps up, so the mark belongs on the leading hemisphere.
      { n: 'Iapetus', r: 0.01261, a: 61.15, P: 79.32, inc: 15.47, c: 0xffffff, tone: [0xb9ae96, 0x2e2620], mark: -Math.PI / 2 },
    ],
  },

  uranus: {
    f: 0.02293, ob: 97.77, day: -17.24,
    ring: { inner: 1.6, outer: 2.02, color: 0xb4c0c4, opacity: 1, profile: 5 },
    moons: [
      { n: 'Miranda', r: 0.0093, a: 5.12, P: 1.413, inc: 4.23, c: 0xb0aca6 },
      { n: 'Ariel', r: 0.02283, a: 7.53, P: 2.52, inc: 0.26, c: 0xc4c0b8 },
      { n: 'Umbriel', r: 0.02305, a: 10.49, P: 4.144, inc: 0.13, c: 0x76726c },
      { n: 'Titania', r: 0.03109, a: 17.2, P: 8.706, inc: 0.34, c: 0xa8a29a },
      { n: 'Oberon', r: 0.03002, a: 23.01, P: 13.463, inc: 0.06, c: 0x968f88 },
    ],
  },

  neptune: {
    f: 0.01708, ob: 28.32, day: 16.11,
    ring: { inner: 1.69, outer: 2.55, color: 0x9fb0d4, opacity: 1, profile: 6 },
    moons: [
      { n: 'Proteus', r: 0.00848, a: 4.75, P: 1.122, inc: 0.52, c: 0x605c58, irr: [1, 0.92, 0.94] },
      { n: 'Triton', r: 0.05465, a: 14.33, P: -5.877, inc: 156.9, c: 0xd8cfc4, world: { preset: 'triton', seed: 1846 } },
      { n: 'Nereid', r: 0.00686, a: 222.7, P: 360.14, e: 0.751, inc: 32.6, c: 0x8d8880, irr: [1, 0.9, 0.86] },
    ],
  },

  // The promoted moons. Every one is tidally locked, so its sidereal day is
  // its orbital period — the same one-face-inward rule the moon meshes already
  // follow — and each claims its measured identity through a canonical seed
  // because no photographic map for it exists in the CC BY set.
  luna: { seed: 1969, f: 0.0012, ob: 6.68, day: 655.73, moons: [] },
  io: { seed: 1610, f: 0.0, ob: 0.0, day: 42.46, moons: [] },
  europa: { seed: 1611, f: 0.0, ob: 0.1, day: 85.22, moons: [] },
  ganymede: { seed: 1612, f: 0.0, ob: 0.16, day: 171.72, moons: [] },
  titan: { seed: 1655, f: 0.0, ob: 0.3, day: 382.68, moons: [] },
  enceladus: { seed: 1789, f: 0.0, ob: 0.0, day: 32.89, moons: [] },
  // Triton orbits backwards, and being locked to that orbit it turns backwards
  // with it — the only large moon in the solar system that does.
  triton: { seed: 1846, f: 0.0, ob: 0.0, day: -141.05, moons: [] },

  // Pluto has no CC BY photographic map in our set, so it renders procedurally
  // and claims its measured identity through the canonical seed instead.
  // Charon is over half Pluto's own radius — the two are mutually locked, so
  // the existing one-face-inward moon behaviour is the physically right one.
  pluto: {
    seed: 99, f: 0.0, ob: 122.53, day: -153.29,
    moons: [{ n: 'Charon', r: 0.512, a: 16.5, P: 6.387, inc: 0.08, c: 0x8f8781 }],
  },
}

/**
 * Solar-system orbits: a (AU), period (yr), eccentricity, inclination to the
 * ecliptic, longitude of ascending node, longitude of perihelion (all degrees),
 * and equatorial radius in Earth radii.
 */
export const ORBITS: OrbitRow[] = [
  ['mercury', 0.3871, 0.2408, 0.2056, 7.005, 48.33, 77.46, 0.383],
  ['venus', 0.7233, 0.6152, 0.0068, 3.395, 76.68, 131.6, 0.949],
  ['earth', 1.0, 1.0, 0.0167, 0.0, 0.0, 102.95, 1.0],
  ['mars', 1.5237, 1.8808, 0.0934, 1.85, 49.56, 336.06, 0.532],
  ['jupiter', 5.2029, 11.862, 0.0485, 1.303, 100.46, 14.33, 11.209],
  ['saturn', 9.5367, 29.457, 0.0555, 2.485, 113.66, 93.06, 9.449],
  ['uranus', 19.189, 84.011, 0.0464, 0.773, 74.01, 173.01, 4.007],
  ['neptune', 30.07, 164.79, 0.0095, 1.77, 131.78, 48.12, 3.883],
  // A dwarf planet, and honestly the odd one out: eccentric enough to cross
  // inside Neptune's orbit and inclined 17° out of everyone else's plane.
  ['pluto', 39.482, 247.94, 0.2488, 17.16, 110.3, 224.07, 0.187],
]

/** Earth is keyed `temperate` in REAL, since it doubles as the Meadow preset. */
export function realKeyFor(orbitName: string): string {
  return orbitName === 'earth' ? 'temperate' : orbitName
}

/**
 * The measured body these params are showing, or null for a sculpted world.
 * Identity comes from the photographic map when there is one, and from the
 * canonical seed when there is not; changing the seed detaches either kind.
 */
/**
 * The planet a world is a moon of, when it is one.
 *
 * The measured moon tables already say who orbits whom; this reads them the
 * other way round. Distances come back in the moon's own radii rather than its
 * planet's, which is the frame the single-world view draws in — the moon is
 * the unit sphere there, and everything else is measured against it.
 */
export function parentOf(
  p: Pick<PlanetParams, 'preset' | 'seed'> & { generatorVersion?: PlanetParams['generatorVersion'] },
): {
  key: string
  radius: number
  distance: number
  period: number
  texture?: string | null
  /** Only invented parents carry params; the measured ones have photographs. */
  params?: PlanetParams
} | null {
  for (const key of Object.keys(REAL)) {
    for (const m of REAL[key].moons) {
      if (m.world?.preset !== p.preset || m.world.seed !== p.seed) continue
      // m.r and m.a are both in planet radii, so dividing by m.r converts
      // them into the moon's radii: the planet is 1/m.r across, and sits
      // m.a/m.r away.
      if (!(m.r > 0)) return null
      return { key, radius: 1 / m.r, distance: m.a / m.r, period: m.P }
    }
  }
  return null
}

export function realFor(
  p: Pick<PlanetParams, 'preset' | 'texture' | 'seed'> & { generatorVersion?: PlanetParams['generatorVersion'] },
): RealBody | null {
  const R = REAL[p.preset]
  if (!R) return null
  // A photograph remains a photograph whatever terrain version is selected.
  // Seed-only measured bodies now use the current procedural mechanism too;
  // their canonical preset+seed retains the measured orbit/rotation identity.
  return p.texture || R.seed === p.seed ? R : null
}
