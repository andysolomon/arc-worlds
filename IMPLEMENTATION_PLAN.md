# Performance implementation plan

## Goal

Keep Arc Worlds responsive while opening and manipulating procedural multi-world
systems, particularly in Safari on high-density displays.

## Success criteria

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

## Delivered

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

## Verification

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
