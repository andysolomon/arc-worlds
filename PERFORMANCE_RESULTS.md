# Performance results

Measured 2026-07-28 against:

- Baseline: revision `1755783` (the pre-optimization `main` build)
- Optimized: production deployment `dpl_E3Aj8PLaJfS61jsLj8rbdnZpS4YR`
- Workflow: create eight procedural worlds, enter Orbit view, run for six
  seconds, then measure active and paused rendering
- Browser: headless Chromium, 1440×900 viewport, DPR 2
- Samples: three alternating runs per build; values below are medians

## Native-speed A/B

| Metric | Baseline | Optimized | Change |
| --- | ---: | ---: | ---: |
| Orbit action completion + observable system frame | 1,996 ms | 592 ms | 70% faster |
| Event Timing interaction duration | 320 ms | 40 ms | 88% lower |
| Main-thread long tasks | 68 | 1 | 99% fewer |
| Total long-task time | 4,736 ms | 458 ms | 90% lower |
| Longest task | 601 ms | 458 ms | 24% lower |
| Main-thread task time | 8,046 ms | 1,787 ms | 78% lower |
| Script time | 308 ms | 96 ms | 69% lower |
| Sustained rendered frames | 19.0 fps | 23.3 fps | 23% higher |
| Frames rendered 1.5 s after Pause | 30 | 0 | eliminated |

The production run loaded `bake.worker-B96fjZqW.js`; the baseline had no worker.

## 4× CPU stress A/B

| Metric | Baseline | Optimized | Change |
| --- | ---: | ---: | ---: |
| Orbit action completion + observable system frame | 2,339 ms | 651 ms | 72% faster |
| Event Timing interaction duration | 376 ms | 152 ms | 60% lower |
| Main-thread long tasks | 86 | 2 | 98% fewer |
| Total long-task time | 6,115 ms | 541 ms | 91% lower |
| Main-thread task time | 8,383 ms | 2,270 ms | 73% lower |
| Script time | 856 ms | 148 ms | 83% lower |
| Sustained rendered frames | 18.0 fps | 23.3 fps | 29% higher |
| Frames rendered 1.5 s after Pause | 26 | 0 | eliminated |

## Steady-state active and paused work

Measured over separate three-second windows at native CPU speed:

| Metric | Baseline | Optimized | Change |
| --- | ---: | ---: | ---: |
| Active main-thread task time | 3,006 ms | 1,474 ms | 51% lower |
| Active rendered frames | 48 | 60 | 25% higher |
| Paused main-thread task time | 3,055 ms | 0 ms observed | eliminated |
| Paused rendered frames | 47 | 0 | eliminated |

## Interpretation and limits

The worker and render-suspension changes materially improved responsiveness and
idle energy use in a controlled A/B. The optimized build still produced one
458 ms long task during the six-second transition window in headless Chromium's
software-heavy graphics environment. A trace with task attribution is needed
before assigning that remaining task to a specific renderer operation, and the
strict “no task over 50 ms” target is not yet proven.

These results are directly comparable between the two builds, but not directly
comparable to the supplied Safari trace: browser, GPU, and machine differ. A
fresh Safari recording on the original hardware is still required to confirm
Safari CPU, compositor time, energy impact, INP, and p95 frame time.

The supplied Chrome profile reported 1,105 ms INP. The optimized controlled run
measured a 40 ms median Event Timing duration versus 320 ms for the controlled
baseline, but the 40 ms and 1,105 ms values should not be treated as a direct
before/after ratio because the environments differ.

## Regression guardrail calibration

The checked-in benchmark was calibrated locally on 2026-07-28 with three
headless Chromium runs at 1440×900 and DPR 2:

| Metric | Median | Enforced budget |
| --- | ---: | ---: |
| First custom-system frame | 476.7 ms | ≤ 1,000 ms |
| Event Timing interaction | 32 ms | ≤ 200 ms |
| Longest task | 420 ms | ≤ 500 ms |
| Total long-task time | 420 ms | ≤ 750 ms |
| Main-thread task time | 1,583 ms | ≤ 2,500 ms |
| Passive renderer | 23.3 fps | 20–32 fps |
| Paused frames over 3 seconds | 0 | 0 |
| Paused task time over 3 seconds | 0 ms | ≤ 25 ms |

The entry asset measured 234,202 bytes gzipped against a 256,000-byte budget;
the bake worker measured 90,901 raw bytes against a 102,400-byte budget.

Absolute budgets run on pull requests, `main`, nightly, and on demand. Pull
requests additionally benchmark the base revision on the same hosted runner and
fail when a comparable metric regresses by more than 10%. Hosted-runner results
remain an engineering guardrail rather than a substitute for Safari profiling
on the target hardware.

## Orbit transition shader attribution and reduction

Measured 2026-07-29 on the same Apple Silicon machine and headless Chromium
configuration as the checked-in benchmark. The observation window begins on
Orbit view `pointerdown`; these are transition metrics, not page-startup
metrics.

| Metric | Instrumented before | Scoped/lazy after | Change |
| --- | ---: | ---: | ---: |
| Shader programs introduced | 12 | 4 | 67% fewer |
| `buildBodies` | 2.4 ms | 0.8 ms | 67% lower |
| Hidden-label creation | 1.4 ms | 0 ms | eliminated |
| Synchronous shader kickoff | 3.7 ms | 1.7 ms | 54% lower |
| Shader-ready interval | 18.5 ms | 13.5 ms | 27% lower |
| Longest task, initial paired sequence | 207 ms | 186 ms | 10% lower |

The program reduction is structural: Three.js `compileAsync` calls `compile`,
which traverses hidden descendants when given the whole scene. Warming only the
visible system subtree excludes unrelated single-world materials. Default-off
labels are now created only when enabled, excluding their canvas rasterization,
texture upload, sprite material, and shader program from the default path.

The long-task duration is noisy enough that the initial 10% change is not yet a
reliable long-task win: a later hot-machine verification median was 436 ms even
with four programs. That run did provide useful attribution. In all three
samples the sole long task began within 0.2 ms of the first Orbit render, after
shader kickoff had returned and readiness had resolved. The measured
`renderer.render` call took 26–41 ms while the enclosing browser task lasted
256–437 ms, pointing at browser/driver work around first presentation rather
than body construction or label rasterization.

The benchmark artifact now includes those phase start times and durations so a
Safari run on the original Metal/ANGLE path can test the driver-compilation
hypothesis directly. The new absolute guards allow at most four
transition-added programs and at most 50 ms of synchronous shader kickoff.

## Safari re-profile on the target hardware

Measured 2026-07-29 on the Apple Silicon machine the original Safari trace came
from (M4 Pro), with `bun run perf:engines`. Three runs per engine, medians. The
same production build and the same Orbit transition in every case.

Long tasks could not be used. **WebKit has never implemented the Long Tasks
API** — `PerformanceObserver.supportedEntryTypes` offers `event`, `first-input`,
`largest-contentful-paint`, `mark`, `measure`, `navigation`, `paint` and
`resource`, and nothing else — so every long-task number this project has ever
recorded describes Chromium and only Chromium. The portable substitute is the
largest gap between animation frames: a task that blocks the main thread also
blocks `requestAnimationFrame`, whoever is drawing.

| Engine | Renderer | Largest stall | Frames > 50 ms | Shader-ready | First render |
| --- | --- | ---: | ---: | ---: | ---: |
| WebKit | Apple GPU | **31 ms** | 0 | 13 ms | 28 ms |
| Chromium, headed | ANGLE Metal, Apple M4 Pro | **38 ms** | 0 | 17.1 ms | 36.9 ms |
| Chromium, headless | SwiftShader (software) | **353 ms** | 3 | 15.7 ms | 38.4 ms |

All three drew an identical 55,920 triangles, so the scene being built is the
same in every column; only presentation differs.

### The finding

**On the hardware this app actually runs on, the long task does not exist.**
The largest gap between frames is 31–38 ms, which is the passive render cadence
the app deliberately targets — 30 fps is a frame every 33 ms. Nothing stalls, on
either Metal path, and no frame anywhere exceeds 50 ms.

The 353 ms stall is a property of **SwiftShader**, the software rasteriser that
headless Chromium falls back to when there is no GPU. That is the environment
every benchmark in this repository has run in, local and CI alike.

This overturns the hypothesis the earlier attribution pointed at. The reasoning
had been that a long task starting within 0.2 ms of first render, with
`renderer.render` measuring 26–41 ms inside a 256–437 ms browser task, implied
driver-side shader compilation on the Metal path. It is the reverse: the real
drivers compile fast enough to be invisible, and the software rasteriser is the
slow one. Shader readiness is 13–17 ms everywhere, including SwiftShader, so it
was never the cost either.

A cold-start check ruled out the remaining alternative. Run against a freshly
created browser profile with an empty GPU pipeline cache, Metal produced a 38 ms
stall and zero frames over 50 ms — indistinguishable from the warm case, so
there is no first-visit compilation penalty to find.

### What this means for the budgets

`longTaskMaxMs` and `longTaskTotalMs` measure a software rasteriser. They remain
useful as *relative* regression detectors, because every run compares like with
like on the same runner, and the CI profile plus per-metric noise floors already
treat them that way. They should not be read as anything a visitor experiences,
and the 600 ms ceiling in particular describes SwiftShader's first draw rather
than a user-facing budget.

The performance plan's original success criterion — "no procedural-bake task
over 50 ms on the browser main thread" — is met on real hardware, in both
engines, by a wide margin. It has probably been met for some time; the tooling
simply could not see it.

Remaining gap: this is WebKit driving Apple's GPU, not Safari itself. Safari
proper needs `safaridriver --enable`, which requires an administrator, and it
cannot run headless. Given WebKit and Chromium's Metal backend agree to within
7 ms, a Safari run is unlikely to disagree — but it is the one measurement still
outstanding.

## Terrain v2 prototype verification (2026-08-01)

Measured on the same machine before and after the hybrid terrain prototype.
The clean baseline was detached at `c783883`; the after build includes explicit
generator versioning, the separate v2 compiler worker, and viewport routing.
The controlled Orbit scenario remains the existing v1 Solar System, so this is
the regression check for retained behavior rather than a v2 throughput test.

| Metric | Clean baseline | Terrain v2 build | Interpretation |
| --- | ---: | ---: | --- |
| Entry gzip | 243,818 B | 245,540 B | +0.7%, below 256,000 B |
| Retained v1 worker raw | 92,993 B | 92,993 B | unchanged |
| New v2 worker raw | — | 24,746 B | separate lazy worker, below 102,400 B |
| First Orbit frame | 359 ms | 283.1 ms | improved |
| Event Timing interaction | 40 ms | 48 ms | +8 ms, below 80 ms noise floor |
| Longest task | 307 ms | 253 ms | improved |
| Total long-task time | 328 ms | 455 ms | +127 ms, below 150 ms noise floor |
| Main-thread task time | 1,409 ms | 1,635 ms | +226 ms, below 600 ms noise floor |
| Orbit shader programs | 3 | 3 | unchanged |
| Passive renderer | 23.3 fps | 23.3 fps | unchanged |
| Paused frames / task time | 0 / 0 ms | 0 / 0 ms | unchanged |

`bun run perf:budget` passed every absolute local budget. The v2 pure compiler
was also sampled directly in Bun: a 642-cell canonical model compiled in about
4.3 ms, a clouded 256x128 flat artifact in 21.3 ms, and standard detailed
position/color/normal buffers in 7.8 ms. These are directional phase-cost
checks, not browser throughput claims.

The intended three-run `perf:engines` medians show no real-GPU Orbit regression:

| Engine | Renderer | Largest stall | Frames > 50 ms |
| --- | --- | ---: | ---: |
| WebKit | Apple GPU | 31 ms | 0 |
| Chromium, headed | Apple GPU | 39 ms | 0 |
| Chromium, headless | software renderer | 510 ms | 40 |

The previous real-GPU record was 31 ms in WebKit and 38 ms in headed Chromium;
the one-millisecond difference is below a frame and within normal run noise.
The software-renderer row is intentionally governed by the controlled browser
benchmark and its checked noise floors, which passed. A dedicated worst-case
24-body v2 throughput/cancellation/memory scenario remains required before
raising canonical resolution or adding custom shader/normal topology.
