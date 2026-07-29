# Arc Worlds repository guidance

Follow the global agent instructions in addition to this file.

## Runtime and verification

- Use Bun for dependency, build, test, and script commands.
- This is a Vite application: use Vitest for unit tests and Playwright for browser tests.
- Before handing off an implementation, run `bun run typecheck`, `bun run lint`,
  and `bun run test`. Run relevant end-to-end tests for user-facing behavior.
- Do not push, merge, or deploy unless the user explicitly requests it.
- Keep `IMPLEMENTATION_PLAN.md` and `progress.txt` synchronized whenever scope
  or delivery status changes.

## Performance is an acceptance criterion

Treat performance as part of feature correctness, especially for changes to
`src/engine`, procedural generation, WebGL materials, the orbit transition,
continuous animation, or UI layered over the canvas.

Before implementing a feature, identify:

- what runs on the main thread and whether CPU-heavy work belongs in a worker;
- what invalidates geometry, textures, materials, or shader topology;
- whether rendering can stop while paused, hidden, or offscreen;
- which resources can be cached and reused rather than recreated;
- the expected bundle-size and interaction cost.

While implementing:

- Do not add unconditional `requestAnimationFrame` loops.
- Keep procedural pixel/noise loops in module workers and transfer large buffers.
- Keep interaction paths free of shader compilation and avoid setting
  `material.needsUpdate` for value-only changes.
- When shader warmup is unavoidable, compile the smallest active `Object3D`
  subtree. Three.js `compileAsync` traverses hidden descendants, so passing the
  whole scene can compile unrelated material variants.
- Build opt-in display layers such as canvas labels lazily. Hidden-by-default
  resources must not be rasterized, uploaded, or included in transition warmup.
- Reuse and explicitly dispose Three.js geometry, materials, textures, workers,
  observers, and event listeners.
- Preserve narrow invalidation keys: presentation-only edits must not trigger
  procedural rebakes.
- Cap resolution and rendering cadence according to the existing viewport policy.
- Avoid backdrop filters and other full-canvas compositor effects over live WebGL.

## Performance budgets and commands

`performance-budget.json` is the source of truth for enforceable budgets.

- `bun run size:check` checks the built entry bundle and worker sizes.
- `bun run perf:smoke` runs one local browser sample for fast iteration.
- `bun run perf:benchmark` records a three-run median in
  `.artifacts/performance/results.json`.
- `bun run perf:budget` checks the recorded median.
- `bun run perf:ci` builds and runs all absolute bundle/browser budgets.
- `bun run perf:engines` profiles the Orbit transition in WebKit and Chromium
  against a running preview, on real GPUs. Use it whenever a change could
  affect what a visitor feels: the long-task budgets are measured under
  headless Chromium's software rasteriser and are roughly ten times what real
  hardware does, and Safari cannot report long tasks at all.

Two budget profiles exist, selected automatically by the `CI` environment
variable (`--profile local|ci` overrides). The `browser` block is calibrated on
developer hardware; `browserCiOverrides` replaces the rows a two-core shared
GitHub runner cannot meet (`interactionDurationMs`, `taskDurationMs`) with
ceilings measured on that runner plus headroom. The 10% relative regression
check against the pull request base remains the tight guard on CI — the CI
overrides exist so the absolute check reports real regressions instead of
failing on hardware it was never calibrated for.

The regression check also carries per-metric noise floors
(`regression.noiseFloor`): a regression only counts when it exceeds the
percentage limit *and* the metric's measured run-to-run wobble in absolute
terms. Ten percent of a ~350 ms long-task total is 35 ms — below what a shared
runner reproduces between two runs of identical code. Rows over the percentage
but under the floor report "within noise floor" and pass.

For performance-sensitive changes, include before/after measurements from the
same machine and browser. A regression greater than 10% requires a fix or an
explicit, documented product tradeoff. Do not loosen a budget merely to make CI
pass; update it only with measured evidence and record the decision in
`PERFORMANCE_RESULTS.md`.

The browser benchmark window starts on the Orbit view button's `pointerdown`;
its long-task metrics describe the Orbit transition, not page startup. The
result also reports `arc:orbit:*` phase measures and the number of shader
programs introduced by that transition. Keep `orbitShaderProgramsAdded` at or
below four and shader kickoff below one 50 ms long-task boundary.

The Performance GitHub workflow enforces absolute budgets on every pull request,
push to `main`, nightly schedule, and manual run. Pull requests also benchmark
their base revision on the same runner and reject regressions over 10%.
