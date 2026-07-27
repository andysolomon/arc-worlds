# Little Worlds

Sculpt a planet, then see who lives there.

A browser-based 3D planet sculptor and solar-system viewer built on Three.js. Generate procedural worlds from a seed and shape them with a handful of sliders, run a spectrometer over them to find out what the atmosphere is made of, or leave your own worlds behind and go visit the eight real planets — rendered from measured data, moons and rings included.

The renderer runs entirely in the browser. Saving a world stores its parameters in Postgres and
gives you a permanent link to it, so worlds can be shared and browsed in a public gallery.

## Running it

Requires [Bun](https://bun.sh).

```sh
bun install
bun dev
```

The gallery needs a Postgres database. Everything else — sculpting, scanning,
the whole solar system — works without one; the Worlds tab simply reports that
it cannot reach the gallery.

```sh
vercel env pull .env.local   # DATABASE_URL, provisioned by the Neon integration
bun run db:push              # create the worlds table
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

**Sculpt** — the world-builder. A seed drives procedural terrain, and eight world types set the palette: five rocky (Meadow, Dune, Frost, Ember, Candy) and three gas giants (Amber, Mist, Storm). Sliders control mountains, sea level, roughness, cloud cover, ice caps, atmospheric glow, spin direction and speed, and sun angle. Rings are fully procedural — count, inner radius, width, gap, tilt, opacity and colour — as are up to three moons. **Surprise me** rolls the whole thing at random.

**Scan** — a spectrometer readout for whatever world is currently on screen, split across Atmosphere, Surface & water, and Light. It reports composition by volume with a per-gas explanation, surface mineralogy, the state of any water, a biosignature assessment, and the specific absorption lines that would give each result away. The chemistry responds to the sliders: push sea level and cloud cover up on a Meadow world and you get a nitrogen–oxygen atmosphere flagged as out of equilibrium; drop them and the same seed reads as anoxic nitrogen–CO₂.

**Milky Way** — the real solar system, in two views.

- *Planet list* — visit any of the eight planets and see it rendered from its real texture, then hit **Reshape** to pull it into the sculptor and start editing.
- *Orbit view* — all eight orbiting a procedural sun on their real elliptical, inclined paths, at real relative orbital pace (one Earth year ≈ 14 seconds). **Same size** draws every planet alike so the small ones stay findable; **To scale** ranks them by true size. Click any planet to visit it.

**Worlds** — the gallery of recently saved worlds. Saving gives you a permanent `/w/:slug` link
you can send to anyone; opening one regenerates it in full 3D from its stored parameters. No
account is needed, and nothing is stored about you — just the world.

## What's modelled

The real planets are driven by measured values in `src/engine/planets.ts` rather than eyeballed approximations:

- **Bodies** — axial tilt, oblateness (Saturn is visibly squashed), and sidereal rotation period, with retrograde spin for Venus and Uranus.
- **Orbits** — semi-major axis, period, eccentricity, inclination to the ecliptic, longitude of ascending node, and longitude of perihelion. Positions are Kepler-solved, so the elliptical speed-up near perihelion is real.
- **Moons** — 21 moons across six planets at their real relative radii, semi-major axes, orbital periods and inclinations. Tidally locked moons keep one face inward. Triton orbits retrograde and steeply inclined; Nereid runs its genuinely eccentric path; Iapetus carries its two-tone Cassini Regio colouring. Phobos, Deimos, Proteus and Nereid are modelled as irregular bodies rather than spheres.
- **Rings** — generated in GLSL, not textured, each with its own radial profile: Saturn's C/B/A structure with the Cassini division and the Encke gap; Uranus's ten narrow dark ringlets; Neptune's clumpy Adams arcs. Rings cast a shadow onto the planet, and the unlit face renders dimmer than the lit one.

Long-period moons are eased in wall-clock time so Iapetus and Nereid still visibly move without rushing the inner moons, and orbital distances are compressed — order-preserving, but not to scale, so that everything stays in frame.

## Layout

```
src/engine/      the renderer, with no knowledge of React
  types.ts       PlanetParams — the entire description of a world
  noise.ts       seeded PRNG, 3D simplex noise, fbm
  scale.ts       scale models and Kepler solving
  planets.ts     measured data for the real bodies
  palettes.ts    colour ramps per world type
  shaders.ts     GLSL for rings, gas giants, the sun and atmospheres
  materials.ts   ring/moon geometry and texture generation
  viewport.ts    PlanetViewport — owns the scene and the animation loop
src/data/        PRESETS, SOLAR, and the spectrometer datasets
src/lib/         params (defaults, validation, randomisation), scan, api client
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

`PlanetViewport` owns its canvas, its GPU resources and its own animation loop.
React creates it once and feeds it params imperatively — re-rendering React
never rebuilds the scene.

Params arriving over the wire are re-sanitised on the server with the same
`sanitize()` the UI uses, so a hand-crafted payload cannot push an out-of-range
value or an arbitrary asset path into anyone else's renderer.

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
