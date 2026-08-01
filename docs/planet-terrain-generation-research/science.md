# Orbital climate model

## Product rule

A seed describes canonical geography and volatile inventory. A system supplies
the star, orbit, size, axial tilt, and satellite relationship. Climate is
derived from both at runtime, so moving the same Earth outward keeps its
continents but changes its water phase, polar ice, moisture, vegetation
potential, clouds, and scan result.

This is astronomy and planetary science, not astrology. It is also a bounded
energy-balance estimate rather than a general circulation model. Every UI
result is labeled **modeled**; `vegetationPotential` means the climate could
support Earth-like photosynthesis, never that life was detected.

## Implemented calculation

1. Use a supplied bolometric stellar luminosity or infer a main-sequence
   luminosity from stellar mass.
2. Compute orbit-averaged incident flux with the inverse-square law and the
   eccentric-orbit mean of `1/r²`.
3. Estimate equilibrium temperature from flux and preset Bond albedo with full
   day/night redistribution.
4. Add a preset atmosphere greenhouse offset and a bounded satellite tidal
   term. Gas giants are classified separately because they have no solid
   surface.
5. Solve a latitude-dependent annual-mean temperature gradient for the
   persistent frost line. Axial tilt widens the pole-to-equator contrast;
   elevation applies a lapse-rate cooling term in the terrain worker.
6. Derive stable surface-liquid fraction, persistent ice coverage,
   evaporation/moisture transport, and Earth-like vegetation potential.
7. Compute conservative liquid-water habitable-zone edges from luminosity.
   Being inside is a useful target-selection condition, not proof of water or
   life; atmosphere, pressure, composition, size, and history still matter.

## Reference scenario

An Earth-like Meadow at 1 AU around a one-solar-luminosity star resolves near
288 K, with surface liquid water, a high-latitude permanent frost line, and a
climate compatible with vegetation. Move the identical seed to about 5.2 AU,
the orbit occupied by the sixth planet Jupiter, and it receives roughly 4% of
Earth's sunlight. The model falls below 180 K: surface liquid water reaches
zero, the water inventory freezes globally, evaporation and rain-fed rivers
stop, clouds weaken, and vegetation potential reaches zero.

## Scientific references

- NASA defines the habitable zone as the orbital region where a planet with a
  sufficient atmosphere could retain surface liquid water, while emphasizing
  that planet size, temperature, and stellar type also matter:
  https://science.nasa.gov/exoplanets/what-is-the-habitable-zone-or-goldilocks-zone/
- NASA's Earth energy-budget explanation records an average surface near
  15 °C and natural greenhouse warming of more than 30 °C:
  https://earthobservatory.nasa.gov/Features/EnergyBalance/page6.php
- NASA notes that placing Earth near Pluto would freeze the ocean and much of
  the atmosphere, while placing it at Mercury would drive water into steam:
  https://science.nasa.gov/exoplanets/what-is-the-habitable-zone-or-goldilocks-zone/
- Mars has water-ice polar caps plus seasonal carbon-dioxide frost; the latter
  can extend to roughly 55° latitude in winter, so its preset uses a distinct
  polar-frost temperature rather than Earth-water-ice assumptions:
  https://science.nasa.gov/resource/seasonal-processes-omega-sublimation/
- NASA's Mars overview connects axial tilt to seasons and explains that the
  thin atmosphere prevents stable surface liquid water today:
  https://science.nasa.gov/mars/facts/

## Known limits and next science steps

- Replace rounded atmosphere profiles with explicit surface pressure,
  atmospheric mass/composition, geothermal flux, and volatile inventories.
- Add stellar effective temperature and use spectrum-dependent conservative
  habitable-zone coefficients instead of solar-flux-only edges.
- Add seasonal latitude maps from obliquity, eccentricity, and orbital phase;
  the current surface is an annual-mean state with perihelion/aphelion bounds.
- Model runaway/moist greenhouse water loss, atmospheric collapse, carbonate
  cycling, ice-albedo hysteresis, and subsurface oceans.
- Derive planet mass/density, Roche limit, Hill sphere, tidal locking, and moon
  stability explicitly. Current satellite heating is intentionally bounded
  because the editor stores radius but not measured mass or interior rheology.
- Treat biosignatures probabilistically from chemistry and disequilibrium;
  never turn habitable-zone membership directly into life.
