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
| 2026-10-22 | P1 gate, SF slice flat (no traffic/details), `--bench street` | 2.5 | median 2.4 ms, p95 3.1 ms (417 fps) | 97 | 0 | 3,602 buildings, 322 curb islands |
| 2026-10-22 | P1 gate, `--bench car` | 2.6 | median 2.7 ms, p95 3.4 ms (370 fps) | 108 | 0 | |
| 2026-10-22 | P1 gate, `--bench heli` | 2.5 | median 2.0 ms, p95 2.7 ms (500 fps) | 120 | 0 | |
| 2026-10-22 | P1 gate, `--bench hill` | 2.5 | median 2.6 ms, p95 3.5 ms (385 fps) | 108 | 0 | Flat world: "hill" is a turn on the spot at Nob Hill |
| 2026-10-22 | P2.2 terrain mesh, `--bench heli` | 3.0 | median 1.6 ms, p95 2.3 ms (625 fps) | 135 | 0 | 18 terrain tiles (≤ 40 draws) |
| 2026-10-22 | P2 gate, slice on terrain with traffic & details, `--bench street` | 3.3 | median 2.3 ms, p95 2.8 ms (435 fps) | 205 | 0 | 60 cars, 6 buses, 340 pedestrians; 3,602 buildings as 11,852 masses; 338 signal masts, 107 stop signs, 1,381 lamps |
| 2026-10-22 | P2 gate, `--bench car` | 3.4 | median 2.7 ms, p95 3.4 ms (370 fps) | 234 | 0 | |
| 2026-10-22 | P2 gate, `--bench heli` | 3.6 | median 2.8 ms, p95 3.6 ms (357 fps) | 243 | 0 | |
| 2026-10-22 | P2 gate, `--bench hill` | 3.7 | median 3.1 ms, p95 3.9 ms (323 fps) | 283 | 0 | A turn on the spot at Nob Hill, now 8 m above the real ground |
