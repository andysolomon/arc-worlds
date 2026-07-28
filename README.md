# Little Worlds

Sculpt a planet, then see who lives there.

A browser-based 3D planet sculptor and star-system builder on Three.js. Generate procedural worlds from a seed and shape them with a handful of sliders, run a spectrometer over them to find out what the atmosphere is made of, visit the eight real planets — and Pluto — rendered from measured data, then arrange worlds of your own into a system and set them orbiting.

The renderer runs entirely in the browser. Saving a world or a system stores its parameters in
Postgres and gives you a permanent link, so both can be shared and browsed.

## Running it

Requires [Bun](https://bun.sh).

```sh
bun install
bun dev
```

Saving and sharing needs a Postgres database. Everything else — sculpting,
scanning, the Solar System, building a system of your own — works without one;
the affected panels simply report that they cannot reach the gallery.

```sh
vercel env pull .env.local   # DATABASE_URL, provisioned by the Neon integration
bun run db:push              # create the worlds and systems tables
```

| Command | What it does |
| --- | --- |
| `bun dev` | Vite dev server |
| `bun run build` | Typecheck all three projects, then build |
| `bun run typecheck` | `tsc -b` across app, node and server configs |
| `bun run lint` | oxlint |
| `bun run test` | Vitest unit tests |
| `bun run test:e2e` | Playwright, against a real production build |
| `bun run db:push` | Push the Drizzle schema to Postgres |
| `bun run db:studio` | Drizzle Studio |

The original single-file prototype still runs, unchanged, from `prototype/` —
serve the repo over HTTP and open `prototype/Little Worlds.dc.html`.

## The four tabs

**Sculpt** — the world-builder. A seed drives procedural terrain, and eight world types set the palette: five rocky (Meadow, Dune, Frost, Ember, Candy) and three gas giants (Amber, Mist, Storm). Sliders control mountains, sea level, roughness, cloud cover, ice caps, atmospheric glow, spin direction and speed, and sun angle. Rings are fully procedural — count, inner radius, width, gap, tilt, opacity and colour — as are up to three moons. **Surprise me** rolls the whole thing at random. An **Ancient worlds** row loads deep-time reconstructions whole — Archean Earth under its orange methane haze, Proterozoic Earth with continents nothing lives on, Noachian Mars while it still had a sea. Each keeps a canonical seed: hold onto it and the spectrometer reads the reconstruction (and says that is what it is); reseed it and the world detaches into an ordinary sculptable one, the same identity rule the measured planets follow.

**Scan** — a spectrometer readout for whatever world is currently on screen, split across Atmosphere, Surface & water, and Light. It reports composition by volume with a per-gas explanation, surface mineralogy, the state of any water, a biosignature assessment, and the specific absorption lines that would give each result away. The chemistry responds to the sliders: push sea level and cloud cover up on a Meadow world and you get a nitrogen–oxygen atmosphere flagged as out of equilibrium; drop them and the same seed reads as anoxic nitrogen–CO₂.

**Systems** — a star and the worlds that orbit it, in two views.

- *Body list* — visit any world in the system and see it rendered on its own, then hit **Reshape** to pull it into the sculptor and start editing.
- *Orbit view* — everything orbiting its star on real elliptical, inclined paths at the pace its own orbit implies (one Earth year ≈ 14 seconds). **Same size** draws every planet alike so the small ones stay findable; **To scale** ranks them by true size. Click any planet to visit it.

Four kinds of system sit side by side, and the tab is careful about which is which:

- **The Solar System** — ours, every number measured. Read-only; duplicating it gives you an editable copy.
- **Observed systems** — TRAPPIST-1, Proxima Centauri, 51 Pegasi and Kepler-452: real exoplanet
  systems whose distances, years, eccentricities and sizes are measured, wearing procedural
  surfaces that are imagined — nobody has seen one up close, and the tab says exactly that. A
  compact system like TRAPPIST-1, which would fit entirely inside Mercury's orbit, is stretched to
  fill the frame and slowed just enough to watch — one factor each for distance and time, so every
  internal ratio stays exact and TRAPPIST-1 h still orbits 12.4× slower than b.
- **Andromeda** — an invented system around an orange dwarf, labelled as invented wherever it appears.
- **Yours** — duplicate an existing system, roll a whole one from a seed, or start empty. Set each world's distance, size and orbital stretch, pick a star, and save it for a permanent `/s/:slug` link.

Worlds go into a system four ways, and none of them needs a trip through the sculptor first: pick
one of the eight world types and a new world of that type is rolled straight into orbit; add the
world you happen to be sculpting; add one of your saved worlds, from either the Systems tab or the
Worlds gallery; or duplicate something already orbiting, which carries the name on down the line —
Mirabelle, Mirabelle II, Mirabelle III. Every new world lands on its own orbit outside everything
already there, and every one of them stays fully sculptable afterwards. Adding from the gallery to
a read-only system gives you an editable copy of it rather than refusing the click: the system
being added to is on another tab, so the Worlds panel names it before you touch anything — and a
picker there aims Add at any of your saved systems instead of the one currently on screen. If the
chosen system already holds that exact world, the panel says so and asks before adding it again;
duplicates are allowed, just never silent.

A world knows nothing about where it is: `PlanetParams` describes a planet, and everything that
only means something relative to a star — distance, eccentricity, inclination, axial tilt — lives on
the system's body instead. That is what lets any world drop into any system unchanged.

**Worlds** — the gallery of recently saved worlds. Saving gives you a permanent `/w/:slug` link
you can send to anyone; opening one regenerates it in full 3D from its stored parameters. No
account is needed, and nothing is stored about you — just the world.

## What's modelled

The real planets are driven by measured values in `src/engine/planets.ts` rather than eyeballed approximations:

- **Bodies** — axial tilt, oblateness (Saturn is visibly squashed), and sidereal rotation period, with retrograde spin for Venus and Uranus.
- **Orbits** — semi-major axis, period, eccentricity, inclination to the ecliptic, longitude of ascending node, and longitude of perihelion. Positions are Kepler-solved, so the elliptical speed-up near perihelion is real.
- **Moons** — 22 moons across seven bodies at their real relative radii, semi-major axes, orbital periods and inclinations. Tidally locked moons keep one face inward. Triton orbits retrograde and steeply inclined; Nereid runs its genuinely eccentric path; Iapetus carries its two-tone Cassini Regio colouring. Phobos, Deimos, Proteus and Nereid are modelled as irregular bodies rather than spheres. Charon, over half Pluto's own radius, rides the mutually locked pair's 6.4-day orbit.
- **Rings** — generated in GLSL, not textured, each with its own radial profile: Saturn's C/B/A structure with the Cassini division and the Encke gap; Uranus's ten narrow dark ringlets; Neptune's clumpy Adams arcs. Rings cast a shadow onto the planet, and the unlit face renders dimmer than the lit one.

Long-period moons are eased in wall-clock time so Iapetus and Nereid still visibly move without rushing the inner moons, and orbital distances are compressed — order-preserving, but not to scale, so that everything stays in frame.

Invented systems get the same treatment. You give a world a distance and its year follows from
Kepler's third law, `P² = a³ / M★` — so moving a planet outward slows it down, and making the star
heavier speeds everything up. The same law reproduces all nine measured periods to the nearest
year, which is what makes it fair to use for the imagined ones.

The star's mass also sets its size, by the main-sequence mass–radius relation: radius tracks mass
below the Sun and lags to about `M^0.8` above it, so the five star kinds on offer span roughly 0.3
to 2.0 solar radii. Stars are drawn to that ordering but not to that ratio — relative to orbital
distances a star is already vastly larger than life, so a true sevenfold spread would leave a
blue-white star sitting on top of its own inner planets. The spread is compressed to about two to
one, and a one-solar-mass star comes out at exactly its old size, which leaves the Solar System
untouched. The star chips in the panel are drawn at the same sizes, so the swatch previews the
star rather than only its colour — which matters, because picking one is really picking a mass.

Star colour is generated, not filtered. The Sun's surface is a hand-tuned ramp — dark red lanes,
orange granulation, pale hot granules, cooler spots — and tinting it cannot produce a hot star,
because that ramp holds almost no blue and a multiply only ever removes light. So every star other
than the Sun has the same brightness structure rebuilt around its own colour: the hottest granules
run toward white, and everything cooler is both darker and redder by an amount that falls away for
hot stars, whose granulation spans a much flatter part of the spectrum. The Sun's tint is exactly
white, and the two ramps are crossfaded on distance from white, so the Solar System renders
identically to before.

## Layout

```
src/engine/      the renderer, with no knowledge of React
  types.ts       PlanetParams and SystemDef — the whole description of a world and of a system
  noise.ts       seeded PRNG, 3D simplex noise, fbm
  scale.ts       scale models, Kepler solving, orbital periods
  planets.ts     measured data for the real bodies
  palettes.ts    colour ramps per world type
  surface.ts     what a world looks like, as a function of direction
  bake.ts        that surface rendered to a map, for orbit-view planets
  shaders.ts     GLSL for rings, gas giants, stars and atmospheres
  materials.ts   ring/moon geometry and texture generation
  viewport.ts    PlanetViewport — owns the scene and the animation loop
src/data/        PRESETS, SOLAR, the built-in systems, and the spectrometer datasets
src/lib/         params and systems (defaults, validation, generation), scan, api client
src/components/  React UI, one component per tab
api/             Vercel Functions
db/              Drizzle schema and lazy Neon client
e2e/             Playwright specs
prototype/       the original .dc.html prototype, still runnable
public/images2k/ 2K planet textures
```

**A world is just its params.** Seed plus about twenty numbers, under 1KB of
JSON. That object is what gets stored, what gets shared, and what the renderer
consumes. There are deliberately no thumbnails anywhere: a captured image would
drift out of date the moment the renderer changed, whereas params always render
correctly against the engine as it exists today. Opening a shared world
regenerates it in full 3D rather than showing a picture of it.

**One surface, two views.** `engine/surface.ts` is the only place that decides
what a sculpted world looks like. The single-world view feeds it sphere
vertices and writes vertex colours; the orbit view feeds it equirectangular
texels and bakes a small map, because at a few dozen pixels across a planet
does not need displaced geometry and its own water, cloud and atmosphere
shells. Sharing the function is the point — otherwise the same seed could read
as two different planets depending on which view you were in. `surface.test.ts`
holds 66 samples captured from the renderer *before* that code was extracted,
so the refactor is provably invisible to anyone's saved world.

`PlanetViewport` owns its canvas, its GPU resources and its own animation loop.
React creates it once and feeds it params and a system imperatively —
re-rendering React never rebuilds the scene. The engine diffs a system in two
layers: appearance and orbits. Changing a distance moves a planet without
re-baking any textures; only a world's own identity triggers a rebuild.

Params and systems arriving over the wire are re-sanitised on the server with
the same functions the UI uses, so a hand-crafted payload cannot push an
out-of-range value or an arbitrary asset path into anyone else's renderer.
`sanitizeSystem()` additionally forces `origin` back to `custom` and re-derives
every orbital period from the distance and the star: a payload can neither
claim its invented numbers are measured ones, nor orbit at a speed its own
geometry cannot justify.

## Deployment

Deployed on Vercel with Neon Postgres via the Marketplace integration, which
provisions `DATABASE_URL` automatically.

Two version constraints are load-bearing:

- **TypeScript is pinned to 6.x.** `@vercel/node` compiles `api/` with the
  project's local TypeScript and breaks on TypeScript 7 — the native rewrite
  changes the Node API surface, and the builder dies with
  `Cannot read properties of undefined (reading 'readFile')`.
- **three.js is r185**, which removed `useLegacyLights`. The orbit view's
  `PointLight` carries an explicit 4π conversion so its intensity still matches
  what the prototype looked like under r152.

## Credits and licensing

Planet textures are from [Solar System Scope](https://www.solarsystemscope.com/textures), licensed **CC BY 4.0** — see `public/images2k/LICENSE.txt` for the attribution and the list of modifications. They were sourced via `qt/qt3d` at `tests/manual/planets-qml/images/solarsystemscope/`, as recorded in `prototype/github.md`.

The orbit view's scale model was informed by [qunabu/Gravity](https://github.com/qunabu/Gravity) — read as reference, with no code copied.

Three.js `r185` and React `19` are bundled by Vite. The prototype in `prototype/` still loads
Three.js `0.152.2` and React `18.3.1` from CDN at runtime.

No licence has been chosen for the project's own code yet.
