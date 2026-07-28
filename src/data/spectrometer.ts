// Extracted verbatim from the original prototype — see prototype/.
/** nm, label, description, isEmission(1)/absorption(0) */
export type SpectralLine = [number, string, string, number]

export interface Species {
  n: string
  f: string
  eff: string
  lines: SpectralLine[]
}

/** Gas species: formula, visual effect, and the lines that reveal it. */
export const SPECIES: Record<string, Species> = {
    H2:{n:'Hydrogen',f:'H₂',eff:'Colourless in bulk. Its molecules are tiny, so they scatter short wavelengths — a deep hydrogen sky reads blue-grey.',lines:[[656,'H α','Hydrogen emission — the red of any glowing gas',1],[486,'H β','Hydrogen emission — cyan',1]]},
    He:{n:'Helium',f:'He',eff:'Completely inert and clear; shows one pale yellow line when excited.',lines:[[587.6,'He D₃','Helium emission — pale yellow',1]]},
    N2:{n:'Nitrogen',f:'N₂',eff:'Transparent, but small molecules scatter blue sunlight far more than red — the reason a nitrogen sky is blue.',lines:[[391.4,'N₂⁺','Nitrogen band — violet, the colour of high aurora',1]]},
    O2:{n:'Oxygen',f:'O₂',eff:'Colourless, yet it cuts a hard notch at 760 nm. Free O₂ is chemically reactive: nothing keeps it in the air unless something keeps making it.',lines:[[760,'O₂ A-band','Oxygen absorption — the strongest biosignature we know how to look for',0],[687,'O₂ B-band','Oxygen absorption',0]]},
    O3:{n:'Ozone',f:'O₃',eff:'Absorbs broadly through green and yellow (the Chappuis band) and blocks UV entirely.',lines:[[602,'Chappuis band','Ozone absorption — broad, across green and yellow',0]]},
    CO2:{n:'Carbon dioxide',f:'CO₂',eff:'Invisible to the eye — it only bites in the infrared, at 1.4, 1.6 and 2.0 µm. Pale sky, hot ground.',lines:[]},
    CO:{n:'Carbon monoxide',f:'CO',eff:'Colourless; its fingerprint sits far out at 4.6 µm.',lines:[]},
    H2O:{n:'Water vapour',f:'H₂O',eff:'Clear as a gas, but it eats red and near-infrared light in a comb of bands — the classic way to find water from orbit.',lines:[[720,'H₂O','Water-vapour absorption',0],[940,'H₂O','Water-vapour absorption — strong',0]]},
    CH4:{n:'Methane',f:'CH₄',eff:'Swallows orange, red and near-infrared light. What comes back out is cyan — this is exactly why Uranus and Neptune are blue.',lines:[[619,'CH₄','Methane absorption — removes orange-red',0],[725,'CH₄','Methane absorption — strong',0],[890,'CH₄','Methane absorption',0]]},
    NH3:{n:'Ammonia',f:'NH₃',eff:'Freezes into bright white crystals that reflect nearly every visible wavelength evenly.',lines:[[645,'NH₃','Ammonia absorption — weak, in the red',0],[930,'NH₃','Ammonia absorption',0]]},
    NH4SH:{n:'Ammonium hydrosulphide',f:'NH₄SH',eff:'Breaks down in sunlight into sulphur-bearing compounds that absorb blue — the tan and brown of a gas giant\u2019s belts.',lines:[[440,'S chromophore','Broad blue absorption — leaves tan and ochre',0]]},
    SO2:{n:'Sulphur dioxide',f:'SO₂',eff:'Drinks violet and ultraviolet light hard, leaving a creamy yellow cast over everything below.',lines:[[390,'SO₂','Sulphur-dioxide absorption — violet and UV',0]]},
    H2S:{n:'Hydrogen sulphide',f:'H₂S',eff:'Condenses into a pale cloud deck under the methane haze; confirmed at Uranus in 2018.',lines:[]},
    Ar:{n:'Argon',f:'Ar',eff:'Utterly inert. Its build-up is a clock for how long an atmosphere has been outgassing.',lines:[[696.5,'Ar I','Argon emission — deep red',1]]},
    Na:{n:'Sodium',f:'Na',eff:'The loudest colour trick in the solar system: sodium re-emits sunlight at 589 nm as pure amber.',lines:[[589,'Na D','Sodium emission — amber, the same line as a street lamp',1]]},
    K:{n:'Potassium',f:'K',eff:'Emits in the far red, right at the edge of what an eye can register.',lines:[[766.5,'K','Potassium emission',1]]},
    O:{n:'Atomic oxygen',f:'O',eff:'Single atoms knocked off the ground by sunlight and the solar wind; glows green at 558 nm.',lines:[[557.7,'O I','Atomic-oxygen emission — auroral green',1]]},
    C2H6:{n:'Ethane & acetylene',f:'C₂H₆',eff:'Photochemical smog made by sunlight breaking methane apart. Builds a haze that mutes and yellows everything beneath it.',lines:[]},
    CH4h:{n:'Organic haze (tholins)',f:'CₓHᵦNᵧ',eff:'Sunlight-cooked organics. Absorbs blue strongly, so the sky above turns orange-brown.',lines:[[420,'Tholin haze','Broad blue absorption — the orange of an organic smog',0]]}
  }

/** Surface pigments and their absorption bands. */
export const PIG: Record<string, SpectralLine[]> = {
    hematite:[[535,'Fe³⁺ (hematite)','Ferric-iron absorption — swallows blue and green, so the dust reads red',0],[860,'Fe³⁺ band','Ferric crystal-field band in the near-infrared',0]],
    sulfur:[[450,'S₈','Elemental sulphur absorbs violet and blue — appears yellow',0]],
    chloro:[[430,'Chlorophyll a','Absorbs violet-blue',0],[662,'Chlorophyll a','Absorbs red; the middle it reflects is green',0],[710,'Vegetation red edge','Reflectance jumps sharply past 700 nm — visible from orbit as life',0]],
    ice:[[810,'H₂O ice','Water-ice absorption band; grows deeper at 1.04 and 1.25 µm',0]],
    co2ice:[[780,'CO₂ ice','Dry-ice frost band',0]],
    carbon:[[500,'Graphitic carbon','Absorbs flatly at every wavelength — darkens without tinting',0]],
    olivine:[[1000,'Olivine / pyroxene','Broad 1 µm crystal-field band of ferrous silicate rock',0]],
    liquid:[[680,'Liquid water','Liquid water absorbs red ~100× more than blue, so deep water is blue',0]]
  }

/** name, formula, abundance %, bar colour, note */
export type Mineral = [string, string, number, string, string]

export const MINERAL_SETS: Record<string, Mineral[]> = {
    temperate:[['Plagioclase feldspar','(Ca,Na)Al₂Si₂O₈',38,'#ded7c6','Pale silicate rock, the bulk of a young crust.'],['Quartz','SiO₂',16,'#e8e4dc','Clear silica; reflects across the whole visible band, so quartz sand looks white.'],['Olivine','(Mg,Fe)₂SiO₄',12,'#8ea06a','Ferrous silicate with a broad 1 µm band — olive-green in hand, dark from orbit.'],['Calcite','CaCO₃',7,'#e4dfd0','Carbonate. On Earth it is nearly all biological in origin.'],['Halite','NaCl',3,'#eeeae4','Sea salt; leaves bright evaporite pans where shallow water dries out.']],
    desert:[['Quartz sand','SiO₂',34,'#e6dcc4','Colourless grains — the pale base tone under everything.'],['Hematite','Fe₂O₃',14,'#b8502e','Ferric iron. Absorbs 400–550 nm, so even a thin dust coat turns the world red.'],['Gypsum','CaSO₄·2H₂O',9,'#e8e2d2','Evaporite; forms only where water sat and then left.'],['Jarosite','KFe₃(SO₄)₂(OH)₆',5,'#c8a94e','Needs acidic water to form — a fossil of past wet chemistry.'],['Pyroxene','(Mg,Fe)SiO₃',18,'#8a8574','Dark volcanic rock beneath the dust.']],
    ice:[['Water ice','H₂O',52,'#dff0f7','Fresh ice reflects almost every visible wavelength — this is why ice caps are blinding white.'],['Carbon-dioxide ice','CO₂',14,'#e8f2f4','Dry-ice frost; sublimates straight back to gas when the sun reaches it.'],['Ammonia hydrate','NH₃·H₂O',8,'#e4eef2','Lowers the melting point, allowing slushy flow at very low temperatures.'],['Silicate dust','—',12,'#b7b2a6','Darkens the ice where it collects and speeds up melting.'],['Methane clathrate','CH₄·5.75H₂O',4,'#cfe9ea','Methane caged inside ice; releases gas as it warms.']],
    lava:[['Basalt (pyroxene-rich)','(Mg,Fe)SiO₃',42,'#5f584f','Fresh dark lava. Iron-bearing silicate absorbs broadly, so young flows are nearly black.'],['Elemental sulphur','S₈',11,'#d8c14e','Absorbs violet and blue only — the reason sulphur deposits are vivid yellow.'],['Magnetite','Fe₃O₄',9,'#3f3d44','Opaque iron oxide; flat black at every wavelength.'],['Olivine','(Mg,Fe)₂SiO₄',13,'#8ea06a','Crystallises early from hot melt; a marker of very fresh volcanism.'],['Volcanic glass','—',7,'#4a4650','Quenched lava with no crystal structure; glossy and dark.']],
    candy:[['Halite & sulphate salts','NaCl, MgSO₄',30,'#f0e6e8','Bright evaporite crusts left where shallow brine dried.'],['Hematite dust','Fe₂O₃',10,'#c9628a','Ferric iron absorbing blue-green; the pink in the pale flats.'],['Quartz','SiO₂',18,'#e8e4dc','Clear grains that scatter all colours and lift the overall brightness.'],['Water ice','H₂O',12,'#dff0f7','High-albedo frost at the poles and on night-side ground.'],['Organic tholins','CₓHᵦNᵧ',5,'#d99a6a','Sunlight-cooked organics; absorb blue, add an orange blush.']],
    gas:[['Ammonia ice','NH₃',48,'#efe9de','Bright white top deck — reflects every visible wavelength evenly.'],['Ammonium hydrosulphide','NH₄SH',22,'#c19a68','Photolysis products absorb the blue end; the source of tan and brown banding.'],['Water ice','H₂O',14,'#cfe6f2','A deep cloud layer, only visible through breaks.'],['Hydrocarbon haze','C₂H₆, C₂H₂',12,'#dcc9a0','Methane smog above the clouds; mutes contrast and adds gold.']]
  }

/** Flavour text appended to a scan result. */
export const ODDITIES: string[] = [
    'Sunsets here last nine hours.',
    'The mountains hum in thirds at dawn.',
    'Rain falls upward every third day.',
    'Its moons are shy and hide behind each other.',
    'Compasses point wherever you are happiest.',
    'The tides follow the mood of the sky.',
    'Echoes return slightly kinder than they were sent.',
    'Snow here lands only on things that hold still.'
  ]

export interface WaterReading {
  state: string
  dot: string
  detail: string
  sig: string
}

export interface BioReading {
  title: string
  dot: string
  desc: string
}

/** A complete spectroscopic profile, before it is formatted for display. */
export interface Profile {
  atmoTitle: string
  pressure: string
  atmoSummary: string
  gases: Array<[string, number]>
  surfLabel: string
  compounds: Mineral[]
  pigs: string[]
  water: WaterReading
  bio: BioReading
  colorWhy: string
  note: string
}

/**
 * Hand-written spectroscopic profiles for the measured bodies — the eight
 * planets and Pluto — facts, not values derived from the sculptor sliders.
 * Earth is keyed `temperate`, matching the preset it doubles as.
 */
export const REAL_PROFILES: Record<string, Profile> = {
    mercury:{atmoTitle:'No real atmosphere',pressure:'~10⁻¹⁵ bar',
      atmoSummary:'A surface-bound exosphere, not an atmosphere: atoms kicked off the ground by sunlight and the solar wind, then lost to space within hours. Ten thousand billion times thinner than Earth\u2019s air.',
      gases:[['O',42],['Na',29],['H2',22],['He',6],['K',0.5]],
      water:{state:'ice, in permanent shadow',dot:'#bcd7e8',detail:'Radar and neutron spectrometry found water ice on the floors of polar craters that have never seen sunlight, capped by a dark organic lag deposit. Everywhere else the daytime ground hits 430 °C.',sig:'Found by neutron counting and radar reflectivity rather than by colour — the deposits sit in darkness.'},
      surfLabel:'Crustal composition',pigs:['carbon','olivine'],
      compounds:[['Plagioclase feldspar','(Ca,Na)Al₂Si₂O₈',45,'#ded8c9','A pale calcium-rich silicate — the bulk of the crust.'],['Pyroxene & olivine','(Mg,Fe)SiO₃',30,'#9aa08c','Iron-poor for a rocky planet; almost all the iron sank into the oversized core.'],['Graphitic carbon','C',3,'#4d4750','A relic of an ancient graphite crust. Absorbs every wavelength equally, which is what makes Mercury so dark.'],['Sulphides (troilite)','FeS',2,'#c9b06a','Surprisingly sulphur-rich, a sign Mercury formed in very reducing conditions.'],['Water ice','H₂O',1,'#cfe6f2','Polar crater floors only.']],
      bio:{title:'No biosignature',dot:'#c9b0bb',desc:'No atmosphere to hold chemistry in place and no liquid water anywhere. Nothing here is even ambiguous.'},
      colorWhy:'Mercury has no air and no pigment. A graphite-darkened silicate crust reflects all visible wavelengths at roughly the same low level, so the eye reads neutral grey. Its only real colour is the faint amber glow of the sodium exosphere at 589 nm.',
      note:'Mercury\u2019s sodium tail streams millions of kilometres downwind of the planet and is bright enough to photograph from Earth.'},
    venus:{atmoTitle:'Crushing and sulphurous',pressure:'92 bar',
      atmoSummary:'Ninety-two times Earth\u2019s surface pressure and 464 °C, kept there by a runaway CO₂ greenhouse. The cloud deck is not water — it is droplets of concentrated sulphuric acid, 50–70 km up.',
      gases:[['CO2',96.5],['N2',3.5],['SO2',0.015],['Ar',0.007],['H2O',0.002],['CO',0.0017]],
      water:{state:'vapour only, ~20 ppm',dot:'#e0c49a',detail:'Venus is bone dry. What water it had was broken up by sunlight and the hydrogen lost to space — the leftover deuterium is 150× more abundant than on Earth, the fingerprint of a vanished ocean.',sig:'Measured by the 1.4 µm and 1.9 µm water bands, plus mass spectrometry from descent probes.'},
      surfLabel:'Clouds & surface',pigs:['sulfur','hematite','olivine'],
      compounds:[['Sulphuric-acid droplets','H₂SO₄',75,'#f0dda6','The clouds. They scatter every colour but absorb violet and UV, giving the creamy yellow tone.'],['Basalt (plagioclase + pyroxene)','—',60,'#9d968c','Volcanic plains covering ~80% of the surface, some of it geologically fresh.'],['Iron oxides','Fe₂O₃',6,'#b05a3c','Weathered rock; a faint rusty tinge under the acid haze.'],['Anhydrite & pyrite','CaSO₄, FeS₂',4,'#d8c98f','Sulphur cycling between rock and cloud, the engine of the whole system.']],
      bio:{title:'Disputed at best',dot:'#e0b070',desc:'A 2020 claim of phosphine (PH₃) in the cloud deck — a possible biosignature — has not held up under reanalysis. The surface is sterilising; the temperate cloud layer remains a long-shot argument.'},
      colorWhy:'Venus is a featureless cream-yellow because you never see the ground. Sulphur dioxide and sulphuric-acid droplets absorb violet and ultraviolet light while scattering the rest, so the reflected spectrum is bright and flat with the blue end shaved off.',
      note:'In ultraviolet the same clouds look strikingly banded and dark — an unidentified absorber, sometimes argued over as chemistry, sometimes as something stranger.'},
    temperate:{atmoTitle:'Nitrogen–oxygen, in disequilibrium',pressure:'1.01 bar',
      atmoSummary:'The only atmosphere we know that is chemically impossible without life: 21% free oxygen alongside methane, both of which should have reacted away long ago. Something replenishes them daily.',
      gases:[['N2',78.08],['O2',20.95],['Ar',0.93],['H2O',0.4],['CO2',0.042],['CH4',0.00019],['O3',0.00006]],
      water:{state:'liquid, ice and vapour at once',dot:'#5aa8d8',detail:'1.35 billion km³ of liquid water covering 71% of the surface, plus polar ice and atmospheric vapour. The only known world where all three phases are stable together.',sig:'Liquid water absorbs red light ~100× more strongly than blue; oceans therefore return blue. Vapour shows up at 720 and 940 nm.'},
      surfLabel:'Surface composition',pigs:['liquid','chloro','ice'],
      compounds:[['Feldspars','(K,Na,Ca)AlSi₃O₈',51,'#ded7c6','Half the crust by volume.'],['Quartz','SiO₂',12,'#e8e4dc','Clear silica, weathered into most of the world\u2019s sand.'],['Pyroxene & olivine','(Mg,Fe)SiO₃',15,'#8d9a80','Dark iron-magnesium rock; the ocean floor is made of it.'],['Chlorophyll-bearing biomass','C₅₅H₇₂MgN₄O₅',6,'#6f9e4a','The pigment that makes continents green — and the sharpest chemical evidence of life visible from space.'],['Calcite','CaCO₃',4,'#e4dfd0','Almost all of it laid down by living things; it locks carbon out of the air.'],['Halite & dissolved salts','NaCl',2,'#eeeae4','35 g per litre of seawater.']],
      bio:{title:'Confirmed',dot:'#7fae62',desc:'Free O₂ plus CH₄ together, a vegetation red edge at 700 nm, and seasonal CO₂ swings. Any of the three would be suggestive; all three at once is decisive.'},
      colorWhy:'Two effects stacked. Nitrogen molecules scatter blue sunlight far more than red (Rayleigh scattering, ∝ 1/λ⁴), which paints the sky; liquid water absorbs red about a hundred times harder than blue, which paints the oceans. Chlorophyll adds green by absorbing at 430 and 662 nm and reflecting what falls between.',
      note:'Earth\u2019s 760 nm oxygen band is the single feature astronomers most want to find in the spectrum of another planet.'},
    mars:{atmoTitle:'Thin, cold, carbon dioxide',pressure:'0.006 bar',
      atmoSummary:'Less than 1% of Earth\u2019s pressure — below the triple point of water, so liquid water boils and freezes at the same time. Up to a third of the air freezes onto the winter pole each year and comes back in spring.',
      gases:[['CO2',95.3],['N2',2.6],['Ar',1.9],['O2',0.16],['CO',0.06],['H2O',0.03]],
      water:{state:'ice, kilometres thick',dot:'#a8cfe0',detail:'The polar caps hold enough water ice to cover the planet metres deep, under a seasonal veneer of CO₂ dry ice. Buried mid-latitude glaciers and briny perchlorate seeps make up the rest. Ancient river valleys and deltas say it once flowed freely.',sig:'Detected by orbital radar sounding, the 1.5 and 2.0 µm ice bands, and neutron spectrometry of buried hydrogen.'},
      surfLabel:'Surface composition',pigs:['hematite','olivine','co2ice'],
      compounds:[['Plagioclase feldspar','(Ca,Na)Al₂Si₂O₈',30,'#cfc1ae','The pale bulk of the basaltic crust.'],['Pyroxene','(Mg,Fe)SiO₃',25,'#8a8574','Dark volcanic rock; visible where wind strips the dust away.'],['Olivine','(Mg,Fe)₂SiO₄',13,'#8ea06a','Weathers fast in water — its survival says Mars has been dry a very long time.'],['Nanophase ferric oxide','Fe₂O₃',8,'#b8502e','The pigment. Grains a few nanometres across, coating everything; this alone makes Mars red.'],['Sulphates (jarosite, gypsum)','KFe₃(SO₄)₂(OH)₆',6,'#dcc98d','Can only form in acidic water — direct mineral evidence of a wet past.'],['Perchlorate salts','Mg(ClO₄)₂',0.6,'#e6e0ce','Lower water\u2019s freezing point to −70 °C, which is how brines can still be liquid.']],
      bio:{title:'Unresolved',dot:'#e0b070',desc:'Curiosity measures seasonal methane pulses in Gale Crater that the Trace Gas Orbiter cannot see from above. Either the chemistry is stranger than expected, or something is producing it. Organic molecules are confirmed in the mudstones; their origin is not.'},
      colorWhy:'One mineral does all the work. Ferric iron (Fe³⁺) in nanophase hematite absorbs strongly from 400–550 nm — the whole blue-green half of the spectrum — and reflects everything past 600 nm. Rust, on a planetary scale. The thin CO₂ air adds almost no colour of its own, which is why Martian sunsets are blue: dust scatters red forward and lets blue through around the sun.',
      note:'Viking\u2019s first colour pictures were released too red, then corrected, then argued about for decades. The real Mars is more butterscotch than crimson.'},
    jupiter:{atmoTitle:'Hydrogen, helium and chemistry',pressure:'no surface',
      atmoSummary:'Essentially the composition of the Sun, minus the fusion. There is no ground: pressure simply rises until hydrogen turns into a metallic liquid. The visible cloud tops are three decks of condensing ices.',
      gases:[['H2',89.8],['He',10.2],['CH4',0.3],['NH3',0.026],['H2O',0.04],['C2H6',0.0006]],
      water:{state:'vapour and ice, deep in the cloud decks',dot:'#a8cfe0',detail:'Juno finds water making up ~0.25% of the molecules at the equator — patchy, and much less than expected elsewhere. It condenses into a deep cloud layer far below the ammonia we can see.',sig:'Measured by microwave sounding straight through the cloud tops, not by reflected colour.'},
      surfLabel:'Cloud decks',pigs:['ice'],
      compounds:[['Ammonia ice','NH₃',55,'#efe9de','The top deck. Bright white, reflects all visible wavelengths — the pale zones.'],['Ammonium hydrosulphide','NH₄SH',25,'#c19a68','The middle deck. Sunlight breaks it into sulphur compounds that absorb blue — the tan and brown belts.'],['Water ice','H₂O',12,'#cfe6f2','The deepest visible deck, only glimpsed through gaps.'],['Hydrocarbon haze','C₂H₆, C₂H₂',5,'#dcc9a0','Photochemical smog above everything, made from methane broken by UV.'],['Phosphine & hydrazine','PH₃, N₂H₄',1,'#e8d0b8','Dredged up from below; candidate colourants for the Great Red Spot.']],
      bio:{title:'No biosignature',dot:'#c9b0bb',desc:'None here. The interest is in the moons: Europa hides a salt-water ocean under its ice shell, and its surface shows sodium chloride and sulphates from below.'},
      colorWhy:'The bands are a two-substance story. White ammonia-ice clouds reflect everything; where the deck is thinner you see down onto ammonium-hydrosulphide products that absorb the blue end, so those stripes read tan, ochre and brown. Methane removes some far red, but at 0.3% it cannot compete.',
      note:'The exact chromophore of the Great Red Spot is still unidentified — the best candidates are ammonia-and-acetylene products cooked by ultraviolet light at the cloud tops.'},
    saturn:{atmoTitle:'Hydrogen under a hydrocarbon haze',pressure:'no surface',
      atmoSummary:'Even more hydrogen-dominated than Jupiter and colder, so the ammonia clouds sit deeper and a thick photochemical haze covers the whole planet, smoothing out the banding.',
      gases:[['H2',96.3],['He',3.25],['CH4',0.45],['NH3',0.0125],['C2H6',0.0007]],
      water:{state:'ice — and the rings are almost nothing else',dot:'#cfe6f2',detail:'The rings are 95–99% water ice, in grains from smoke-sized to house-sized, spread across 280,000 km but only tens of metres thick. Deeper down, water vapour condenses far below the visible cloud tops.',sig:'The rings\u2019 ice is identified by its 1.5, 2.0 and 3.0 µm absorption bands — an unmistakable water-ice spectrum.'},
      surfLabel:'Clouds, haze & rings',pigs:['ice'],
      compounds:[['Water ice (rings)','H₂O',96,'#dff0f7','The rings, almost pure. Bright because fresh ice reflects nearly all visible light.'],['Ammonia ice','NH₃',50,'#f0ead8','Cloud deck, deeper and colder than Jupiter\u2019s.'],['Hydrocarbon haze','C₂H₆, C₂H₂',20,'#e6cf9c','A thick UV-made smog. It mutes contrast and adds the gold.'],['Silicate & organic ring dust','—',3,'#c4ae8e','Darkens some rings and the gaps; slowly raining in from outside.']],
      bio:{title:'No biosignature here',dot:'#c9b0bb',desc:'But Enceladus vents salt water, silica, methane and molecular hydrogen from a subsurface ocean, straight through the E ring — the most directly sampled habitable environment beyond Earth.'},
      colorWhy:'Pale gold rather than banded brown. Sunlight breaking methane apart high in the atmosphere builds a deep hydrocarbon haze that absorbs blue slightly and scatters the rest, veiling the ammonia clouds below. The result is a soft, low-contrast butterscotch.',
      note:'Cassini tasted the Enceladus plume by flying through it, and found the chemical ingredients for life in the spray.'},
    uranus:{atmoTitle:'Methane-tinted hydrogen',pressure:'no surface',
      atmoSummary:'Hydrogen and helium with an unusually large helping of methane — enough to control the colour completely. Below sits a hot, dense fluid mantle of water, ammonia and methane, not a rocky surface.',
      gases:[['H2',82.5],['He',15.2],['CH4',2.3],['H2S',0.0008]],
      water:{state:'a hot supercritical water–ammonia mantle',dot:'#8fc7ff',detail:'Most of the planet by mass is a scorching, electrically conducting fluid of water, ammonia and methane — often called an "ice" mantle, though it is nothing like ice. No liquid ocean in any familiar sense.',sig:'Inferred from density, gravity and magnetic field rather than observed directly.'},
      surfLabel:'Clouds & haze',pigs:[],
      compounds:[['Methane ice clouds','CH₄',60,'#cfe9ea','Condense at the top of the troposphere; the source of the colour.'],['Hydrogen sulphide clouds','H₂S',20,'#dfe0cf','Confirmed spectroscopically in 2018 — the deck below the methane.'],['Photochemical haze','C₂H₂, C₂H₆',18,'#e8ecec','A thick aerosol layer that pales the cyan toward white.'],['Ammonia hydrates','NH₃·H₂O',2,'#e4eef2','Deeper still, mixed into the mantle fluid.']],
      bio:{title:'No biosignature',dot:'#c9b0bb',desc:'No surface, no liquid-water interface, and temperatures at the cloud tops near −220 °C.'},
      colorWhy:'Pure methane absorption. CH₄ absorbs hard from about 600 nm outward — all the orange, red and near-infrared — while leaving blue and green untouched. What escapes back to your eye is cyan. A thick white haze layer dilutes it, which is why Uranus is paler than Neptune despite similar chemistry.',
      note:'Uranus is tipped 98° over, so each pole spends 42 years in continuous sunlight and 42 in darkness.'},
    neptune:{atmoTitle:'Methane-tinted hydrogen, less haze',pressure:'no surface',
      atmoSummary:'Almost the same recipe as Uranus but warmer inside and less hazy, with the fastest winds in the solar system — over 2,000 km/h.',
      gases:[['H2',80],['He',19],['CH4',1.5],['H2S',0.0005]],
      water:{state:'a hot supercritical water–ammonia mantle',dot:'#8fc7ff',detail:'Like Uranus, most of Neptune is a dense hot fluid of water, ammonia and methane under enormous pressure. Deeper down the pressure may crack methane into diamond.',sig:'Inferred from bulk density and gravity, not from reflected light.'},
      surfLabel:'Clouds & haze',pigs:[],
      compounds:[['Methane ice clouds','CH₄',65,'#bcd8f0','White cloud tops rising above the blue.'],['Hydrogen sulphide clouds','H₂S',18,'#d4dcd8','The deck below.'],['Photochemical haze','C₂H₂, C₂H₆',12,'#dde6ee','Thinner than Uranus\u2019s — the whole reason Neptune looks deeper blue.'],['Ammonia hydrates','NH₃·H₂O',3,'#dce8f0','Mixed into the mantle fluid.']],
      bio:{title:'No biosignature',dot:'#c9b0bb',desc:'Cloud tops near −220 °C, no surface. Triton, captured and geologically active, is the more interesting target.'},
      colorWhy:'The same methane absorption as Uranus, cutting away everything past 600 nm — but with a thinner haze layer above it, so less white light is scattered back to dilute the cyan. A 2024 reanalysis showed the two planets are far closer in true colour than the classic images suggested.',
      note:'Neptune was found by mathematics before it was found by telescope: Le Verrier predicted where to point.'},
    pluto:{atmoTitle:'Thin nitrogen, seasonally alive',pressure:'~13 µbar',
      atmoSummary:'A hundred-thousandth of Earth’s pressure, and it is not permanent: the air is nitrogen evaporating off the surface ice, thickest near perihelion and expected to mostly freeze back out as Pluto swings away from the Sun. Haze layers stack more than 200 km deep.',
      gases:[['N2',99],['CH4',0.5],['CO',0.05],['CH4h',0.01]],
      water:{state:'ice — as bedrock',dot:'#bcd7e8',detail:'At −230 °C water ice is as rigid as granite, and Pluto uses it that way: mountains of it stand 6 km over Sputnik Planitia, floating in denser nitrogen ice like icebergs. A liquid ocean may survive far beneath the heart.',sig:'Water-ice bands at 1.5 and 2.0 µm show through wherever the nitrogen and methane frosts thin out.'},
      surfLabel:'Surface ices',pigs:['ice'],
      compounds:[['Nitrogen ice','N₂',55,'#e8f0f4','Sputnik Planitia — the western lobe of the heart — is a churning glacier of it, its polygonal convection cells overturning every ~500,000 years.'],['Methane ice','CH₄',20,'#dfe8dc','Frosts ridges and crater rims, and builds the bladed terrain of Tartarus Dorsa.'],['Water ice','H₂O',15,'#cfe6f2','The bedrock and the mountains; too rigid at these temperatures to flow at all.'],['Carbon-monoxide ice','CO',5,'#e4e8ea','Mixed into the nitrogen plains — a marker of the freshest ice.'],['Tholins','CₓHᵦNᵧ',4,'#b5713f','Sunlight-cooked organics, staining Cthulhu Macula the red-brown of old varnish.']],
      bio:{title:'No biosignature',dot:'#c9b0bb',desc:'The surface is −230 °C and the air is a whisper. The one ambiguity worth naming sits underneath: if the subsurface ocean is real, it has been dark and sealed for four billion years.'},
      colorWhy:'Tholins do the painting: sunlight breaking methane and nitrogen apart builds organics that absorb blue, so the old terrains read tan to red-brown. The heart stays bright because fresh nitrogen ice reflects everything. And the haze scatters blue exactly the way a thin atmosphere should — photographed against the dark, Pluto’s sky is a ring of blue.',
      note:'New Horizons crossed 4.8 billion km over nine and a half years for one afternoon of close-ups — and the heart was visible from the first approach frames.'}
  }

/**
 * Reconstructions of worlds that existed but were never measured — deep-time
 * Earth and Mars, built from rock, isotope and model evidence. Every profile
 * says "reconstructed" in its first breath, because this project does not let
 * an inference sit next to a measurement unlabelled.
 */
export const ANCIENT_PROFILES: Record<string, Profile> = {
    archean:{atmoTitle:'Reconstructed: anoxic, and orange',pressure:'~0.8 bar (inferred)',
      atmoSummary:'No free oxygen at all — every oxygen-hungry mineral in Archean rock is unrusted, which is how we know. Nitrogen and carbon dioxide with enough methane to cook a photochemical haze, the same chemistry as Titan’s, over a global iron-tinted ocean.',
      gases:[['N2',89],['CO2',8],['CH4',2.5],['H2O',0.5],['CH4h',0.02]],
      water:{state:'liquid, nearly everywhere',dot:'#3a7a8f',detail:'A near-global ocean over young basalt crust, with island arcs and the first small cratons breaking the surface. Zircon crystals 4 billion years old say liquid water was already old news by now.',sig:'Water bands at 720 and 940 nm, over a surface almost without land to break them.'},
      surfLabel:'Reconstructed surface',pigs:['liquid','olivine','carbon'],
      compounds:[['Basalt & komatiite','(Mg,Fe)SiO₃',52,'#5f584f','Hot young lavas — komatiite needs mantle temperatures no modern eruption reaches.'],['Banded iron formations','Fe₃O₄·SiO₂',14,'#8a4a3c','Iron dissolved in an anoxic sea, dropped in layers wherever early photosynthesis breathed on it — the rocks that will later record oxygen’s arrival.'],['Stromatolite carbonate','CaCO₃',6,'#c9bda4','Layered microbial mats in the shallows; the oldest unambiguous fossils there are.'],['Chert','SiO₂',10,'#8f8578','Silica precipitated straight from seawater, preserving cells for us to argue over.'],['Sulphides (pyrite)','FeS₂',5,'#b0a060','Stable at the surface only because there is no oxygen to attack them.']],
      bio:{title:'Alive, but not advertising',dot:'#8fd0c9',desc:'Stromatolites and carbon-isotope ratios say life is already here, and most of the methane overhead is probably its breath. But with no free oxygen, this world would read as "ambiguous" to any telescope — a caution for judging exoplanets by O₂ alone.'},
      colorWhy:'Methane smog, cooked by ultraviolet light, absorbs blue and hangs as an orange veil — an Archean noon glowed amber, not blue. Beneath it the sea reads grey-green with dissolved iron, and the sparse land is unweathered basalt: dark, with nothing green on it, because nothing yet lives out of water.',
      note:'The Sun was ~20% dimmer then, and the ocean stayed liquid anyway — the faint young Sun problem, most likely solved by exactly the greenhouse gases in this reading.'},
    proterozoic:{atmoTitle:'Reconstructed: thin oxygen, quiet eon',pressure:'~1 bar (inferred)',
      atmoSummary:'Oxygen has arrived but not settled in: perhaps a hundredth of today’s level, enough to rust the continents red and kill the methane haze, nowhere near enough to breathe. The middle of the "Boring Billion" — a billion years in which not much else changed.',
      gases:[['N2',97.5],['O2',1.2],['CO2',0.8],['CH4',0.01],['O3',0.00001]],
      water:{state:'liquid oceans, continents to lap against',dot:'#3f7fb5',detail:'Real continents now, with shorelines, shallow shelf seas and the first big river systems moving sand with no roots to hold it. Ice appears at the poles in pulses.',sig:'Liquid-water red absorption offshore; bare-rock spectra inland, with no vegetation red edge anywhere.'},
      surfLabel:'Reconstructed surface',pigs:['liquid','hematite','ice'],
      compounds:[['Granite & gneiss','(K,Na)AlSi₃O₈',44,'#d8cfc0','Continental crust in bulk — the platforms every later landscape stands on.'],['Red beds (hematite-coated sand)','Fe₂O₃·SiO₂',18,'#b05a3c','Sandstone rusted red in open air: the first rocks that could only form under an oxygen sky.'],['Stromatolite carbonate','CaCO₃',12,'#e0d6bc','Microbial reefs at their all-time peak, before grazing animals exist to eat them.'],['Quartz sand','SiO₂',15,'#e6dcc4','Barren dunes and braided rivers; without land plants, sand goes wherever water and wind say.'],['Glacial tillite','—',3,'#b7b2a6','Scattered debris from the era’s cold snaps, prologue to the Snowball episodes ahead.']],
      bio:{title:'Faint, but certain',dot:'#a8cf70',desc:'The oxygen itself is the biosignature — nothing but photosynthesis makes it in these amounts. Life is everywhere in the water and nowhere on land; eukaryotic cells are here, and the first algae, but from orbit the continents read as dead rock.'},
      colorWhy:'The haze is gone, so nitrogen finally scatters a blue sky over blue seas. The land, though, is the colour of rust and bare sand from shore to summit — oxygen has painted the continents red, and nothing green will climb onto them for another half-billion years.',
      note:'A day is about 21 hours long here; the Moon, visibly closer, is still working the tides that will slow Earth to 24.'},
    noachian:{atmoTitle:'Reconstructed: thick enough for rain',pressure:'~1 bar (inferred)',
      atmoSummary:'Carbon dioxide dense enough to hold heat and pressure enough to keep water liquid — the atmosphere Mars had before the solar wind stripped it, isotope by isotope. MAVEN measured the leak; this is the balance run backwards.',
      gases:[['CO2',92],['N2',4],['H2O',2],['SO2',0.5],['Ar',1]],
      water:{state:'a northern ocean, lakes, and rain',dot:'#4a7a9f',detail:'The northern lowlands hold a sea covering a third of the planet; Gale and Jezero craters are lakes with river deltas that Curiosity and Perseverance have since driven across dry. Valley networks say rain fell here for millions of years.',sig:'Liquid-water red absorption across the northern hemisphere, water vapour bands above, and sulphate chemistry recording the evaporation to come.'},
      surfLabel:'Reconstructed surface',pigs:['liquid','hematite','olivine'],
      compounds:[['Basalt (olivine-rich)','(Mg,Fe)₂SiO₄',40,'#6f6558','Volcanic plains still fresh; Tharsis is building and the crust is young.'],['Clays (phyllosilicates)','Al₂Si₂O₅(OH)₄',20,'#9a7a5f','Rock altered by long-standing neutral water — the Noachian’s signature mineral, mapped from orbit across all the oldest terrain.'],['Hematite & iron oxides','Fe₂O₃',12,'#b8502e','The rust is already here; Mars was red even when it was blue in patches.'],['Sulphates (gypsum, jarosite)','CaSO₄·2H₂O',8,'#dcc98d','Left ring by ring as lakes shrink — the drying is already legible while the water is still standing.'],['Water ice','H₂O',6,'#cfe6f2','Highland glaciers and polar caps, feeding the rivers each thaw.']],
      bio:{title:'Unknown — and worth the trip',dot:'#e0b070','desc':'Standing water, energy and organic chemistry coexist here for millions of years; this exact window is why rovers land where they land. Nothing in the reconstruction settles whether anything lived in it — that is the open question, not a verdict.'},
      colorWhy:'Two Marses at once. The land is the familiar hematite rust, absorbing the blue half of the spectrum; the northern third reflects like any sea, dark and blue-grey. A thick CO₂ sky scatters enough light to read pale butterscotch-blue rather than the thin violet of today.',
      note:'Every delta, clay bed and shoreline in this reading is real, mapped geology — what is reconstructed is the sky that made them possible.'}
  }
