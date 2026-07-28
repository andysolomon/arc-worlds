import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, sanitize, serialize, surprise } from './params'
import { computeScan } from './scan'

describe('sanitize', () => {
  it('returns defaults for junk input', () => {
    for (const junk of [null, undefined, 42, 'nope', [], {}]) {
      expect(sanitize(junk)).toEqual(DEFAULT_PARAMS)
    }
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
