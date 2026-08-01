import { describe, expect, it } from 'vitest'
import { CURRENT_GENERATOR_VERSION, type PlanetParams, type SystemBody, type SystemDef } from './types'
import {
  circulationCells, circulationMoisture, climateForBody, EARTH_OBLIQUITY_TERM,
  habitableZoneFor,
  obliquityTerm, standaloneClimate, stellarLuminosity,
} from './climate'
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

describe('which end of the world is cold', () => {
  it('reproduces the textbook coefficient for Earth', () => {
    // The second Legendre coefficient of annual-mean insolation. Earth's tilt
    // gives -0.477 in every textbook that prints it.
    expect(obliquityTerm(23.44)).toBeCloseTo(-0.477, 3)
  })

  it('flattens at 54.7 degrees and turns over beyond it', () => {
    // Past this tilt a pole receives more light over a year than the equator,
    // so the ordinary arrangement of a planet inverts. A monotonic pole
    // gradient cannot express that, and Uranus is the world that needs it.
    expect(obliquityTerm(54.7356)).toBeCloseTo(0, 4)
    expect(obliquityTerm(97.77)).toBeGreaterThan(0)
    expect(obliquityTerm(0)).toBeCloseTo(-0.625, 3)
  })

  it('leaves an ordinary tilt drawing exactly as it did', () => {
    // The terrain scales its gradient by this over Earth's own value, so an
    // Earth-tilted world comes out at exactly 1 and changes by nothing at all.
    expect(obliquityTerm(23.44) / EARTH_OBLIQUITY_TERM).toBe(1)
  })
})

describe('how many circulation cells fit', () => {
  it('gives Earth three, Venus one and Jupiter five', () => {
    // Held-Hou: a Hadley cell's width goes as the inverse square root of the
    // rotation rate. These are the counts those worlds actually have.
    expect(circulationCells(23.934)).toBe(3)
    expect(circulationCells(-5832.5)).toBe(1)
    expect(circulationCells(9.925)).toBe(5)
  })

  it('puts Earth’s dry belt at thirty degrees', () => {
    // Nowhere is this number written down: it is where three cells come back
    // down. It is also the Sahara, the Arabian, the Kalahari, the Atacama and
    // the Australian, which is the whole argument for deriving it.
    const at = (lat: number) => circulationMoisture(lat, 3)
    expect(at(0)).toBeCloseTo(1, 6)
    expect(at(30)).toBeCloseTo(0, 6)
    expect(at(60)).toBeCloseTo(1, 6)
    expect(at(90)).toBeCloseTo(0, 6)
    // A belt, not a line: the whole subtropics are dry.
    expect(at(20)).toBeLessThan(0.3)
    expect(at(40)).toBeLessThan(0.3)
  })

  it('leaves a slow world with no dry belt to put a desert in', () => {
    // One cell from equator to pole, drying all the way, and no belt anywhere.
    const venus = (lat: number) => circulationMoisture(lat, circulationCells(-5832.5))
    for (let lat = 0; lat < 90; lat += 5) {
      expect(venus(lat), `${lat}°`).toBeGreaterThan(venus(lat + 5))
    }
  })

  it('carries the tilt and the day into the climate a body is given', () => {
    // The terrain reads both off the climate rather than being plumbed them
    // separately, so they have to survive the trip.
    const climate = standaloneClimate({ ...DEFAULT_PARAMS })
    expect(climate.axialTiltDeg).toBeCloseTo(23.44, 6)
    expect(climate.dayHours).toBeCloseTo(23.934, 6)
  })
})
