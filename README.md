# Little Worlds

Sculpt a planet, then see who lives there.

A browser-based 3D planet sculptor and solar-system viewer built on Three.js. Generate procedural worlds from a seed and shape them with a handful of sliders, run a spectrometer over them to find out what the atmosphere is made of, or leave your own worlds behind and go visit the eight real planets — rendered from measured data, moons and rings included.

Everything runs client-side. There is no build step, no bundler, and no server-side anything.

## Running it

The app must be served over HTTP. Opening `Little Worlds.dc.html` as a `file://` URL will not work — the browser blocks the texture loads as cross-origin requests, and every planet renders untextured.

```sh
python3 -m http.server 8000
# then open http://localhost:8000/Little%20Worlds.dc.html
```

Any static file server works equally well:

```sh
npx serve .
bunx serve .
```

Three.js and React are pulled from CDNs at runtime, so the first load needs a network connection.

## The four tabs

**Sculpt** — the world-builder. A seed drives procedural terrain, and eight world types set the palette: five rocky (Meadow, Dune, Frost, Ember, Candy) and three gas giants (Amber, Mist, Storm). Sliders control mountains, sea level, roughness, cloud cover, ice caps, atmospheric glow, spin direction and speed, and sun angle. Rings are fully procedural — count, inner radius, width, gap, tilt, opacity and colour — as are up to three moons. **Surprise me** rolls the whole thing at random.

**Scan** — a spectrometer readout for whatever world is currently on screen, split across Atmosphere, Surface & water, and Light. It reports composition by volume with a per-gas explanation, surface mineralogy, the state of any water, a biosignature assessment, and the specific absorption lines that would give each result away. The chemistry responds to the sliders: push sea level and cloud cover up on a Meadow world and you get a nitrogen–oxygen atmosphere flagged as out of equilibrium; drop them and the same seed reads as anoxic nitrogen–CO₂.

**Milky Way** — the real solar system, in two views.

- *Planet list* — visit any of the eight planets and see it rendered from its real texture, then hit **Reshape** to pull it into the sculptor and start editing.
- *Orbit view* — all eight orbiting a procedural sun on their real elliptical, inclined paths, at real relative orbital pace (one Earth year ≈ 14 seconds). **Same size** draws every planet alike so the small ones stay findable; **To scale** ranks them by true size. Click any planet to visit it.

**Worlds** — worlds you've saved, persisted to `localStorage`. Nothing leaves the browser.

## What's modelled

The real planets are driven by measured values in `planet-engine.js` rather than eyeballed approximations:

- **Bodies** — axial tilt, oblateness (Saturn is visibly squashed), and sidereal rotation period, with retrograde spin for Venus and Uranus.
- **Orbits** — semi-major axis, period, eccentricity, inclination to the ecliptic, longitude of ascending node, and longitude of perihelion. Positions are Kepler-solved, so the elliptical speed-up near perihelion is real.
- **Moons** — 21 moons across six planets at their real relative radii, semi-major axes, orbital periods and inclinations. Tidally locked moons keep one face inward. Triton orbits retrograde and steeply inclined; Nereid runs its genuinely eccentric path; Iapetus carries its two-tone Cassini Regio colouring. Phobos, Deimos, Proteus and Nereid are modelled as irregular bodies rather than spheres.
- **Rings** — generated in GLSL, not textured, each with its own radial profile: Saturn's C/B/A structure with the Cassini division and the Encke gap; Uranus's ten narrow dark ringlets; Neptune's clumpy Adams arcs. Rings cast a shadow onto the planet, and the unlit face renders dimmer than the lit one.

Long-period moons are eased in wall-clock time so Iapetus and Nereid still visibly move without rushing the inner moons, and orbital distances are compressed — order-preserving, but not to scale, so that everything stays in frame.

## Layout

```
Little Worlds.dc.html   UI, presets, spectrometer data, app state
planet-engine.js        <planet-viewport> custom element — Three.js scene,
                        procedural terrain, ring and sun shaders, real-planet data
support.js              dc-runtime (generated — do not edit by hand)
images2k/               2K planet surface textures + Earth cloud map
github.md               upstream texture provenance and sync log
```

`Little Worlds.dc.html` is a Claude Design document: an `<x-dc>` template plus a component class, rendered by the runtime in `support.js`. `support.js` is generated output — edit the upstream `dc-runtime` sources instead. `planet-engine.js` is plain ES5 in an IIFE and has no dependency on the UI layer; it registers `<planet-viewport>` and takes a params object.

## Credits and licensing

Planet textures are from [Solar System Scope](https://www.solarsystemscope.com/textures), licensed **CC BY 4.0** — see `images2k/LICENSE.txt` for the attribution and the list of modifications. They were sourced via `qt/qt3d` at `tests/manual/planets-qml/images/solarsystemscope/`, as recorded in `github.md`.

The orbit view's scale model was informed by [qunabu/Gravity](https://github.com/qunabu/Gravity) — read as reference, with no code copied.

Three.js `0.152.2` and React `18.3.1` load from CDN at runtime.

No licence has been chosen for the project's own code yet.
