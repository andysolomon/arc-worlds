import { describe, expect, it } from 'vitest'
import {
  CURRENT_GENERATOR_VERSION,
  LEGACY_GENERATOR_VERSION,
} from '../engine/types'
import { CURRENT_PARAMS, DEFAULT_PARAMS, sanitize, serialize, surprise } from './params'
import { computeScan } from './scan'

describe('sanitize', () => {
  it('starts every new in-app world on the current generator', () => {
    expect(CURRENT_PARAMS.generatorVersion).toBe(CURRENT_GENERATOR_VERSION)
  })

  it('returns defaults for junk input', () => {
    for (const junk of [null, undefined, 42, 'nope', [], {}]) {
      expect(sanitize(junk)).toEqual(DEFAULT_PARAMS)
    }
  })

  it('treats an absent generator version as legacy v1', () => {
    // This is the migration rule for every shared link saved before terrain
    // versioning existed. It must not follow the default for newly rolled
    // worlds in a future release.
    const legacy = sanitize({ seed: 91234, preset: 'desert' })
    expect(legacy.generatorVersion).toBe(LEGACY_GENERATOR_VERSION)
  })

  it('never persists a derived orbital climate as seed identity', () => {
    const climate = {
      schema: 'arc-worlds-orbital-climate-1' as const,
      source: 'modeled' as const,
      stellarFlux: 1, equilibriumTemperatureK: 255, meanSurfaceTemperatureK: 288,
      perihelionTemperatureK: 290, aphelionTemperatureK: 286, liquidWater: 1,
      surfaceIce: 0.03, vegetationPotential: 1, iceLineLatitudeDeg: 70,
      tidalHeatingK: 0, axialTiltDeg: 23.44, dayHours: 23.934,
      habitableZoneInnerAU: 0.97, habitableZoneOuterAU: 1.67,
      inHabitableZone: true, regime: 'temperate' as const,
    }
    expect(sanitize({ ...CURRENT_PARAMS, climate }).climate).toBeUndefined()
    expect(serialize({ ...CURRENT_PARAMS, climate })).not.toContain('climate')
  })

  it('keeps explicit generator versions and rejects unknown ones', () => {
    expect(sanitize({ generatorVersion: LEGACY_GENERATOR_VERSION }).generatorVersion)
      .toBe(LEGACY_GENERATOR_VERSION)
    expect(sanitize({ generatorVersion: CURRENT_GENERATOR_VERSION }).generatorVersion)
      .toBe(CURRENT_GENERATOR_VERSION)
    expect(sanitize({ generatorVersion: 0 }).generatorVersion).toBe(LEGACY_GENERATOR_VERSION)
    expect(sanitize({ generatorVersion: 3 }).generatorVersion).toBe(LEGACY_GENERATOR_VERSION)
    expect(sanitize({ generatorVersion: '2' }).generatorVersion).toBe(LEGACY_GENERATOR_VERSION)
  })

  it('clamps sliders into 0..1', () => {
    const p = sanitize({ water: 5, mountains: -3, clouds: Number.NaN, glow: Infinity })
    expect(p.water).toBe(1)
    expect(p.mountains).toBe(0)
    expect(p.clouds).toBe(DEFAULT_PARAMS.clouds)
    expect(p.glow).toBe(1)
  })

  it('rejects an unknown preset', () => {
    expect(sanitize({ preset: 'wormhole' }).preset).toBe('temperate')
    expect(sanitize({ preset: 'saturn' }).preset).toBe('saturn')
  })

  it('keeps the story-world presets, so a saved homage survives the trip', () => {
    for (const key of ['erid', 'adrian', 'pandora', 'luna', 'io', 'europa', 'titan', 'triton']) {
      expect(sanitize({ preset: key }).preset).toBe(key)
    }
  })

  // The texture field becomes a URL the browser fetches, so it is the one
  // place a hostile payload could point the app somewhere it should not go.
  it('accepts only known-good texture paths', () => {
    expect(sanitize({ texture: 'images2k/saturn.jpg' }).texture).toBe('images2k/saturn.jpg')
    expect(sanitize({ texture: 'images2k/earthclouds.png' }).texture).toBe('images2k/earthclouds.png')

    for (const bad of [
      '../../etc/passwd',
      'images2k/../../secret.jpg',
      'https://evil.example.com/x.jpg',
      '/etc/passwd',
      'images2k/x.svg',
      'javascript:alert(1)',
      'images2k/a.jpg?x=1',
      42,
      null,
    ]) {
      expect(sanitize({ texture: bad }).texture).toBeNull()
    }
  })

  it('bounds seed, ring count and moon count', () => {
    expect(sanitize({ seed: -5 }).seed).toBeGreaterThanOrEqual(0)
    expect(sanitize({ seed: 1e12 }).seed).toBeLessThan(1_000_000)
    expect(sanitize({ ringN: 99 }).ringN).toBe(4)
    expect(sanitize({ ringN: -1 }).ringN).toBe(1)
    expect(sanitize({ moons: 99 }).moons).toBe(3)
    expect(sanitize({ moons: -1 }).moons).toBe(0)
  })

  it('only allows -1 or 1 for spin direction', () => {
    expect(sanitize({ spinDir: -1 }).spinDir).toBe(-1)
    expect(sanitize({ spinDir: 0 }).spinDir).toBe(1)
    expect(sanitize({ spinDir: 'left' }).spinDir).toBe(1)
  })

  it('is idempotent', () => {
    const once = sanitize({ water: 5, preset: 'lava', texture: 'bad' })
    expect(sanitize(once)).toEqual(once)
  })
})

describe('surprise', () => {
  it('is deterministic for a given seed', () => {
    const a = surprise(1234)
    const b = surprise(1234)
    expect(a).toEqual(b)
  })

  it('varies with the seed', () => {
    expect(surprise(1)).not.toEqual(surprise(2))
  })

  it('always produces params that survive sanitising unchanged', () => {
    for (let s = 0; s < 60; s++) {
      const { params } = surprise(s)
      expect(sanitize(params)).toEqual(params)
    }
  })

  it('opts freshly rolled worlds into the current generator', () => {
    expect(surprise(1234).params.generatorVersion).toBe(CURRENT_GENERATOR_VERSION)
  })
})

describe('serialize', () => {
  it('is stable regardless of key insertion order', () => {
    const a = { ...DEFAULT_PARAMS }
    const b = Object.fromEntries(Object.entries(DEFAULT_PARAMS).reverse()) as typeof DEFAULT_PARAMS
    expect(serialize(a)).toBe(serialize(b))
  })

  it('stays comfortably under 1KB', () => {
    expect(serialize(DEFAULT_PARAMS).length).toBeLessThan(1024)
  })

  it('round-trips generator version as part of the serialized identity', () => {
    for (const generatorVersion of [LEGACY_GENERATOR_VERSION, CURRENT_GENERATOR_VERSION]) {
      const p = { ...DEFAULT_PARAMS, generatorVersion }
      const encoded = serialize(p)
      expect(JSON.parse(encoded).generatorVersion).toBe(generatorVersion)
      expect(sanitize(JSON.parse(encoded))).toEqual(p)
    }
  })
})

describe('computeScan', () => {
  it('is deterministic for the same world', async () => {
    expect(await computeScan(DEFAULT_PARAMS)).toEqual(await computeScan(DEFAULT_PARAMS))
  })

  it('uses the real measured profile for a real planet', async () => {
    const saturn = sanitize({ preset: 'saturn', texture: 'images2k/saturn.jpg' })
    const scan = await computeScan(saturn)
    expect(scan.pressure).toBe('no surface')
    expect(scan.gases[0].f).toBe('H₂')
  })

  it('derives a profile for a sculpted world', async () => {
    const scan = await computeScan(sanitize({ preset: 'temperate', water: 0.55, clouds: 0.6 }))
    expect(scan.gases.length).toBeGreaterThan(0)
    expect(scan.lines.length).toBeGreaterThan(0)
    // Lines must be sorted by wavelength for the spectrum strip to read left-right.
    for (let i = 1; i < scan.lines.length; i++) {
      expect(scan.lines[i].nm).toBeGreaterThanOrEqual(scan.lines[i - 1].nm)
    }
  })

  it('reports free oxygen only on a wet, cloudy world', async () => {
    const wet = await computeScan(sanitize({ preset: 'temperate', water: 0.55, clouds: 0.9 }))
    const dry = await computeScan(sanitize({ preset: 'temperate', water: 0.02, clouds: 0 }))
    const hasO2 = (s: Awaited<ReturnType<typeof computeScan>>) => s.gases.some((g) => g.f === 'O₂')
    expect(hasO2(wet)).toBe(true)
    expect(hasO2(dry)).toBe(false)
  })

  it('never crashes for any preset', () => {
    const presets = ['temperate', 'desert', 'ice', 'lava', 'candy', 'gasAmber', 'gasMist', 'gasStorm']
    for (const preset of presets) {
      for (const water of [0, 0.5, 1]) {
        expect(() => computeScan(sanitize({ preset, water }))).not.toThrow()
      }
    }
  })
})
