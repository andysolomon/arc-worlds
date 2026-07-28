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
    tatooine:{atmoTitle:'Fiction: dry nitrogen, farmed for its dew',pressure:'~0.9 bar (invented)',
      atmoSummary:'Breathable and bone dry: nitrogen and oxygen with water vapour measured in parts per million. What moisture there is rides the night air, which is why the story farms it with vaporators instead of wells.',
      gases:[['N2',77.4],['O2',20.1],['Ar',1.6],['CO2',0.6],['H2O',0.02]],
      water:{state:'vapour, a night-time trace',dot:'#c9b89a',detail:'No standing water anywhere on the surface — the seas this world may once have had are salt flats now. The only recoverable water hangs in the pre-dawn air, and a farm is a grid of machines that condense it.',sig:'The 720 and 940 nm vapour bands flicker just above the noise floor at dawn and vanish by mid-morning.'},
      surfLabel:'Fiction: surface composition',pigs:['hematite','olivine'],
      compounds:[['Quartz sand','SiO₂',48,'#e6dcc4','Dunes to the horizon in every direction. Coarse, and famously everywhere.'],['Hematite dust','Fe₂O₃',12,'#b8502e','The ferric stain that warms the dunes toward gold at sunset.'],['Halite flats','NaCl',9,'#eeeae4','Evaporite pans — the graves of old seas, and the flattest ground there is.'],['Basalt mesas','(Mg,Fe)SiO₃',16,'#8a8574','The dark rock the canyons are cut from.'],['Silicate glass','—',3,'#c9bfa8','Lightning-fused sand, scattered where storms cross the dune sea.']],
      bio:{title:'Sparse, and hiding from the heat',dot:'#a8cf70',desc:'From orbit this reads as a faint, honest maybe: trace water, no red edge, nothing out of equilibrium. The story stocks it anyway — everything that lives here does so underground, in shade, or by stealing dew.'},
      colorWhy:'Quartz sand scatters every wavelength and hematite dust removes the blue-green half, so the whole world reads pale gold shading to rust. The famous double sunset would double the shadows, not the colours.',
      note:'The film gives this world two suns. This engine draws one, and owes it the other.'},
    hoth:{atmoTitle:'Fiction: thin, clean and bitterly cold',pressure:'~0.7 bar (invented)',
      atmoSummary:'A breathable nitrogen–oxygen mix with almost nothing else in it — no dust, no haze, no warmth. The cold does the atmospheric chemistry here: nearly every condensable gas has already frozen onto the ground.',
      gases:[['N2',81.9],['O2',17.1],['Ar',0.9],['H2O',0.05],['CO2',0.03]],
      water:{state:'frozen, planet-wide',dot:'#cfe6f2',detail:'Ice from pole to pole, kilometres deep in places, over an ocean that may never have known a summer. What snow falls tonight lands on last century’s.',sig:'The 1.04 and 1.25 µm ice bands are as deep as they ever get; liquid absorption is entirely absent.'},
      surfLabel:'Fiction: surface composition',pigs:['ice'],
      compounds:[['Water ice','H₂O',78,'#dff0f7','The planet’s actual surface, blinding white wherever the wind polishes it.'],['Packed snow','H₂O',12,'#f4fafc','Endless firn plains, sculpted into sastrugi by a wind that never stops.'],['Silicate dust','—',4,'#b7b2a6','Rock flour from the few mountain ranges tall enough to break the ice.'],['Brine pockets','NaCl·H₂O',2,'#d8e8ee','Liquid holdouts deep under the shelf, kept unfrozen by pressure and salt.']],
      bio:{title:'Sparse, but stubborn',dot:'#8fd0c9',desc:'Nothing in the spectrum admits to life — no pigment, no disequilibrium gas. The story populates it anyway, with a few large, well-insulated exceptions that a telescope would never see.'},
      colorWhy:'Fresh ice reflects nearly every visible wavelength, so the world reads white with the faint blue that long light paths through ice always pick up. There is no second colour anywhere on the planet.',
      note:'The night surface drops cold enough that the air itself starts thinking about condensing — outdoors after dark is not survivable, and the story agrees.'},
    mustafar:{atmoTitle:'Fiction: sulphur, ash and heat',pressure:'~1.6 bar (invented)',
      atmoSummary:'Volcanic outgassing with nowhere to go: carbon dioxide and sulphur dioxide under a permanent ash veil, hot enough at the surface that the rivers stay molten in the open air.',
      gases:[['CO2',68],['SO2',14],['N2',9],['CO',4],['H2O',2.2],['Ar',0.5]],
      water:{state:'vapour only',dot:'#e0c49a',detail:'Whatever water this world had is steam in the plume clouds or locked into hot rock. Nothing condenses on ground that glows.',sig:'Vapour bands at 1.4 and 1.9 µm over the eruption plumes; no liquid or ice signature anywhere.'},
      surfLabel:'Fiction: surface composition',pigs:['sulfur','carbon','olivine'],
      compounds:[['Basalt crust','(Mg,Fe)SiO₃',44,'#5f584f','Cooled flows, nearly black — the thin solid lid the mining rigs stand on.'],['Open lava','—',18,'#ff5a1f','The rivers themselves: silicate melt bright enough to read by.'],['Elemental sulphur','S₈',10,'#d8c14e','Painted yellow around every vent.'],['Volcanic ash','—',14,'#4a4650','A settling veil that keeps the sky the colour of a furnace.'],['Magnetite','Fe₃O₄',6,'#3f3d44','Flat black iron oxide, dense enough to be worth digging out of a world like this.']],
      bio:{title:'No biosignature',dot:'#c9b0bb',desc:'Nothing reads as alive and nothing should: the surface is chemistry at furnace temperatures. Anything the story puts here arrives in a sealed suit and leaves as soon as it can.'},
      colorWhy:'Two light sources at war. Fresh basalt absorbs almost everything, so the crust is near-black; the glow is thermal emission from the melt itself, radiating red and infrared rather than reflecting anything. Sulphur adds the only true pigment, absorbing blue to appear yellow.',
      note:'The story mines this world. On the evidence of the spectrum, the ore is the only thing here worth the heat.'},
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
