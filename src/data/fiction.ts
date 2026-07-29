/**
 * Hand-written spectroscopic profiles for the homage worlds. Every profile
 * opens with "Fiction:" — the same honesty rule the reconstructions follow —
 * because an invented reading must never sit beside a measured one unlabelled.
 *
 * Kept out of the entry bundle AND out of the measured-profiles chunk: this
 * module arrives through its own conditional dynamic import in `lib/scan.ts`,
 * fetched only the first time someone actually scans a story world, so each
 * lazy chunk stays inside its own size budget.
 */
import type { Profile } from './spectrometer'

export const FICTION_PROFILES: Record<string, Profile> = {
    erid:{atmoTitle:'Fiction: deep, hot and pitch dark',pressure:'29 bar (the novel’s number)',
      atmoSummary:'An ammonia-heavy blanket dozens of kilometres deep, at 29 Earth atmospheres and over 200 °C at the surface. Sunlight gives out long before the ground: the floor of this atmosphere has never once been lit.',
      gases:[['NH3',71],['N2',20.5],['CO2',6],['H2O',2],['CH4',0.5]],
      water:{state:'vapour in a hot sky, never a sea',dot:'#c9b89a',detail:'Plenty of water — all of it airborne. At this pressure and temperature it neither rains out nor freezes; it just circulates, one more gas in a thick hot soup.',sig:'Strong vapour bands in the near-infrared, read from the haze top — nothing deeper is observable from outside.'},
      surfLabel:'Fiction: haze top (the surface is unobservable)',pigs:[],
      compounds:[['Ammonia droplet haze','NH₃',62,'#d8ccb0','The visible face of the planet. Everything below this line is inference.'],['Water-ammonia clouds','NH₃·H₂O',20,'#cfc4a8','Deeper decks, sounded rather than seen.'],['Photochemical smog','CₓHᵦNᵧ',10,'#b0a488','Sunlight working on methane at the only altitude sunlight reaches.'],['Rock, presumably','—',5,'#8f846c','A dense silicate world under roughly twice Earth’s gravity — argued from mass and radius, never from light.']],
      bio:{title:'Confirmed, in the story — and eyeless',dot:'#7fae62',desc:'The novel’s answer to a lightless floor is a biosphere that never evolved sight: its engineers navigate by sound and read the world through touch and hot air. No orbiting spectrometer would ever find them under 29 bars of haze.'},
      colorWhy:'No colour here means anything about the ground — sunlight is finished kilometres above it. Every tone in this rendering belongs to the top of the haze, which is the only part of the planet light has ever touched.',
      note:'The novel’s most careful engineering lives here: a first-contact partner whose home air would cook and crush a human, met halfway in a shared tunnel.'},
    adrian:{atmoTitle:'Fiction: carbon dioxide, grazed by Astrophage',pressure:'~8 bar (invented)',
      atmoSummary:'A heavy CO₂ hothouse — Venus’s recipe at a gentler simmer. What makes it worth a spectrometer is not the air but what feeds on the star above it: the novel seeds this planet’s orbit with a microbe that drinks starlight itself.',
      gases:[['CO2',91],['N2',6.9],['Ar',0.9],['SO2',0.8],['H2O',0.3]],
      water:{state:'vapour only',dot:'#e0c49a',detail:'Too hot at the surface for seas. What water the planet holds stays in the sky, thin and superheated, waiting for a cooler epoch that is not coming.',sig:'Faint 1.4 and 1.9 µm vapour bands over a dry rock continuum.'},
      surfLabel:'Fiction: surface composition',pigs:['hematite','olivine'],
      compounds:[['Basalt plains','(Mg,Fe)SiO₃',46,'#8a7460','Volcanic rock under an amber sky, baked past the last of its water.'],['Iron oxides','Fe₂O₃',12,'#b05a3c','A dry rust, laid down when the air still had oxygen to lend.'],['Sulphate crusts','CaSO₄',8,'#dcc98d','Evaporites from the drying — the same story Venus and Mars tell.'],['Carbonate rock','CaCO₃',10,'#d8c9a8','Half the ancient atmosphere, locked into stone.']],
      bio:{title:'The whole point of the place',dot:'#7fae62',desc:'On the surface, nothing. In orbit, everything: the novel breeds its starlight-eating microbe in the space between this planet and its star, and the predator that finally answers it is found here too. The biosignature is a dark line in the sky, not a pigment on the ground.',},
      colorWhy:'A thick CO₂ column scatters enough light to flatten every contrast, so the surface reads dun and amber through the haze — colour by subtraction, with nothing alive to add any.',
      note:'A faint infrared line arcs from this planet to its star. In the novel it is traffic, in both directions.'},
    pandora:{atmoTitle:'Fiction: rich air, wrong for us',pressure:'~1.2 bar (invented)',
      atmoSummary:'Denser than Earth’s air and superficially similar — nitrogen, plenty of oxygen — but carrying enough carbon dioxide, xenon and hydrogen sulphide that an unmasked human has minutes, not hours. Breathable is a local opinion.',
      gases:[['N2',55],['O2',21],['CO2',18],['Xe',5.5],['H2S',0.4],['NH3',0.1]],
      water:{state:'liquid — seas, rivers and rain',dot:'#5aa8d8',detail:'A wet tropical moon: open ocean, river systems under continuous canopy, and rainfall that keeps the whole surface cycling. All three phases present, exactly as on Earth.',sig:'Deep red absorption over the seas, vapour bands overhead, and ice signatures only on the highest peaks.'},
      surfLabel:'Fiction: surface composition',pigs:['liquid','chloro'],
      compounds:[['Basalt & ultramafics','(Mg,Fe)SiO₃',34,'#6f8568','Young volcanic crust — this is a moon of a giant planet, and tides keep it warm and busy.'],['Room-temperature superconductor','—',2,'#8fa8c9','The story’s famous ore. In a magnetic field strong enough, whole outcrops of it float — mountains included.'],['Chlorophyll-analogue biomass','—',22,'#4a9e5f','Canopy from coast to coast, a shade deeper than Earth’s green, with a hard reflectance edge past 700 nm.'],['Bioluminescent organics','—',6,'#7fd0c9','Pigments that spend the day charging and the night glowing — the reason the forest floor is visible after dark.'],['Carbonate reefs','CaCO₃',5,'#e4dfd0','Shallow seas building rock out of biology, the way living oceans do.']],
      bio:{title:'Strong — and networked',dot:'#7fae62',desc:'Free oxygen against a methane-and-sulphide background, a red edge you could see from another star, and night-side emission where the forests glow. The story goes one further and wires the whole biosphere together underground; the spectrum only says that something here is very much alive.'},
      colorWhy:'A chlorophyll analogue absorbs blue and red and returns a green deeper than Earth’s, over seas kept honestly blue by liquid-water absorption. After dark the colours invert: bioluminescence emits in the blue-green, so the night side is not black.',
      note:'This moon orbits a gas giant the size of Jupiter. In this engine it wears its own orbit instead — moons only render up close, and the caption owns the substitution.'}
  }
