import {
  bakeCloudPixels,
  bakeWorldPixels,
  CLOUD_BAKE_HEIGHT,
  CLOUD_BAKE_WIDTH,
  WORLD_BAKE_HEIGHT,
  WORLD_BAKE_WIDTH,
} from './bake'
import type { PlanetParams } from './types'

export type BakeWorkerRequest =
  | { id: number; kind: 'world'; params: PlanetParams }
  | { id: number; kind: 'clouds'; seed: number; cover: number; style?: 'classic' | 'v2'; liquidWater?: number }

export interface BakeWorkerResponse {
  id: number
  kind: BakeWorkerRequest['kind']
  width: number
  height: number
  pixels: ArrayBuffer
}

self.onmessage = (event: MessageEvent<BakeWorkerRequest>) => {
  const request = event.data
  const world = request.kind === 'world'
  const bytes = world
    ? bakeWorldPixels(request.params)
    : bakeCloudPixels(
        request.seed, request.cover, undefined, undefined, request.style, request.liquidWater,
      )
  const response: BakeWorkerResponse = {
    id: request.id,
    kind: request.kind,
    width: world ? WORLD_BAKE_WIDTH : CLOUD_BAKE_WIDTH,
    height: world ? WORLD_BAKE_HEIGHT : CLOUD_BAKE_HEIGHT,
    pixels: bytes.buffer as ArrayBuffer,
  }
  self.postMessage(response, { transfer: [response.pixels] })
}
