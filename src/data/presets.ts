// Extracted verbatim from the original prototype — see prototype/.
import type { PlanetParams, PresetKey } from "../engine/types.js"

export interface Preset {
  key: PresetKey
  label: string
  dot: string
  gas?: boolean
  def: Partial<PlanetParams>
}

/** The eight sculptable world types. */
export const PRESETS: Preset[] = [
    {key:'temperate',label:'Meadow',dot:'#7fae62',def:{mountains:.5,water:.55,roughness:.5,clouds:.5,glow:.5,ice:.25}},
    {key:'desert',label:'Dune',dot:'#e0b070',def:{mountains:.45,water:.12,roughness:.6,clouds:.18,glow:.4,ice:0}},
    {key:'ice',label:'Frost',dot:'#bcd7e8',def:{mountains:.35,water:.5,roughness:.4,clouds:.6,glow:.6,ice:.85}},
    {key:'lava',label:'Ember',dot:'#ff6a3d',def:{mountains:.7,water:.3,roughness:.7,clouds:.22,glow:.7,ice:0}},
    {key:'candy',label:'Candy',dot:'#ff8fc7',def:{mountains:.4,water:.5,roughness:.35,clouds:.7,glow:.8,ice:.3}},
    {key:'gasAmber',label:'Amber giant',gas:true,dot:'#d9b184',def:{mountains:0,water:0,roughness:.5,clouds:0,glow:.35,ice:0,rings:true,ringN:2,ringInner:.3,ringWidth:.45,ringOpacity:.5}},
    {key:'gasMist',label:'Mist giant',gas:true,dot:'#a8dcd8',def:{mountains:0,water:0,roughness:.35,clouds:0,glow:.5,ice:0,rings:true,ringN:3,ringInner:.42,ringWidth:.3,ringOpacity:.35}},
    {key:'gasStorm',label:'Storm giant',gas:true,dot:'#8f5fbc',def:{mountains:0,water:0,roughness:.75,clouds:0,glow:.6,ice:0,rings:false}}
  ]

export interface SolarBody {
  key: PresetKey
  name: string
  label: string
  dot: string
  sub: string
  params: Partial<PlanetParams>
}

/** The eight real planets, each with the params that reproduce it. */
export const SOLAR: SolarBody[] = [
    {key:'mercury',name:'Mercury',label:'Rocky',dot:'#9a9294',sub:'closest to the Sun · no air at all',params:{seed:11,mountains:.65,water:0,roughness:.7,clouds:0,glow:.03,ice:0,rings:false,moons:0,atmoColor:null,texture:'images2k/mercury.jpg',cloudTexture:null}},
    {key:'venus',name:'Venus',label:'Veiled',dot:'#e8c088',sub:'hidden under thick golden clouds',params:{seed:22,mountains:.45,water:0,roughness:.5,clouds:0,glow:.3,ice:0,rings:false,moons:0,atmoColor:null,texture:'images2k/venus.jpg',cloudTexture:null}},
    {key:'temperate',name:'Earth',label:'Meadow',dot:'#7fae62',sub:'the original little world',params:{seed:4242,mountains:.5,water:.66,roughness:.55,clouds:.5,glow:.4,ice:.2,rings:false,moons:1,atmoColor:null,texture:'images2k/earth.jpg',cloudTexture:'images2k/earthclouds.png'}},
    {key:'mars',name:'Mars',label:'Rust',dot:'#c07040',sub:'rusty deserts, two tiny moons',params:{seed:44,mountains:.6,water:0,roughness:.6,clouds:0,glow:.12,ice:.1,rings:false,moons:2,atmoColor:null,texture:'images2k/mars.jpg',cloudTexture:null}},
    {key:'jupiter',name:'Jupiter',label:'Gas giant',dot:'#c9a06a',sub:'a storm bigger than Earth',params:{seed:55,mountains:0,water:0,roughness:.5,clouds:0,glow:.15,ice:0,rings:false,moons:3,atmoColor:null,texture:'images2k/jupiter.jpg',cloudTexture:null}},
    {key:'saturn',name:'Saturn',label:'Gas giant',dot:'#d9c49a',sub:'rings of ice and dust',params:{seed:66,mountains:0,water:0,roughness:.5,clouds:0,glow:.12,ice:0,rings:false,moons:3,atmoColor:null,texture:'images2k/saturn.jpg',cloudTexture:null}},
    {key:'uranus',name:'Uranus',label:'Gas giant',dot:'#9fd8dc',sub:'rolls around on its side · faint rings',params:{seed:77,mountains:0,water:0,roughness:.4,clouds:0,glow:.2,ice:0,rings:false,moons:2,atmoColor:null,texture:'images2k/uranus.jpg',cloudTexture:null}},
    {key:'neptune',name:'Neptune',label:'Gas giant',dot:'#3f6fd0',sub:'the windiest place we know',params:{seed:88,mountains:0,water:0,roughness:.5,clouds:0,glow:.22,ice:0,rings:false,moons:1,atmoColor:null,texture:'images2k/neptune.jpg',cloudTexture:null}},
    // No CC BY photographic map exists in our texture set, so Pluto is
    // procedural: seed 99 is its canonical identity (see realFor).
    {key:'pluto',name:'Pluto',label:'Dwarf',dot:'#cfa87f',sub:'a dwarf planet with a heart of ice',params:{seed:99,mountains:.45,water:0,roughness:.5,clouds:0,glow:.1,ice:.6,rings:false,moons:1,atmoColor:0x9fc9ec,texture:null,cloudTexture:null}}
  ]

export interface AncientWorld {
  key: PresetKey
  name: string
  label: string
  dot: string
  sub: string
  params: Partial<PlanetParams>
}

/**
 * Deep-time reconstructions — worlds we know existed, drawn from evidence
 * rather than measurement, and labelled that way wherever they scan. Each
 * carries a canonical seed: keep it and the spectrometer reads the
 * reconstruction; reseed it and the world detaches into an ordinary
 * sculptable one, the same identity rule as the measured bodies.
 */
export const ANCIENT: AncientWorld[] = [
    {key:'archean',name:'Archean Earth',label:'Archean',dot:'#e8935a',sub:'Earth, 3 billion years ago · an ocean world under orange haze',params:{seed:3042,mountains:.3,water:.8,roughness:.45,clouds:.5,glow:.65,ice:0,rings:false,moons:1,atmoColor:null,texture:null,cloudTexture:null}},
    {key:'proterozoic',name:'Proterozoic Earth',label:'Proterozoic',dot:'#b0805a',sub:'Earth, 1 billion years ago · continents with nothing living on them',params:{seed:1042,mountains:.5,water:.62,roughness:.5,clouds:.45,glow:.5,ice:.18,rings:false,moons:1,atmoColor:null,texture:null,cloudTexture:null}},
    {key:'noachian',name:'Noachian Mars',label:'Noachian',dot:'#b06a40',sub:'Mars, 4 billion years ago · when it still had a sea',params:{seed:4042,mountains:.6,water:.42,roughness:.55,clouds:.35,glow:.4,ice:.12,rings:false,moons:2,atmoColor:null,texture:null,cloudTexture:null}},
  ]

/** Same shape as an ancient world: a whole preset carrying a canonical seed. */
export type StoryWorld = AncientWorld

/**
 * Moons that are worlds rather than scenery.
 *
 * Every one of these is measured — where it is, how big it is, how long its
 * year and its day — and none of them has a photographic map in the CC BY
 * set, so each renders procedurally and claims its measured identity through
 * a canonical seed, exactly as Pluto does. The seeds are the years we first
 * saw them: Galileo's moons in 1610–12, Huygens' Titan in 1655, Herschel's
 * Enceladus in 1789, Lassell's Triton in 1846, and Apollo 11 in 1969.
 */
export const MOONS: StoryWorld[] = [
    {key:'luna',name:'The Moon',label:'Moon',dot:'#9a948c',sub:'ours · the only other world anyone has stood on',params:{seed:1969,mountains:.55,water:0,roughness:.75,clouds:0,glow:.02,ice:0,rings:false,moons:0,atmoColor:null,texture:null,cloudTexture:null}},
    {key:'io',name:'Io',label:'Moon',dot:'#d9c162',sub:"Jupiter's · the most volcanic world we know of",params:{seed:1610,mountains:.6,water:.25,roughness:.8,clouds:.12,glow:.8,ice:0,rings:false,moons:0,atmoColor:null,texture:null,cloudTexture:null}},
    {key:'europa',name:'Europa',label:'Moon',dot:'#e8dfd0',sub:"Jupiter's · an ocean under a shell of ice",params:{seed:1611,mountains:.08,water:.35,roughness:.2,clouds:0,glow:.25,ice:.95,rings:false,moons:0,atmoColor:null,texture:null,cloudTexture:null}},
    {key:'ganymede',name:'Ganymede',label:'Moon',dot:'#a89e90',sub:'the largest moon there is · and the only one with a magnetic field',params:{seed:1612,mountains:.4,water:0,roughness:.55,clouds:0,glow:.12,ice:.7,rings:false,moons:0,atmoColor:null,texture:null,cloudTexture:null}},
    {key:'titan',name:'Titan',label:'Moon',dot:'#d9a054',sub:"Saturn's · rain, rivers and seas, none of them water",params:{seed:1655,mountains:.3,water:.18,roughness:.45,clouds:.95,glow:.6,ice:.25,rings:false,moons:0,atmoColor:null,texture:null,cloudTexture:null}},
    {key:'enceladus',name:'Enceladus',label:'Moon',dot:'#f4f2ec',sub:"Saturn's · a small world venting its ocean into space",params:{seed:1789,mountains:.25,water:.2,roughness:.3,clouds:.15,glow:.5,ice:1,rings:false,moons:0,atmoColor:null,texture:null,cloudTexture:null}},
    {key:'triton',name:'Triton',label:'Moon',dot:'#d8cfc4',sub:"Neptune's · captured, backwards, and still geologically alive",params:{seed:1846,mountains:.3,water:.12,roughness:.4,clouds:.2,glow:.35,ice:.9,rings:false,moons:0,atmoColor:null,texture:null,cloudTexture:null}},
  ]

/**
 * Homage worlds — original interpretations of famous fictions, labelled that
 * way wherever they scan. No copyrighted imagery or text; the names are used
 * referentially. The identity rule is the same one the measured and ancient
 * bodies use: keep the canonical seed and the spectrometer reads the fiction;
 * reseed and the world detaches into an ordinary member of its family.
 */
export const FICTION: StoryWorld[] = [
    {key:'erid',name:'Erid',label:'Veiled',dot:'#c9b89a',sub:'lightless under twenty-nine atmospheres · from Project Hail Mary',params:{seed:2021,mountains:.45,water:0,roughness:.55,clouds:.97,glow:.25,ice:0,rings:false,moons:0,atmoColor:null,texture:null,cloudTexture:null}},
    {key:'adrian',name:'Adrian',label:'Hothouse',dot:'#d89a5f',sub:'the Astrophage breeding ground · from Project Hail Mary',params:{seed:1021,mountains:.4,water:0,roughness:.5,clouds:.85,glow:.5,ice:0,rings:false,moons:0,atmoColor:null,texture:null,cloudTexture:null}},
    {key:'pandora',name:'Pandora',label:'Jungle moon',dot:'#4a9e5f',sub:'a lush moon that glows after dark · from Avatar',params:{seed:2009,mountains:.6,water:.55,roughness:.55,clouds:.5,glow:.7,ice:.08,rings:false,moons:0,atmoColor:null,texture:null,cloudTexture:null}},
  ]

export function typeOf(key: string): Preset | SolarBody | AncientWorld {
  return (
    PRESETS.find((x) => x.key === key) ??
    SOLAR.find((x) => x.key === key) ??
    ANCIENT.find((x) => x.key === key) ??
    FICTION.find((x) => x.key === key) ??
    MOONS.find((x) => x.key === key) ??
    PRESETS[0]
  )
}
