# Little Worlds implementation plan

## Feature roadmap (captured 2026-07-28)

Ordered by suggested sequence: display options and Pluto first (small, high-value,
and the moons toggle directly serves the performance budgets), then gallery/system
plumbing, then the content collections, then the rendering and theming work.

Cross-cutting constraint: every phase must pass the checked-in budgets in
`performance-budget.json` via the local benchmark and the Performance workflow.
Display toggles are cheap state and must stay out of system bake keys, matching
the invalidation rules already in place.

### 1. Solar Systems — orbit-view display options

All in the orbit view (`src/engine/viewport.ts`, controls in
`src/components/SystemsPanel.tsx`). Persist toggles in localStorage; none of them
may trigger a texture re-bake.

- [x] Colour each orbit path to match its planet's dominant colour (the same
      palette tone the planet itself falls back to before its bake lands).
- [x] Give moons orbit paths — drawn in each moon's own colour, in the
      single-world view, which is the only place moons render.
- [x] Toggle to hide all orbit paths.
- [x] While paths are hidden, hovering a planet in orbit view fades in that
      planet's path alone; it fades away when the pointer leaves.
- [x] Labels toggle: planet names as canvas-texture sprites in orbit view,
      constant screen size, renamed labels redrawn without any rebuild.
- [x] Moons toggle: moons are not built at all when off, skipping their
      meshes and per-frame Kepler work. Effect evidenced by the Playwright
      triangle/line counts; a benchmark scenario that exercises the toggle
      is noted under next steps.

### 2. Solar Systems — Pluto

- [x] Add Pluto to `src/engine/planets.ts` from measured values: a = 39.482 AU,
      e = 0.2488, i = 17.16°, 247.94-year period, 122.5° axial tilt with
      retrograde 6.39-day rotation.
- [x] Verified in both scale models: the drawn perihelion crosses inside
      Neptune's orbit while semi-major ordering is preserved, asserted with the
      same ellipse arithmetic `applyOrbits` draws with.
- [x] No Pluto map exists in the CC BY set, so it renders procedurally: a new
      `pluto` palette (tholin tans to nitrogen-ice plains, blue haze), and a
      canonical-seed rule (`realFor`) so a texture-less body keeps its measured
      identity — Charon, tilt, spectrometer profile — until it is reseeded.
- [x] Charon: over half Pluto's radius, mutually locked, 6.39-day orbit.
- [x] Unit tests: Kepler period reproduced from distance (existing ORBITS loop
      now covers Pluto); odd-orbit assertions; drawn-crossing assertions.
      Spectrometer gained Pluto's measured New Horizons profile.

### 3. Worlds — choose the target system, warn on duplicates

Extends the four add-a-world flows (commit f214b18). Today the Worlds gallery
adds to whatever system the Systems tab is showing.

- [x] In `src/components/WorldsPanel.tsx`, a picker chooses which system a
      gallery world is added to: the current system plus your saved systems.
      Choosing a saved target makes it the active system with the world added.
- [x] Duplicate warning before adding, never a refusal. Identity is the
      sanitized, serialized params (`worldInSystem`) — bodies do not store a
      slug, and params identity is stronger anyway: a renamed copy still
      counts, a reshaped one does not, render-only fields are ignored.
- [x] Read-only behaviour kept: adding to a read-only system still produces an
      editable copy, and the panel names the destination before anything moves.
- [x] Four unit tests for the identity check; a Playwright spec walks picker,
      read-only copy, warn, cancel, and add-anyway on route fixtures (no DB).

### 4. Worlds — ancient worlds collection

Built-in presets alongside the existing eight world types, rendered
procedurally so the Scan tab chemistry can agree with the story each one tells:

- [x] Archean Earth (~3 Gya): global iron-tinted ocean, basalt island arcs,
      orange methane haze, anoxic N₂–CO₂–CH₄ atmosphere, no ice caps.
- [x] Proterozoic Earth (~1 Gya): continents with nothing living on them,
      ~1% oxygen, red beds, blue sky at last.
- [x] Noachian Mars (~4 Gya): northern ocean, ~1 bar CO₂, water clouds, clays
      and valley networks.
- [x] Three new palettes; hand-written ANCIENT_PROFILES reconstructions that
      open with "Reconstructed:" — gated by the same canonical-seed identity
      rule as Pluto, detaching into an ordinary world of their family
      (FAMILY map) on reseed. Loaded whole from an Ancient worlds chip row
      on the Sculpt tab.

### 5. Exoplanets collection

Well-known exoplanets as built-in systems, with the tab's usual honesty about
provenance — these need a labelling nuance the current origins lack:
**measured orbit, imagined surface**.

- [x] TRAPPIST-1 as a complete built-in system: seven planets with measured
      distances, periods, eccentricities, radii and tidally-locked days,
      around its 0.0898 M☉ star.
- [x] Individual famous worlds as their own observed systems: Proxima
      Centauri b, 51 Pegasi b (hot Jupiter), Kepler-452 b. Every observed
      period is unit-tested to be Kepler-consistent with its distance.
- [x] New `observed` origin: "orbits and years measured; the worlds wearing
      them are imagined — nobody has seen these surfaces." Read-only like the
      other built-ins; duplicating notes what it was built from.
- [x] Ember dwarf star kind (0.1 M☉); A_MIN lowered to 0.01 AU so a
      duplicated compact system survives sanitisation with its orbits intact.
- [x] Engine adaptation the plan didn't foresee: `systemStretch` and
      `tempoFor` in scale.ts — a system fitting inside 1 AU is stretched to
      fill the frame and slowed until its fastest orbit is watchable, one
      factor each so internal ratios stay exact and the Solar System is
      provably untouched.
- [x] The phase-4 bundle flag, closed: profile prose now loads as its own
      chunk during the spectrometer sweep; entry fell below the phase-1
      baseline, and the size guard gained a per-lazy-chunk budget so split
      code can never again grow unwatched.

### 6. Pop-culture worlds

Homage systems from film and TV — Star Wars (Tatooine, Hoth, Mustafar) and
Project Hail Mary (Erid at 40 Eridani, Adrian at Tau Ceti) — labelled invented,
like Andromeda.

- [ ] Original procedural interpretations only: no copyrighted imagery or
      textures; short fictional names used referentially.
- [ ] Tatooine's binary sunset is the icon of the whole idea, and the engine is
      single-star. Decide up front: scope this collection to single-star systems,
      or take on binary-star support as its own engine task first.
- [ ] Each world gets Scan-tab chemistry consistent with its fiction where the
      fiction says (Erid's thick atmosphere, Adrian's Astrophage-warmed orbit).

### 7. Sculpting — animated fluids and two rendering tiers

- [ ] Visible motion for liquids and gas: time-based water surface shimmer,
      drifting gas-giant bands (the GLSL shaders in `src/engine/shaders.ts`
      already own these surfaces), slow lava flow for Ember-type worlds.
      Animation must respect the 30 fps passive budget and stop when paused,
      hidden or offscreen, exactly like rotation does today.
- [ ] Two deliberate rendering tiers, offered as a quality choice rather than an
      accident of which collection a planet came from: **flat** (baked/image
      maps — what real planets and orbit view already use; cheap) and
      **detailed** (displaced geometry with water/cloud/atmosphere shells — what
      the sculptor uses). Real planets gain an optional detailed mode; sculpted
      worlds gain an explicit flat mode. `engine/surface.ts` stays the single
      source of what a world looks like, so the two tiers may differ in richness
      but never in identity.

### 8. Universe — appearance attributes

- [ ] Adjustable universe theme: starfield density and brightness, background
      nebula tint, overall exposure/glow.
- [ ] Decide storage: global viewer preference (localStorage) versus part of
      `SystemDef` (shareable, but then it enters the schema, sanitisation and
      the immutable-cache story). Default recommendation: viewer preference
      first; promote to saved-system state only if sharing a look turns out to
      matter.

## Performance plan (delivered 2026-07-28)

### Goal

Keep Arc Worlds responsive while opening and manipulating procedural multi-world
systems, particularly in Safari on high-density displays.

### Success criteria

- Opening an eight-world custom system produces no procedural-bake task over 50 ms
  on the browser main thread.
- First interaction with a newly visible scene remains below 200 ms INP.
- Passive animation targets 30 fps; direct manipulation remains full-rate.
- Paused, hidden, and offscreen viewports stop scheduling render work.
- Saved share links use immutable edge/browser caching and execute near the
  database region.
- Every pull request enforces bundle and browser budgets and compares
  performance-sensitive metrics with its base revision on the same runner.
- Future feature work has a documented performance checklist and repository
  guidance that treats performance as an acceptance criterion.

### Delivered

- [x] Move orbit-map and cloud-map noise loops into module workers.
- [x] Transfer RGBA buffers and upload them as mapped `DataTexture`s.
- [x] Ignore stale worker results and cancel superseded system/cloud jobs.
- [x] Keep mapped shader variants stable with palette/transparent placeholders.
- [x] Warm new shader/material topology with `compileAsync` before presentation.
- [x] Cache moon geometry and materials for reuse across visits.
- [x] Recompute procedural sphere vertices only for surface-affecting params.
- [x] Exclude names, lighting, animation, and other cheap state from system bake keys.
- [x] Cap DPR at 1.5, disable MSAA above 1.5 DPR, and lower DPR after sustained slow frames.
- [x] Render passive rotation at 30 fps and use render-on-demand while paused.
- [x] Suspend rendering while the document is hidden or viewport is offscreen.
- [x] Remove live-canvas backdrop blur and throttle diagnostic DOM writes.
- [x] Cache immutable saved worlds/systems for one year.
- [x] Pin Vercel functions to `iad1`, adjacent to the configured `us-east-1` database.
- [x] Add checked-in browser, idle-rendering, and bundle-size budgets.
- [x] Add a repeatable local Chromium benchmark with one-run smoke and three-run
  median modes.
- [x] Add automated budget and relative-regression checks.
- [x] Add a dedicated GitHub Performance workflow with downloadable evidence.
- [x] Add a performance-aware pull request checklist.
- [x] Add project-specific performance policy and commands to `AGENTS.md`.

### Verification

- [x] TypeScript project references compile.
- [x] Oxlint passes.
- [x] Unit suite covers deterministic world/cloud pixel baking.
- [x] Production build emits procedural baking as a separate worker asset.
- [x] Playwright covers first render, measured systems, and custom multi-world systems.
- [x] Production deployment is ready in `iad1` and the live alias passes a WebGL/worker smoke test.
- [x] Controlled Chromium A/B benchmark recorded against pre-optimization `main`.
- [x] New bundle-budget script passes against a clean production build.
- [x] New local performance smoke and three-run median pass browser and idle-work budgets.
- [x] Typecheck, lint, unit, build, and end-to-end suites pass with the guardrails.
- [ ] Re-profile production on the original Safari hardware and record INP/p95 frame time.
