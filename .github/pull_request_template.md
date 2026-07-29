## What changed

<!-- Describe the user-visible outcome and the main implementation choices. -->

## Verification

- [ ] `bun run typecheck`
- [ ] `bun run lint`
- [ ] `bun run test`
- [ ] Relevant Playwright tests

## Performance

- [ ] I considered main-thread work, render scheduling, invalidation scope, GPU/resource reuse, and bundle impact.
- [ ] CPU-heavy procedural work stays off the main thread.
- [ ] This change does not introduce an unconditional animation loop or work while paused, hidden, or offscreen.
- [ ] New WebGL material/shader topology is warmed outside the interaction path.
- [ ] Geometry, materials, textures, observers, workers, and listeners are reused or disposed deliberately.
- [ ] `bun run size:check`
- [ ] `bun run perf:smoke` for renderer or interaction changes

Performance evidence or justified exception:

<!-- Link the Performance workflow artifact or explain why the change cannot affect performance. -->
