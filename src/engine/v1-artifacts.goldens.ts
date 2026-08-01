/**
 * Full-artifact compatibility fixture for the legacy generator.
 *
 * SHA-256 values cover every byte of the complete typed arrays rather than a
 * handful of samples. Do not regenerate these from a changed implementation:
 * a mismatch is the signal that a v1 world no longer renders as it did when
 * the fixture was captured.
 */
import type { PlanetParams } from './types'

interface V1ArtifactFixture {
  params: PlanetParams
  flat: {
    width: number
    height: number
    bytes: number
    sha256: string
  }
  detailed: {
    detail: 'standard' | 'high'
    vertices: number
    bytesPerAttribute: number
    positionSha256: string
    colorSha256: string
    normalSha256: string
  }
}

export const V1_ARTIFACT_FIXTURE = {
  params: {
    generatorVersion: 1,
    seed: 31174,
    preset: 'temperate',
    mountains: 0.5,
    water: 0.55,
    roughness: 0.5,
    clouds: 0.5,
    glow: 0.5,
    ice: 0.25,
    lightAz: 0.107,
    lightEl: 0.639,
    spinDir: 1,
    spinSpeed: 0.5,
    rings: false,
    ringN: 2,
    ringInner: 0.24,
    ringTilt: 0.5,
    ringWidth: 0.5,
    ringGap: 0.35,
    ringOpacity: 0.7,
    ringColor: null,
    moons: 0,
    atmoColor: null,
    texture: null,
    cloudTexture: null,
  },
  flat: {
    width: 256,
    height: 128,
    bytes: 131072,
    sha256: '62d6b606ea25c440705a13d4e1b0728a0b23f3745e145bb6153fcb849dbb87bf',
  },
  detailed: {
    detail: 'standard',
    vertices: 15855,
    bytesPerAttribute: 190260,
    positionSha256: '40fbf2932fa85239e2a660fe765aa00c23e21d0a9258778b3a9fb038713de30e',
    colorSha256: 'c754c06eacbe6be91af4e63aa0fe53e2db3445328d73dd5d65aed38d49d6cf56',
    normalSha256: '7125ecb4a8cbcd5a58f26980c49ffce8efd4aac66bf53731effad966ac9b4b34',
  },
} as const satisfies V1ArtifactFixture
