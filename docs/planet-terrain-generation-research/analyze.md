# Analysis: choosing a world and terrain generation system

## Decision to make

Choose the generation architecture that best improves Arc Worlds' planet style and geographic coherence without sacrificing its defining product properties:

- deterministic worlds represented by compact seeds and sliders;
- the same identity in detailed, flat, orbit, saved, and shared views;
- immediate sculpting feedback;
- many cheap planets in system view;
- strict bundle, worker, interaction, shader-program, and idle-rendering budgets.

This is an architecture choice, not a library popularity contest. The candidates solve different layers:

1. **Mapgen4**: map-scale land shape, coast, drainage, climate, and biome logic on a planar irregular mesh.
2. **threejs-procedural-planets**: globe rendering and visual treatment in Three.js, especially shader-driven terrain/atmosphere/cloud presentation.
3. **prolearner/procedural-planet**: another complete procedural globe implementation whose useful value must be separated into algorithms, rendering ideas, licensing, and maintenance quality.
4. **Current Arc Worlds engine**: a compact deterministic direction sampler, worker-baked maps, two rendering tiers, and mature performance lifecycle.

## Evaluation criteria

| Criterion | Weight | Why it matters here |
| --- | ---: | --- |
| Integration fit and identity consistency | 25% | A generator must feed both texture and detailed globe paths from one world definition. |
| Runtime performance | 25% | Sculpt interaction and Orbit transition are explicitly budgeted; paused work must remain zero. |
| Visual quality and art-direction range | 20% | The goal is more convincing worlds, not merely more simulation. |
| Geographic coherence | 15% | Continents, mountain chains, rivers, climate, and biomes should tell one readable story. |
| Determinism, testability, and versioning | 10% | Existing links regenerate from params and old geography is golden-tested. |
| License, maintenance, and dependency risk | 5% | Borrowed code must be legally usable and maintainable inside the current small engine. |

## Architectural constraints established from the repository

- Do not replace Orbit planets with per-body displaced meshes or per-body bespoke shader topologies.
- Do not run continental, erosion, hydrology, or high-resolution pixel loops on the main thread.
- Do not let presentation controls invalidate generated geography.
- Do not introduce a continuously running simulation or unconditional animation loop.
- Preserve the current `Surface` path for v1 worlds. A richer v2 model must compile asynchronously in a worker and become the single source of its own flat and detailed render artifacts.
- Treat existing unversioned worlds as generator version 1; a materially different algorithm should generate version 2 worlds rather than silently changing saved links.

## Research questions

1. What algorithms and data structures does each candidate actually use?
2. Is each system spherical, planar, CPU, GPU, precomputed, or interactive?
3. Can its output be computed in a module worker and transferred/cache-keyed?
4. Can one output drive both a low-cost texture and a detailed globe?
5. What is the actual license and repository health?
6. Which visual ideas can be adopted without importing an incompatible architecture?
7. Is a hybrid system more appropriate than selecting one repository wholesale?
8. Can one canonical spherical data resolution serve every view without preview/detail drift?
9. How will a heavier worker prioritize, cancel, and cache jobs while staying below the current 102.4 KB worker limit?
10. Is a geodesic graph, cube sphere, or another topology actually best after interpolation, sinks, wind, and directional-bias costs are included?

## Initial hypothesis to test

The likely best fit is a **hybrid evolution of Arc Worlds**, not a wholesale adoption:

- retain the existing v1 `Surface`, two tiers, suspension rules, and Orbit texture strategy;
- introduce a separate v2 worker compiler that owns one canonical spherical data model and emits every view's artifacts;
- adapt Mapgen4's geographic ideas selectively into a spherical/off-thread world-data stage;
- borrow rendering techniques from the strongest Three.js planet demo selectively;
- avoid making any example repository a runtime dependency.

Research must still determine whether the candidate code, license, topology, bundle cost, and measured complexity support that hypothesis. No high integration/performance score is justified until a bounded prototype measures system-view throughput, focused-world latency, cancellation waste, memory, transfer/upload time, and shader compilation.
