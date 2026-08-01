import { describe, expect, it } from 'vitest'
import { bakeWorldPixels } from './bake'
import { V1_ARTIFACT_FIXTURE } from './v1-artifacts.goldens'
import { bakeV1DetailedArtifacts } from './v1-artifacts'

async function sha256(bytes: Uint8Array | Float32Array): Promise<string> {
  // Keep this in Web Crypto so the fixture has no Node-only source import.
  // Copy into a fresh ArrayBuffer; TS keeps the source buffer wide enough to
  // include SharedArrayBuffer, which Web Crypto intentionally refuses.
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength))
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', copy.buffer))
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

describe('v1 complete artifact compatibility', () => {
  const fixture = V1_ARTIFACT_FIXTURE

  it('preserves every byte of the legacy flat map', async () => {
    const pixels = bakeWorldPixels(fixture.params, fixture.flat.width, fixture.flat.height)
    expect(pixels.byteLength).toBe(fixture.flat.bytes)
    expect(await sha256(pixels)).toBe(fixture.flat.sha256)
  })

  it('preserves every byte of legacy detailed position, colour, and normal buffers', async () => {
    const artifact = bakeV1DetailedArtifacts(fixture.params, fixture.detailed.detail)
    expect(artifact.position.length / 3).toBe(fixture.detailed.vertices)
    expect(artifact.position.byteLength).toBe(fixture.detailed.bytesPerAttribute)
    expect(artifact.color.byteLength).toBe(fixture.detailed.bytesPerAttribute)
    expect(artifact.normal.byteLength).toBe(fixture.detailed.bytesPerAttribute)
    expect(await sha256(artifact.position)).toBe(fixture.detailed.positionSha256)
    expect(await sha256(artifact.color)).toBe(fixture.detailed.colorSha256)
    expect(await sha256(artifact.normal)).toBe(fixture.detailed.normalSha256)
  })
})
