import type { PresetKey } from '../types.js'

/**
 * A seed-stable living-world colour identity. Geography decides where each
 * biome is; this ramp decides what kind of biosphere grew there. Keeping the
 * choice outside the pixel loop makes every projection and level of detail
 * use the same ecosystem.
 */
export interface EcosystemStyle {
  readonly key: string
  readonly deepWater: number
  readonly water: number
  readonly shallows: number
  readonly beach: number
  readonly grass: number
  readonly woodland: number
  readonly rock: number
  readonly highRock: number
  readonly snow: number
  readonly detailLight: number
  readonly detailDark: number
  readonly river: number
  readonly waterShell: number
}

const MEADOW_ECOSYSTEMS: readonly EcosystemStyle[] = [
  { key: 'emerald-forest', deepWater: 0x08294c, water: 0x197ca1, shallows: 0x50bba8, beach: 0xd5c397, grass: 0x78ad58, woodland: 0x254f31, rock: 0x8d8069, highRock: 0x3b403b, snow: 0xe6ebe2, detailLight: 0xabc67b, detailDark: 0x183b27, river: 0x258f9a, waterShell: 0x168da4 },
  { key: 'amber-savanna', deepWater: 0x102f52, water: 0x26769a, shallows: 0x55b3a1, beach: 0xd9c17c, grass: 0xb9a04b, woodland: 0x52633a, rock: 0x9a7256, highRock: 0x4b4138, snow: 0xe9e4d6, detailLight: 0xc6b66a, detailDark: 0x3e492b, river: 0x2a8794, waterShell: 0x287e9b },
  { key: 'sage-steppe', deepWater: 0x173653, water: 0x397b92, shallows: 0x6ab6a8, beach: 0xd1bd91, grass: 0x94a76d, woodland: 0x4c694c, rock: 0x8c7a66, highRock: 0x454b45, snow: 0xe4e8df, detailLight: 0xb2be8c, detailDark: 0x344b37, river: 0x3a8790, waterShell: 0x397f94 },
  { key: 'redwood-coast', deepWater: 0x142b4c, water: 0x315f8d, shallows: 0x4da7a3, beach: 0xcbb187, grass: 0x788e4f, woodland: 0x294b3c, rock: 0x886452, highRock: 0x443b38, snow: 0xe3e5dc, detailLight: 0xa1ae73, detailDark: 0x20382e, river: 0x397f91, waterShell: 0x346c91 },
  { key: 'alpine-heath', deepWater: 0x112c54, water: 0x285a89, shallows: 0x519fa2, beach: 0xc9ba94, grass: 0x748d78, woodland: 0x344f4a, rock: 0x7e7d79, highRock: 0x3f4548, snow: 0xe9eeec, detailLight: 0xa3b69e, detailDark: 0x283f3d, river: 0x347f92, waterShell: 0x2b668e },
  { key: 'turquoise-wetland', deepWater: 0x073743, water: 0x117986, shallows: 0x55b9a4, beach: 0xbfc18d, grass: 0x56a06e, woodland: 0x184e42, rock: 0x6f7666, highRock: 0x34423d, snow: 0xe2ebe5, detailLight: 0x88c18c, detailDark: 0x123d33, river: 0x168b91, waterShell: 0x14848d },
  { key: 'copper-prairie', deepWater: 0x152c4b, water: 0x326d8c, shallows: 0x60aaa0, beach: 0xd0b58d, grass: 0xa47b4d, woodland: 0x4f5638, rock: 0x8d6652, highRock: 0x493d38, snow: 0xe7e0d7, detailLight: 0xb69a67, detailDark: 0x3d442f, river: 0x367f8c, waterShell: 0x35758f },
  { key: 'moss-islands', deepWater: 0x0c3148, water: 0x247e91, shallows: 0x67bca3, beach: 0xc5be8d, grass: 0x6e9e54, woodland: 0x315b35, rock: 0x74745e, highRock: 0x39423a, snow: 0xe3e8dd, detailLight: 0x9fc277, detailDark: 0x25492d, river: 0x258a8c, waterShell: 0x268792 },
]

const PANDORA_ECOSYSTEMS: readonly EcosystemStyle[] = [
  { key: 'cyan-jungle', deepWater: 0x092c4d, water: 0x196f9a, shallows: 0x44b6ad, beach: 0xbacb9a, grass: 0x3f9c68, woodland: 0x145648, rock: 0x657d6c, highRock: 0x32463f, snow: 0xe5eeea, detailLight: 0x68c79b, detailDark: 0x10463d, river: 0x168f9d, waterShell: 0x207fa2 },
  { key: 'violet-canopy', deepWater: 0x17274e, water: 0x315f98, shallows: 0x4aa6aa, beach: 0xc1c09b, grass: 0x7370a6, woodland: 0x3c3b71, rock: 0x696579, highRock: 0x363542, snow: 0xe8e8ef, detailLight: 0x9292c3, detailDark: 0x2d305d, river: 0x3b819f, waterShell: 0x356c9d },
  { key: 'coral-rainforest', deepWater: 0x0e3347, water: 0x187f91, shallows: 0x55baa5, beach: 0xd2bd8f, grass: 0xb16770, woodland: 0x5f3b59, rock: 0x806468, highRock: 0x41383e, snow: 0xeee5e4, detailLight: 0xca8583, detailDark: 0x4b3149, river: 0x258f98, waterShell: 0x1d8995 },
  { key: 'indigo-mangrove', deepWater: 0x092f46, water: 0x177a8d, shallows: 0x4eb89c, beach: 0xb8c58e, grass: 0x467f8a, woodland: 0x253f67, rock: 0x5c6570, highRock: 0x303842, snow: 0xe2eaec, detailLight: 0x6aa6a2, detailDark: 0x203752, river: 0x1c8995, waterShell: 0x1b8392 },
  { key: 'golden-fern', deepWater: 0x102d4c, water: 0x24739a, shallows: 0x57b5a8, beach: 0xd3c08b, grass: 0xaaa34f, woodland: 0x4d6737, rock: 0x857058, highRock: 0x41443a, snow: 0xeae9dd, detailLight: 0xc3bd70, detailDark: 0x3a502d, river: 0x2c8998, waterShell: 0x287e9e },
  { key: 'magenta-highlands', deepWater: 0x17284c, water: 0x31618f, shallows: 0x50a7a6, beach: 0xc7b79e, grass: 0x9a5c8f, woodland: 0x53345f, rock: 0x766278, highRock: 0x3e3544, snow: 0xeee7ef, detailLight: 0xb57aaa, detailDark: 0x422a50, river: 0x3b8298, waterShell: 0x356f94 },
]

function seedIndex(seed: number, salt: number, length: number): number {
  let value = (Math.floor(Math.abs(seed)) ^ salt) >>> 0
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad)
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97)
  value ^= value >>> 15
  return (value >>> 0) % length
}

/** Returns a varied biosphere ramp for living-world profiles, otherwise null. */
export function ecosystemStyleFor(seed: number, preset: PresetKey): EcosystemStyle | null {
  const styles = preset === 'temperate'
    ? MEADOW_ECOSYSTEMS
    : preset === 'pandora'
      ? PANDORA_ECOSYSTEMS
      : null
  if (!styles) return null
  const salt = preset === 'pandora' ? 0x50414e44 : 0x4d454144
  return styles[seedIndex(seed, salt, styles.length)]
}
