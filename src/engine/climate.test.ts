import { describe, expect, it } from 'vitest'
import { CURRENT_GENERATOR_VERSION, type PlanetParams, type SystemBody, type SystemDef } from './types'
import { climateForBody, habitableZoneFor, standaloneClimate, stellarLuminosity } from './climate'
import { DEFAULT_PARAMS } from '../lib/params'

const earthParams: PlanetParams = {
  ...DEFAULT_PARAMS,
  generatorVersion: CURRENT_GENERATOR_VERSION,
  preset: 'temperate',
  water: 0.7,
  ice: 0.08,
  clouds: 0.5,
}

function earthAt(a: number): { system: SystemDef; body: SystemBody } {
  const body: SystemBody = {
    name: 'Earth', a, period: Math.sqrt(a ** 3), e: 0.0167, inc: 0, node: 0, peri: 0,
    radius: 1, tilt: 23.44, flattening: 0.00335, day: 23.934, params: earthParams,
  }
  return {
    body,
    system: {
      id: 'test', name: 'Solar test', sub: '', origin: 'custom',
      star: { name: 'Sun', color: 0xffffff, mass: 1, luminosity: 1 }, bodies: [body],
    },
  }
}

describe('orbital climate', () => {
  it('reproduces a first-order Earth mean and polar ice cap', () => {
    const climate = standaloneClimate(earthParams)
    expect(climate.meanSurfaceTemperatureK).toBeGreaterThan(283)
    expect(climate.meanSurfaceTemperatureK).toBeLessThan(293)
    expect(climate.liquidWater).toBeGreaterThan(0.9)
    expect(climate.iceLineLatitudeDeg).toBeGreaterThan(55)
    expect(climate.iceLineLatitudeDeg).toBeLessThan(90)
    expect(climate.vegetationPotential).toBeGreaterThan(0.7)
  })

  it('freezes Earth when it is moved to Jupiter, the sixth planet orbit', () => {
    const { system, body } = earthAt(5.204)
    const climate = climateForBody(system, body)
    expect(climate.meanSurfaceTemperatureK).toBeLessThan(180)
    expect(climate.liquidWater).toBe(0)
    expect(climate.surfaceIce).toBeGreaterThan(0.9)
    expect(climate.vegetationPotential).toBe(0)
    expect(climate.inHabitableZone).toBe(false)
  })

  it('gives satellites the stellar distance of their parent planet', () => {
    const { system, body: earth } = earthAt(1)
    const moon: SystemBody = {
      ...earth,
      name: 'Moon',
      a: 0.00257,
      e: 0.055,
      radius: 0.273,
      params: { ...earthParams, preset: 'luna' },
      orbits: 'Earth',
    }
    system.bodies.push(moon)
    expect(climateForBody(system, moon).stellarFlux).toBeCloseTo(
      climateForBody(system, earth).stellarFlux,
      6,
    )
  })

  it('uses measured luminosity when supplied and a bounded mass fallback otherwise', () => {
    expect(stellarLuminosity({ mass: 0.1, luminosity: 0.00055 })).toBe(0.00055)
    expect(stellarLuminosity({ mass: 1 })).toBe(1)
    expect(habitableZoneFor({ mass: 1 }).innerAU).toBeLessThan(1)
    expect(habitableZoneFor({ mass: 1 }).outerAU).toBeGreaterThan(1)
  })
})
