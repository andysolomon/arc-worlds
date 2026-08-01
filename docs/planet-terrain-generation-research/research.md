# Research: 3D world and terrain generation

Date: 2026-07-31

## Recommendation

**Do not replace Arc Worlds with any one of the three projects.**

The best long-term direction is a hybrid that keeps Arc Worlds' existing renderer and lifecycle. It is a **prototype recommendation, not yet a production-ready replacement**:

1. **Keep Arc Worlds as the runtime foundation**: compact seeded params, worker-backed baking, flat/detailed tiers, shared Orbit geometry, narrow invalidation, caching, disposal, and render suspension.
2. **Keep the current synchronous `Surface` unchanged for v1 worlds.** A graph-backed v2 cannot hide behind its allocation-free `sample(direction)` API; it needs a separate asynchronous worker compiler that emits flat and detailed artifacts from one canonical world model.
3. **Adapt the proven parts of Mapgen4 selectively**: typed graph storage, mountain distance fields, downslope ordering, accumulated flow, rainfall ideas, and art-directed tuning. Spherical continents, plate behavior, wind, and climate remain new Arc Worlds design work rather than validated Mapgen4 features.
4. **Borrow selected visual techniques from `threejs-procedural-planets`**: smoother elevation-layer blending and optional precomputed normal detail. Do not adopt its complete shader, atmosphere, bloom, or animation loop.
5. **Do not incorporate `prolearner/procedural-planet`**. Its quadtree and triplanar ideas are useful references only if Arc Worlds later adds close surface flight.

This is the most promising route because Mapgen4 supplies useful **geographic building blocks**, the Three.js demo shows **how relief can read attractively**, and the current Arc Worlds engine already solves **how this product must run**. Keeping the current engine unchanged remains the lower-risk choice until a prototype proves the hybrid's bundle and runtime costs.

## Candidate findings

### 1. Red Blob Games Mapgen4

Sources:

- [Repository](https://github.com/redblobgames/mapgen4)
- [Interactive generator](https://www.redblobgames.com/maps/mapgen4/)
- [Red Blob's spherical experiment](https://www.redblobgames.com/x/1843-planet-generation/)

What it does well:

- Uses a compact Delaunay/Voronoi dual mesh and typed arrays.
- Separates mountain distance, elevation, rainfall, downslope, moisture, and flow into understandable passes.
- River routing is graph-based. Red Blob's spherical experiment reports that the river algorithm moved from a planar map to a sphere without algorithm changes because both are graphs.
- Runs calculations in a worker and transfers geometry buffers, matching Arc Worlds' performance direction.
- Is designed for attractive, editable maps rather than expensive physical simulation.
- Apache-2.0 licensing permits commercial reuse and includes an explicit patent grant.

Important limits:

- Mainline Mapgen4 is planar, not a globe generator.
- Its renderer, painting constraints, coastline treatment, and oblique map style are not directly reusable on a Three.js planet.
- The spherical version is explicitly a one-week experiment. Its author documents incomplete mountain rendering, simplified moisture, a known plate-code bug, and other unfinished behavior.
- Spherical continent formation, plate behavior, prevailing-wind climate, and resolution-independent hydrology are therefore research tasks for Arc Worlds, not features Mapgen4 has already validated.
- The README labels Mapgen4 unmaintained, although the repository received WebGL2 and terrain work in 2025 and documentation/subrepo updates in March 2026. It should be treated as source material, not an upstream runtime dependency.
- Mainline visual tuning targets roughly 25,000 cells. Copying the full system for every body when Orbit opens would be the wrong cost profile.

Verdict: **best algorithmic source, poor drop-in system**.

### 2. dgreenheck/threejs-procedural-planets

Sources:

- [Repository](https://github.com/dgreenheck/threejs-procedural-planets)
- [Live demo](https://dgreenheck.github.io/threejs-procedural-planets/)

What it does well:

- Direct Three.js fit and a strong first impression.
- A compact 128×128 sphere with GPU vertex displacement.
- Simplex, fractal, and ridged-fractal terrain modes.
- Five elevation-color layers with adjustable transition widths.
- Bump normals are reconstructed from nearby height samples, giving relief more visual detail than geometry alone.
- MIT licensed.

Why it should not become Arc Worlds' terrain engine:

- It is a rendering demo, not a world generator. There is no continent model, drainage, river network, climate, biome adjacency, or persistent world-data layer.
- It has no seed uniform. The shader's permutation is fixed, so parameter changes reshape one underlying pattern instead of generating independently seeded worlds.
- Its default fragment path evaluates terrain height three times for bump normals. At ten octaves that is up to thirty 3D simplex evaluations per fragment, in addition to vertex work.
- It adds a 4,000-point procedural atmosphere and full-screen bloom post-processing.
- It runs an unconditional `requestAnimationFrame` loop.
- Its own TODO calls out atmosphere performance and cloud scaling problems.
- It was built against Three.js r159, while Arc Worlds is on r185, and most recent commits in February 2025 were deployment configuration rather than engine development.

Verdict: **best visual reference, unsuitable runtime architecture**.

The useful idea is not “move generation into the fragment shader.” It is “use smooth layered color and fine normals.” Arc Worlds should first derive those as worker-produced position/color/normal buffers while retaining `MeshStandardMaterial`. A sampled normal texture or custom shader is a later option only if visible value justifies its sampler, upload, and shader-program costs.

### 3. prolearner/procedural-planet

Sources:

- [Repository](https://github.com/prolearner/procedural-planet)
- [Live demo](https://prolearner.github.io/procedural-planet/)

What it explores:

- Icosahedron, spherical-cube, and UV-sphere options.
- Perlin/simplex/ridged FBM and diamond-square terrain.
- CPU or GPU chunked quadtree LOD.
- Triplanar sand/grass/stone/snow texturing.
- Separate water, clouds, sky, and optional atmosphere shells.
- MIT licensed.

Why it is a poor fit:

- The project is effectively a 2016 codebase; its last source change was in 2016 and the 2020 commit only added a license.
- It uses globals and deprecated Three.js APIs such as `Geometry.vertices` and `PlaneBufferGeometry`.
- The default has sixteen noise octaves.
- Its animation path traverses the quadtree, creates/removes meshes, updates uniforms, and renders every frame.
- The CPU LOD code allocates many `Vector3` objects during generation and caches per-node geometries.
- It has no modern package, TypeScript, tests, worker lifecycle, or saved-world compatibility model.
- Arc Worlds currently shows whole globes at a bounded camera distance. Chunked terrain LOD adds complexity without visible value until close surface zoom exists.

Verdict: **do not adopt; retain only LOD/triplanar concepts for a future close-flight feature**.

## Directional runtime check

Method: each public demo was loaded sequentially at 1280×720 in the same headless Chromium/SwiftShader process, allowed to settle for three seconds, then sampled for three seconds. The callback cadence is not a formal FPS benchmark and the applications do different work, so these numbers are directional only.

| App | Encoded resources | JS heap | Mean callback gap | Max gap |
| --- | ---: | ---: | ---: | ---: |
| Mapgen4 | 129 KB | 16 MB | 23.5 ms | 35.9 ms |
| Three.js procedural planets | 156 KB | 10 MB | 206.3 ms | 248.5 ms |
| prolearner procedural planet | 949 KB | 109 MB | 44.6 ms | 136.4 ms |
| Arc Worlds local production build | 275 KB | 10 MB | 30.3 ms | 120.5 ms |

Interpretation:

- The modern shader demo is small to download but extremely expensive under software rasterization. Bundle size does not predict its fragment cost.
- The legacy demo carries by far the largest resource and heap footprint.
- Mapgen4's worker/data approach is efficient, but it renders a 2D map and cannot be compared directly with a layered 3D world.
- Arc Worlds' real-GPU measurements remain the acceptance evidence: 31–38 ms maximum gaps in WebKit/Chromium on Metal and no frames over 50 ms. The external demo sample does not replace the repository's controlled performance suite.

## Fit summary

| Option | Demonstrated fit for Arc Worlds | Potential |
| --- | --- | --- |
| Adopt Mapgen4 whole | Low: planar and painting-driven, despite strong worker/graph algorithms | High as an algorithm reference |
| Adopt dgreenheck whole | Low: expensive rendering demo with no seeded geography | High as a visual reference |
| Adopt prolearner whole | Very low: obsolete runtime architecture and unnecessary LOD | Limited to future close-flight ideas |
| Keep current engine unchanged | High: proven compatibility, responsiveness, and lifecycle | Limited geographic coherence |
| **Prototype the hybrid** | **TBD: bundle, topology, throughput, cancellation, and versioning are unproven** | **Highest product upside if it passes the budgets below** |

The hybrid is the recommended development direction because it has the highest product upside, not because a numeric score has already been earned.

## Recommended technical shape

### Spherical generation data

Use one fixed, reusable **canonical spherical adjacency graph** for every view. A geodesic/icosphere graph is the first prototype candidate, not a settled choice; compare it with a cube sphere before committing.

- A geodesic graph avoids UV-sphere pole concentration and gives every cell neighbors, but has twelve degree-five vertices, may reveal icosahedral directionality, and needs explicit interpolation into the existing UV sphere and equirectangular map.
- A cube sphere offers regular storage and simpler sampling but needs seam-safe adjacency and can reveal face directionality.
- The topology should be independent of seed and reusable across worlds.
- Use one modest canonical resolution for macro geography. Separate preview and detailed graphs would change coastlines, downslope, flow, and biomes.
- Detailed-only analytic FBM may add relief, but must not move coastlines, rivers, or biome boundaries.
- Define ocean outlets, depression filling, dry-world sinks, and spherical wind behavior before claiming coherent drainage and climate.
- Dynamic LOD is unnecessary at the current bounded globe camera distance.

Generate:

1. seeded continent/plate anchors and an analytic macro elevation field;
2. mountain chains from boundary or ridge distance fields;
3. a priority-flood/downslope pass and accumulated water flow;
4. latitude, elevation, and prevailing-wind moisture;
5. biome IDs and river edges;
6. fine FBM only as inexpensive local detail, not as the geography itself.

### Worker and cache model

- Keep all graph, hydrology, climate, pixel, vertex, and normal loops in a module worker.
- Keep canonical graph/elevation/biome data worker-owned. Transferring those arrays would detach the worker's cache.
- Transfer only final render artifacts: flat RGBA plus detailed position/color/normal buffers.
- Use separate cache identities:
  - canonical model = generator version + topology schema + seed + geography-affecting params;
  - render artifact = canonical key + artifact schema + output kind + resolution/detail + palette/presentation inputs;
  - a flat map that composites clouds must also include cloud coverage/identity.
- Resample the same canonical result into Orbit textures and detailed buffers.
- Add priorities so the focused world outranks offscreen/system previews.
- Do not rely on “ignore stale result” alone: the current serial worker still finishes obsolete work. A heavier compiler needs bounded phases with cooperative cancellation or a measured termination/restart strategy.
- On pause, document hiding, or viewport suspension, start no new v2 phases and suspend/cancel active work within one bounded phase. Instrument worker phase counts and CPU duration because the current paused-frame/main-thread metrics cannot see worker CPU.
- The current bake worker is roughly 91 KB raw against a 102.4 KB budget. Do not append v2 to it. Prototype v2 as a separately loaded worker/chunk and include both retained-v1 and new-v2 bundle costs in the decision.

### Rendering model

- **Orbit/flat:** preserve one shared smooth sphere geometry and the existing 256×128-style baked map. Do not add displaced geometry, river meshes, cloud particles, or unique shader topology per body.
- **Detailed first version:** upload worker-produced position, vertex-color, and normal buffers into the existing geometry and retain `MeshStandardMaterial`. This removes main-thread sampling and normal recomputation without introducing a new shader.
- A normal map/custom shader is a later measured enhancement, not part of the first architecture. It introduces extra samplers, uploads, and a detailed-view program variant.
- Keep water, clouds, and atmosphere as the existing lazy shells. Do not import the demo's particle atmosphere or bloom.
- Add rivers primarily to the color/normal output. Only add separate river geometry if a visual prototype proves it is visible at the current camera distance.
- Keep shader warmup scoped to the active subtree and preserve the Orbit limit of four added programs. Add a separate detailed-view shader/program metric if a custom material is ever introduced.

### Compatibility

Changing terrain algorithms silently would alter every saved world and shared link. Introduce an explicit generator version:

- missing version = current generator v1;
- new worlds opt into v2;
- v1 remains renderable;
- presentation-only options remain outside world identity.

This is repository-wide work, not one optional field. Version must participate in `PlanetParams`, `DEFAULT_PARAMS`, `sanitize`, `serialize`, random/preset construction, API payloads, system bodies, duplicate identity, worker requests, and every bake/surface cache key. Retaining immutable v1 links also means retaining the complete v1 renderer and accounting for its bundle cost.

The sampled surface goldens do not prove exact full-world compatibility. Add deterministic fixtures for complete v1 flat maps and detailed position/color/normal buffers before introducing v2.

## What to borrow

From Mapgen4:

- typed graph data;
- mountain distance fields;
- worker/transfer architecture;
- downslope ordering and accumulated flow;
- rainfall and rain-shadow concepts;
- attractive rather than over-physical tuning.

From dgreenheck:

- ridged-fractal option for local relief;
- smooth elevation-layer transitions;
- fine normal detail;
- interactive art-direction controls.

From prolearner:

- nothing in the first implementation;
- consider triplanar material detail and chunked cube-sphere LOD only if a later feature permits close surface approach.

## Acceptance bar for a prototype

These are provisional gates for deciding whether the architecture deserves production planning; they are not permission to loosen the checked-in budgets. A prototype should be rejected unless it:

- shows recognizably coherent continents, mountain chains, wet/dry regions, and drainage on at least three seeds;
- resamples one canonical macro result so flat, Orbit, and detailed coastlines/biomes do not drift;
- performs no **v2** generation loops on the main thread; preserved v1 intentionally retains its existing synchronous detailed path;
- keeps the previous complete artifact visible while recompiling, uses the existing palette placeholder only on first generation, and identifies background generation without blocking controls;
- gives input feedback within the existing 200 ms interaction budget and settles the latest focused detailed world within 1,000 ms after the final surface-affecting input;
- keeps Orbit's first system frame within 1,000 ms and settles all previews in a worst-case 24-body system within 3,000 ms without delaying focused-world work;
- divides cancellable work into phases no longer than 50 ms, uploads no obsolete artifact, and spends no more than 100 ms on a superseded job after replacement;
- adds no main-thread transfer/upload task over 50 ms;
- limits incremental memory to 32 MB for one focused world and 64 MB for a worst-case 24-body system cache;
- starts no worker phase while paused, hidden, or offscreen and reaches zero measured worker CPU within 100 ms of suspension;
- stays within current bundle/worker budgets or replaces code of equivalent size;
- adds no Orbit shader programs beyond the current limit;
- keeps existing same-machine performance within the repository's 10% regression guard;
- adds automated measurements the current Orbit benchmark does not cover: the thresholds above plus detailed-view first-use compilation;
- preserves v1 flat maps and detailed buffers against full artifact fixtures.
