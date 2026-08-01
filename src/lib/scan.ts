/**
 * The spectrometer.
 *
 * Given a world's params, derive a plausible atmosphere, surface mineralogy,
 * water state and biosignature, plus the specific spectral lines that would
 * reveal each. Deterministic: the same world always scans the same way.
 */
import { mulberry32 } from '../engine/noise'
import { realFor } from '../engine/planets'
import {
  MINERAL_SETS, ODDITIES, PIG, SPECIES,
  type BioReading, type Profile, type SpectralLine, type WaterReading,
} from '../data/spectrometer'
import { ANCIENT, FICTION, MOONS, PRESETS, typeOf } from '../data/presets'
import { LEGACY_GENERATOR_VERSION, type PlanetParams, type PresetKey } from '../engine/types'

/**
 * Presets whose derived readings borrow another family's chemistry. Only
 * reachable once a special world has been reseeded away from its canonical
 * identity — at which point it really is just an icy or dusty world.
 */
const FAMILY: Partial<Record<PresetKey, PresetKey>> = {
  pluto: 'ice',
  archean: 'temperate',
  proterozoic: 'temperate',
  noachian: 'desert',
  erid: 'desert',
  adrian: 'lava',
  pandora: 'temperate',
  luna: 'desert',
  io: 'lava',
  europa: 'ice',
  ganymede: 'ice',
  titan: 'ice',
  enceladus: 'ice',
  triton: 'ice',
}

export interface GasReading {
  f: string
  n: string
  eff: string
  pct: string
  w: string
}

export interface CompoundReading {
  n: string
  f: string
  pct: string
  w: string
  bar: string
  note: string
}

export interface LineReading {
  nm: number
  label: string
  desc: string
  nmLabel: string
  bg: string
  mark: string
  x: string
}

export type { BioReading, WaterReading }

export interface ScanResult {
  atmoTitle: string
  pressure: string
  atmoSummary: string
  gases: GasReading[]
  surfLabel: string
  compounds: CompoundReading[]
  water: WaterReading
  bio: BioReading
  lines: LineReading[]
  colorWhy: string
  note: string
}

/** Approximate visible colour of a wavelength, for the spectrum strip. */
export function nmColor(nm: number): string {
  if (nm > 700) return '#4a3f47'
  const t: Array<[number, string]> = [
    [380, '#3d0a63'], [420, '#3512c4'], [445, '#0038f5'], [470, '#0090ff'],
    [492, '#00cfd4'], [512, '#00e83f'], [545, '#7cf000'], [572, '#f0e800'],
    [592, '#ffb400'], [622, '#ff5e00'], [660, '#dc0d00'], [695, '#7a0500'],
  ]
  let best = t[0]
  for (const c of t) if (Math.abs(c[0] - nm) < Math.abs(best[0] - nm)) best = c
  return best[1]
}

export function mkLine(a: SpectralLine): LineReading {
  const nm = a[0]
  const emit = !!a[3]
  return {
    nm,
    label: a[1],
    desc: a[2],
    nmLabel: nm >= 1000 ? `${(nm / 1000).toFixed(2)} µm` : `${Math.round(nm * 10) / 10} nm`,
    bg: nmColor(nm),
    mark: emit ? 'rgba(255,255,255,.92)' : 'rgba(14,7,12,.85)',
    x: `${Math.max(0.4, Math.min(99, ((nm - 380) / 620) * 100)).toFixed(2)}%`,
  }
}

/** Percentages spanning nine orders of magnitude need adaptive precision. */
export function fmtPct(p: number): string {
  if (p >= 10) return `${Math.round(p * 10) / 10}%`
  if (p >= 1) return `${Math.round(p * 100) / 100}%`
  if (p >= 0.005) return `${Math.round(p * 1000) / 1000}%`
  const ppm = p * 1e4
  if (ppm >= 1) return `${Math.round(ppm)} ppm`
  if (ppm >= 0.01) return `${Math.round(ppm * 100) / 100} ppm`
  return 'trace'
}

/** Compressed bar width, so trace gases stay visible next to bulk ones. */
export function barW(p: number): string {
  return `${Math.max(2.5, Math.min(100, Math.pow(p / 100, 0.32) * 100)).toFixed(1)}%`
}

function gasProfile(P: PlanetParams, key: string, note: string): Profile {
  const ch4 = key === 'gasMist' ? 1.4 + P.glow * 2.6 : 0.2 + P.glow * 0.6
  const h2 = 88 - P.roughness * 6 - ch4 * 0.5
  const he = Math.max(4, 100 - h2 - ch4 - 0.1)
  return {
    atmoTitle: 'Hydrogen–helium envelope',
    pressure: 'no surface',
    atmoSummary:
      'Roughly solar proportions of hydrogen and helium, with no ground anywhere. Pressure simply keeps rising with depth until hydrogen starts behaving like a liquid metal.',
    gases: [['H2', h2], ['He', he], ['CH4', ch4], ['NH3', 0.02 + P.clouds * 0.05], ['H2O', 0.01 + P.water * 0.06], ['C2H6', 0.0007]],
    surfLabel: 'Cloud decks',
    compounds: MINERAL_SETS.gas,
    pigs: ['ice'],
    water: {
      state: 'vapour and deep ice clouds',
      dot: '#a8cfe0',
      detail:
        'No ocean and no surface. Water condenses into a cloud deck far below the visible ammonia layer, and turns up as vapour wherever a warm downdraught clears a hole.',
      sig: 'Read from the 940 nm and 1.4 µm vapour bands; the deep layer needs microwave sounding to see at all.',
    },
    bio: {
      title: 'No biosignature',
      dot: '#c9b0bb',
      desc: 'No surface and no water–rock interface. In a system like this the interesting chemistry happens on the icy moons.',
    },
    colorWhy:
      ch4 > 1.2
        ? `Methane at ${ch4.toFixed(1)}% absorbs nearly everything past 600 nm — orange, red and near-infrared — so only blue and green come back out. Same mechanism that makes Uranus and Neptune cyan.`
        : 'Ammonia-ice clouds reflect all visible wavelengths evenly, giving the pale zones. Where the deck thins you see down onto ammonium-hydrosulphide breakdown products that absorb the blue end, and those stripes read tan and brown.',
    note,
  }
}

function buildProfile(P: PlanetParams, r: () => number): Profile {
  const key = FAMILY[P.preset] ?? P.preset
  const t = typeOf(key)
  const note = ODDITIES[(r() * ODDITIES.length) | 0]
  if ('gas' in t && t.gas) return gasProfile(P, key, note)

  const bias: Record<string, number> = { temperate: 0.15, candy: 0.1, ice: -0.05, desert: -0.12, lava: -0.28 }
  const score =
    (1 - Math.abs(P.water - 0.55) * 1.6) * 0.55 + P.clouds * 0.25 + (bias[key] ?? 0) + (r() - 0.5) * 0.18

  const ice = P.ice
  const wet = P.water
  const cl = P.clouds
  const oxy = score > 0.45

  const atmos: Record<string, { title: string; bar: number; sum: string; gases: Array<[string, number]> }> = {
    temperate: oxy
      ? {
          title: 'Nitrogen–oxygen, out of equilibrium',
          bar: 0.6 + wet * 0.8 + cl * 0.4,
          sum: 'A nitrogen atmosphere carrying percent-level free oxygen. O₂ is far too reactive to persist on its own — something is topping it up faster than rock and sunlight can remove it.',
          gases: [['N2', 76 - score * 4], ['O2', 11 + score * 13], ['Ar', 1.1], ['H2O', 0.2 + cl * 2.6], ['CO2', 0.03 + (1 - score) * 0.2], ['CH4', 0.0002], ['O3', 0.00005]],
        }
      : {
          title: 'Nitrogen and carbon dioxide',
          bar: 0.4 + wet * 1.1 + cl * 0.5,
          sum: 'A quiet, anoxic atmosphere: nitrogen with a heavy dose of CO₂ and no free oxygen at all. This is what a rocky planet looks like before anything starts photosynthesising.',
          gases: [['N2', 66 + wet * 4], ['CO2', 22 + (1 - wet) * 6], ['Ar', 1.9], ['H2O', 0.1 + cl * 2.2], ['CH4', 0.4 + cl * 0.6], ['CO', 0.05]],
        },
    desert: {
      title: 'Thin, dry carbon dioxide',
      bar: 0.004 + cl * 0.9,
      sum: 'Barely there. Mostly CO₂ with noble gases, at a pressure low enough that liquid water would boil and freeze at the same time.',
      gases: [['CO2', 92 + (1 - cl) * 3], ['N2', 3.4], ['Ar', 2.2], ['O2', 0.14], ['CO', 0.07], ['H2O', 0.01 + cl * 0.5]],
    },
    ice: {
      title: 'Frigid nitrogen with methane',
      bar: 0.008 + cl * 0.25,
      sum: 'A thin nitrogen atmosphere so cold that methane and CO₂ frost out onto the ground each night and sublimate back in daylight.',
      gases: [['N2', 86 + cl * 2], ['Ar', 4.5], ['CH4', 3.2 + P.glow * 1.5], ['CO2', 2.4], ['CO', 1.1], ['H2O', 0.0008]],
    },
    lava: {
      title: 'Volcanic: carbon dioxide and sulphur',
      bar: 12 + cl * 70,
      sum: 'Outgassing straight from the mantle. CO₂ and sulphur dioxide dominate, there is no free oxygen, and the greenhouse has run away with itself.',
      gases: [['CO2', 77 - cl * 4], ['SO2', 9 + cl * 7], ['N2', 4.4], ['H2O', 2.2 + cl * 2], ['CO', 2.1], ['Ar', 0.3]],
    },
    candy: {
      title: 'Hazy nitrogen with organics',
      bar: 0.5 + cl * 1.2,
      sum: 'Nitrogen and water vapour under a photochemical organic haze — sunlight cracking methane and reassembling it into heavier compounds that never fully clear.',
      gases: [['N2', 62 + wet * 5], ['CO2', 13], ['H2O', 7 + cl * 4], ['CH4', 5 + cl * 2], ['CH4h', 2.5], ['Ar', 2.4]],
    },
  }
  const A = atmos[key] ?? atmos.temperate

  let water: WaterReading
  if (key === 'lava') {
    water = { state: 'vapour only', dot: '#e0c49a', detail: 'Any surface water flashed to steam long ago and the rest is locked into hot minerals. An enriched deuterium ratio would be the tell-tale that an ocean was once here.', sig: 'Only the 1.4 µm and 1.9 µm vapour bands register — no liquid or ice absorption anywhere.' }
  } else if (wet <= 0.06) {
    water = { state: 'none detected', dot: '#c9b0bb', detail: 'No standing water, no ice, nothing but a few parts per million bound into the rock. Raise the sea level and run the spectrometer again.', sig: 'The 720 nm and 940 nm vapour bands come back flat.' }
  } else if (ice > 0.72) {
    water = { state: 'frozen, everywhere', dot: '#cfe6f2', detail: 'Every drop is ice. Fresh surface ice is one of the most reflective natural materials there is, which keeps the planet cold enough to stay that way — a feedback that is hard to escape.', sig: 'Identified by the 1.04 and 1.25 µm ice bands, quite distinct from vapour or liquid.' }
  } else if (ice > 0.3) {
    water = { state: 'liquid, with permanent ice caps', dot: '#7cbfe0', detail: 'Open ocean across the middle latitudes with year-round ice at both poles. All three phases coexist, which needs a narrow band of pressure and temperature.', sig: 'Liquid water absorbs red about 100× more strongly than blue, so the seas return blue; the caps show the 1.04 µm ice band instead.' }
  } else {
    water = { state: 'liquid', dot: '#5aa8d8', detail: `Open water covering ${Math.round(wet * 100)}% of the surface, stable as a liquid — which means the pressure is above water’s triple point and the temperature sits between its freezing and boiling points.`, sig: 'Confirmed by the depth of red absorption in the reflected spectrum, plus vapour bands at 720 and 940 nm.' }
  }

  const pigSets: Record<string, string[]> = {
    temperate: [], desert: ['hematite', 'olivine'], ice: ['ice', 'co2ice'],
    lava: ['sulfur', 'carbon', 'olivine'], candy: ['hematite', 'ice'],
  }
  const pigs = (pigSets[key] ?? []).slice()
  if (key === 'temperate') pigs.push('olivine')
  if (water.state.includes('liquid')) pigs.push('liquid')
  if (ice > 0.3 && key !== 'ice') pigs.push('ice')
  if (oxy && key !== 'lava') pigs.push('chloro')

  let bio: BioReading
  if (score < 0.22) bio = { title: 'No biosignature', dot: '#c9b0bb', desc: 'Nothing in the spectrum is out of chemical equilibrium — no free oxygen, no methane excess, no reflectance jump in the near-infrared. Everything here can be explained by rock and sunlight.' }
  else if (score < 0.45) bio = { title: 'Ambiguous', dot: '#8fd0c9', desc: 'A faint methane excess with no oxygen to match it. That is not proof of anything: serpentinisation — hot water reacting with olivine — makes CH₄ with no help from biology.' }
  else if (score < 0.68) bio = { title: 'Possible', dot: '#a8cf70', desc: 'Free O₂ alongside methane. The two destroy each other in sunlight within centuries, so finding both at once means something is actively resupplying at least one of them.' }
  else bio = { title: 'Strong biosignature', dot: '#7fae62', desc: 'Percent-level free oxygen, a methane excess, and a sharp reflectance rise past 700 nm — a vegetation red edge. Three independent lines of evidence pointing the same way.' }

  const whys: Record<string, string> = {
    temperate: oxy
      ? 'Three overlapping effects. Nitrogen molecules scatter blue sunlight far more than red (∝ 1/λ⁴), which colours the sky; liquid water absorbs red roughly a hundred times harder than blue, which colours the seas; and chlorophyll absorbs at 430 and 662 nm while reflecting the green in between.'
      : 'Nitrogen scattering gives a blue sky and liquid water gives blue seas, but with no chlorophyll and no vegetation red edge the land stays the grey-brown of bare feldspar and basalt.',
    desert: 'One mineral decides it. Ferric iron (Fe³⁺) in fine hematite dust absorbs strongly from 400 to 550 nm — the entire blue-green half of the spectrum — and reflects everything past 600 nm. Even a micron-thin coating turns a whole planet red.',
    ice: 'Fresh water ice reflects almost every visible wavelength at high efficiency, so it reads brilliant white. The faint blue in thick ice is the one exception: over a long path even ice absorbs a little red.',
    lava: 'Two opposing things at once. Fresh iron-rich basalt absorbs broadly across the visible band, so cooled flows are nearly black; the glowing cracks are thermal emission — hot rock radiating its own light at red and infrared wavelengths rather than reflecting sunlight. Sulphur deposits add the only true pigment, absorbing violet and blue to appear yellow.',
    candy: 'Bright salt and quartz flats scatter every wavelength, which lifts the overall brightness, while hematite dust removes blue-green and organic tholins remove blue. Subtract those from white light and what is left is the pink-and-peach cast.',
  }

  return {
    atmoTitle: A.title,
    pressure: `${A.bar >= 10 ? Math.round(A.bar) : Math.round(A.bar * 1000) / 1000} bar`,
    atmoSummary: A.sum,
    gases: A.gases,
    surfLabel: 'Surface composition',
    compounds: MINERAL_SETS[key] ?? MINERAL_SETS.temperate,
    pigs,
    water,
    bio,
    colorWhy: whys[key] ?? '',
    note,
  }
}

/**
 * Run the spectrometer over a world. Deterministic — same params, same
 * reading. Async because the hand-written profile prose lives in its own
 * chunk, fetched the first time anyone actually runs a spectrometer; it has
 * no business on the first-load path.
 */
export async function computeScan(P: PlanetParams): Promise<ScanResult> {
  const { REAL_PROFILES, ANCIENT_PROFILES } = await import('../data/profiles')
  const pi = PRESETS.findIndex((x) => x.key === P.preset)
  const r = mulberry32(
    ((P.seed | 0) * 7919 +
      Math.round(P.water * 97) * 131 +
      Math.round(P.mountains * 89) * 17 +
      Math.round(P.clouds * 83) * 57 +
      pi * 911) | 0,
  )

  // A real planet scans as itself, using its measured profile; an ancient
  // world at its canonical seed scans as its reconstruction, which says so;
  // a story world at its canonical seed scans as its fiction, which also says
  // so. Only a sculpted world gets a reading derived from the sliders — and
  // changing the seed is what turns any of the others into one. The fiction
  // prose rides its own chunk, fetched only when a story world is scanned.
  // A moon that is a world scans as itself from its own chunk — measured
  // prose, same standing as a planet's, kept separate only because each lazy
  // chunk carries its own size budget and the planet prose fills most of one.
  // Canonical measured/reconstructed/story readings describe the existing v1
  // worlds. A v2 seed is intentionally a different world even when someone
  // reuses one of those familiar preset-and-seed pairs.
  const isLegacyIdentity = P.generatorVersion === LEGACY_GENERATOR_VERSION
  const isMoon = isLegacyIdentity && MOONS.some((m) => m.key === P.preset && m.params.seed === P.seed)
  const moon = isMoon ? (await import('../data/moon-profiles')).MOON_PROFILES[P.preset] ?? null : null
  const real = moon ?? (realFor(P) ? REAL_PROFILES[P.preset] ?? null : null)
  const ancient = isLegacyIdentity && ANCIENT.some((a) => a.key === P.preset && a.params.seed === P.seed)
    ? ANCIENT_PROFILES[P.preset] ?? null
    : null
  const story = isLegacyIdentity && FICTION.some((f) => f.key === P.preset && f.params.seed === P.seed)
    ? (await import('../data/fiction')).FICTION_PROFILES[P.preset] ?? null
    : null
  const prof = real ?? ancient ?? story ?? buildProfile(P, r)

  const gases: GasReading[] = prof.gases
    .filter((g) => g[1] > 0)
    .map((g) => {
      const s = SPECIES[g[0]]
      return { f: s.f, n: s.n, eff: s.eff, pct: fmtPct(g[1]), w: barW(g[1]) }
    })

  const compounds: CompoundReading[] = prof.compounds.map((c) => ({
    n: c[0],
    f: c[1],
    pct: c[2] >= 1 ? `${Math.round(c[2])}%` : 'traces',
    w: barW(c[2]),
    bar: c[3],
    note: c[4],
  }))

  const seen: Record<string, 1> = {}
  const lines: LineReading[] = []
  const add = (a: SpectralLine) => {
    const id = `${a[0]}|${a[1]}`
    if (seen[id]) return
    seen[id] = 1
    lines.push(mkLine(a))
  }
  for (const g of prof.gases) if (g[1] >= 0.0005) (SPECIES[g[0]].lines ?? []).forEach(add)
  for (const k of prof.pigs) (PIG[k] ?? []).forEach(add)
  lines.sort((a, b) => a.nm - b.nm)

  return {
    atmoTitle: prof.atmoTitle,
    pressure: prof.pressure,
    atmoSummary: prof.atmoSummary,
    gases,
    surfLabel: prof.surfLabel,
    compounds,
    water: prof.water,
    bio: prof.bio,
    lines,
    colorWhy: prof.colorWhy,
    note: prof.note,
  }
}
