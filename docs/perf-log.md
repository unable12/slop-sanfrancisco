# Performance log

Measured with `node tools/dev/probe.mjs <url> <png> 120`: headless Chrome 154, real WebGPU backend (apple/metal-3),
1280×720, DPR 1, vsync and frame-rate limit off. Machine: M4 Pro, 48 GB.
FPS is the HUD reading sampled once a second for 5 s after `__NYC_APP.ready`. Heap is `performance.memory.usedJSHeapSize`.

Note: Chrome caches compiled shaders between runs (profiles are fresh, but the GPU driver cache is not). So `compile` and
`gpu` init times drop on repeat runs. Compare like with like.

| Date | Row | Ready (s) | FPS samples | Heap (MB) | Errors | Notes |
|---|---|---|---|---|---|---|
| 2026-10-22 | NYC baseline, `@dev` (planning) | 5.2–12.5 | 92–98 | 650–823 | 0 | From `docs/research.md` |
| 2026-10-22 | P1.2 NYC pinned (`bc7d0b3`) via `tools/serve.mjs` | 5.7 | 151, 147, 124, 131, 135 | 823 | 0 | Warm shader cache: compile 814 ms, gpu 65 ms |
| 2026-10-22 | P1.4 NYC pinned, `--bench street` | 5.6 | median 6.0 ms, p95 6.7 ms (167 fps) | 884 | 0 | First bench row. Heap in `--shots` mode accumulates across navigations in one tab (681 → 2322 MB over 3 shots): use single-page or bench mode for heap budgets |
