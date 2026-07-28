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
    Xe:{n:'Xenon',f:'Xe',eff:'A heavy noble gas — inert and colourless, but dense enough that a few percent of it noticeably thickens the air.',lines:[[823.2,'Xe I','Xenon emission — at the far red edge of sight',1]]},
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

