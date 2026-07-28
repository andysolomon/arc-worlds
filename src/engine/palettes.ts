import type { Palette, PresetKey } from './types'

/**
 * Colour ramps per world type. Rocky worlds interpolate deep→water→sand→
 * low→mid→high→snow by elevation; gas giants interpolate `bands` by latitude.
 */
export const PALETTES: Record<PresetKey, Palette> = {
  temperate: { water: 0x3f86c9, deep: 0x1d3a5f, sand: 0xe8d8a8, low: 0x7fae62, mid: 0x4e8a4e, high: 0x8a7f6d, snow: 0xf5f2ec, atmo: 0x8fc7ff, waterOpacity: 0.72, cloudO: 0.95 },
  desert: { water: 0x3fae9e, deep: 0x1f5f57, sand: 0xf0d9a0, low: 0xe0b070, mid: 0xc08850, high: 0x8f5f3f, snow: 0xf7e9c9, atmo: 0xffcf8f, waterOpacity: 0.75, cloudO: 0.5 },
  ice: { water: 0x4a7fbf, deep: 0x27476e, sand: 0xdfe8ef, low: 0xc9d9e4, mid: 0xaebfd0, high: 0x8fa3b8, snow: 0xffffff, atmo: 0xbfe4ff, waterOpacity: 0.8, cloudO: 0.85 },
  lava: { water: 0xff5a1f, deep: 0x8a1f00, sand: 0x4a3a35, low: 0x5a4540, mid: 0x3a2d2a, high: 0x241b19, snow: 0xffb35a, atmo: 0xff8a5f, waterOpacity: 0.96, emissive: 0xd93a00, cloudO: 0.3 },
  candy: { water: 0xff9fd0, deep: 0xc75a9e, sand: 0xffe4f0, low: 0xa88fe8, mid: 0x7f6fd0, high: 0x5f4fae, snow: 0xfff4fa, atmo: 0xffb7dd, waterOpacity: 0.8, cloudO: 0.95 },

  gasAmber: {
    gas: true,
    bands: [[0, 0x8f6a48], [0.14, 0xd9b184], [0.28, 0xf0dcbc], [0.4, 0xc98a5f], [0.5, 0xa85f3f], [0.6, 0xe8cba4], [0.74, 0xf4e6cc], [0.88, 0xc9a077], [1, 0x8f6a48]],
    atmo: 0xf0c9a0, cloudO: 0.2,
  },
  gasMist: {
    gas: true,
    bands: [[0, 0x6f9fa8], [0.18, 0xa8dcd8], [0.34, 0xd9f2ee], [0.48, 0x8fc4c4], [0.62, 0xe4f4f0], [0.78, 0xa0cfd0], [1, 0x74a4ac]],
    atmo: 0xc4f0ee, cloudO: 0.2,
  },
  gasStorm: {
    gas: true,
    bands: [[0, 0x2a1f4a], [0.16, 0x4a3480], [0.3, 0x7a4fae], [0.42, 0xb06fc4], [0.52, 0x5f3f96], [0.66, 0x8f5fbc], [0.82, 0x3f2a6a], [1, 0x271c44]],
    atmo: 0xb48fff, cloudO: 0.25,
  },

  // Tholin tans and rusts under bright nitrogen-ice plains, below a haze that
  // really is blue — the ramp runs Cthulhu Macula to Sputnik Planitia.
  pluto: { water: 0x8a6f5a, deep: 0x5f4a3c, sand: 0xcfa87f, low: 0xb5895f, mid: 0x9a7350, high: 0xe0d5c4, snow: 0xf7f4ee, atmo: 0x9fc9ec, waterOpacity: 0.8, cloudO: 0.2 },

  mercury: { water: 0x555055, deep: 0x3a3538, sand: 0x8f8788, low: 0x7a7274, mid: 0x655d60, high: 0x9a9294, snow: 0xb8b0b2, atmo: 0x8a8090, waterOpacity: 0.7, cloudO: 0.2 },
  venus: { water: 0xc98f4f, deep: 0x8a5f2f, sand: 0xe8c088, low: 0xd0a060, mid: 0xb08048, high: 0x8f6538, snow: 0xf0d8a8, atmo: 0xffd98f, waterOpacity: 0.8, cloudO: 1, cloudTint: 0xf0dca8 },
  mars: { water: 0x7a5f50, deep: 0x5f4438, sand: 0xd08858, low: 0xc07040, mid: 0x9a5530, high: 0x784028, snow: 0xe8d8c8, atmo: 0xe8a878, waterOpacity: 0.75, cloudO: 0.25 },

  jupiter: {
    gas: true,
    bands: [[0, 0xb08a60], [0.18, 0xe0c9a0], [0.32, 0xb87850], [0.42, 0xecdfc4], [0.5, 0xc08455], [0.58, 0xf0e4cc], [0.7, 0xc9a878], [0.84, 0xa8886a], [1, 0xc9b090]],
    atmo: 0xe8c9a0, cloudO: 0.25,
  },
  saturn: {
    gas: true,
    bands: [[0, 0xc9ae7f], [0.25, 0xe4d0a4], [0.45, 0xd4ba88], [0.55, 0xeddcb4], [0.7, 0xd9c298], [1, 0xc4a878]],
    atmo: 0xf0dcac, cloudO: 0.15,
  },
  uranus: {
    gas: true,
    bands: [[0, 0x9fd8dc], [0.4, 0xb4e2e4], [0.6, 0xa8dcde], [1, 0x8fccd2]],
    atmo: 0xbfeef0, cloudO: 0.2,
  },
  neptune: {
    gas: true,
    bands: [[0, 0x2f5fc9], [0.3, 0x4a7fdd], [0.5, 0x3a6ad0], [0.65, 0x5f8fe4], [0.85, 0x2f55b8], [1, 0x3f6fd0]],
    atmo: 0x8fb4ff, cloudO: 0.3,
  },
}

export function isGas(p: Palette): p is Extract<Palette, { gas: true }> {
  return p.gas === true
}
