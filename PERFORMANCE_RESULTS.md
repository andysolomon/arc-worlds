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
