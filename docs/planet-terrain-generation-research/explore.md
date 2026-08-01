# Existing planet and terrain system

## Product shape

- A saved world is a small deterministic parameter object, not a mesh or image. The same seed and sliders must regenerate the same world (`src/engine/types.ts:1-54`, `src/components/WorldsPanel.tsx:75-80`).
- `src/engine/surface.ts` is deliberately the single source of surface identity. Its direction sampler drives both detailed sphere vertices and the equirectangular map used by flat/orbit views (`src/engine/surface.ts:1-8`).
- There are two display tiers. Flat uses a baked or photographic map on a smooth sphere; detailed uses displaced geometry plus water, cloud, and atmosphere shells (`src/engine/tiers.ts:1-26`).

## Current generation pipeline

- Terrain is seeded 3D simplex FBM sampled by unit-sphere direction. Rocky elevation combines a continental field and a ridged field; gas worlds use latitude bands plus noise (`src/engine/noise.ts:23-91`, `src/engine/surface.ts:52-131`).
- Standard detailed terrain is a 150×104 UV sphere and high detail is 220×150. A surface-affecting change synchronously samples every vertex, updates position and color buffers, and recomputes normals on the main thread (`src/engine/viewport.ts:764-775`, `src/engine/viewport.ts:1905-1957`).
- Flat/orbit textures are 256×128 and cloud maps are 384×192. Their pixel loops run in a module worker and transfer the RGBA buffer back without copying (`src/engine/bake.ts:1-15`, `src/engine/bake.worker.ts:23-36`).
- Orbit view shares one 48×32 sphere geometry for all planets and bakes procedural appearance into textures. This is intentionally cheaper than displaced geometry and separate shells for many bodies (`src/engine/bake.ts:23-28`, `src/engine/viewport.ts:910-914`).
- Photographic maps can drive a 512×256 luminance-derived height field for detailed real planets; this work currently uses a browser canvas (`src/engine/heightfield.ts:17-79`).

## Invalidation, lifecycle, and performance constraints

- Surface invalidation is narrow: detail, seed, preset, mountains, water, roughness, and ice. Lighting, animation, clouds, labels, and other presentation state do not force vertex regeneration (`src/engine/viewport.ts:109-132`).
- Worker jobs are generation-tagged/latest-wins, stale results are ignored, and workers, textures, geometries, materials, observers, and listeners are explicitly disposed (`src/engine/viewport.ts:600-625`, `src/engine/viewport.ts:917-1025`).
- Rendering is capped near 30 fps for passive motion and stops while paused, hidden, or offscreen. The current measured real-GPU transition stall is 31–38 ms (`IMPLEMENTATION_PLAN.md:248-313`).
- Enforced budgets include a 256 KB gzip entry, 100 KB raw worker, ≤200 ms local interaction duration, ≤4 shader programs added during Orbit transition, and zero paused frames (`performance-budget.json:1-58`).
- Existing deterministic surface goldens detect sampled color/elevation drift, but they do not prove exact full-world artifacts. Any replacement must preserve v1 and add full map/geometry fixtures, or introduce an explicit generator version/migration (`src/engine/surface.test.ts:9-73`).

## Integration seams

1. Keep the synchronous, allocation-free `Surface.sample(direction)` path intact for generator v1. A graph-backed v2 is asynchronous and stateful, so it needs a separate worker-side compile pipeline rather than an implementation hidden behind the current interface.
2. Let a persistent worker retain canonical height/biome/hydrology data and transfer only final render artifacts, such as flat RGBA and detailed position/color/normal buffers. Transferring canonical arrays would detach the worker's cache.
3. Version the generator throughout world identity, sanitization, serialization, APIs, duplicate detection, worker messages, and cache keys before changing seeded geography.
4. Keep Orbit view on shared smooth geometry and baked textures; richer topology belongs only in the focused single-world view.

## Risks to investigate

- Main-thread detailed resampling and normal recomputation are the largest current integration concern.
- The existing worker is already about 91 KB raw against a 102.4 KB budget, so retaining v1 while adding v2 cannot fit by simple accumulation.
- The current worker is serial and ignores stale jobs only after they finish; a heavier compiler needs priorities and effective cancellation.
- UV-sphere pole density and seam behavior constrain render-mesh efficiency, extreme relief, and future close zoom. The current directional sampler is geographically seam-free, and v2 hydrology would run on its own spherical graph rather than on this render mesh.
- Full Mapgen4 drainage, coast refinement, and biome simulation may be too expensive and too planar to transplant directly onto a globe.
- Shader-heavy procedural planet demos can look excellent but may increase first-use program topology, duplicate the current CPU surface source of truth, and make deterministic testing harder.
