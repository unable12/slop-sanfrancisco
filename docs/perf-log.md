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
| 2026-10-22 | P3.2 core (4.03 × 5.35 km), all eager, before grade separation, `--bench street` | 5.0 | median 3.5 ms, p95 4.6 ms (286 fps) | 619 | 0 | Measure-first: within budget, so no streaming (PLAN.md P3-2). 15,735 buildings as 52,789 masses, 1,342 curb islands, 84 terrain tiles. `stats().gpuMB` (geometry + instance buffers, new) 178 MB |
| 2026-10-22 | P3.2, `--bench car` / `heli` / `hill` | 3.9–5.4 | 270 / 217 / 256 fps (p95 5.2 / 6.9 / 4.9 ms) | 492–771 | 0 | |
| 2026-10-22 | P3 gate, core with tunnels, bridges, freeway decks + highway traffic, `--bench street` | 5.2 | median 4.1 ms, p95 4.7 ms (244 fps) | 561 | 0 | Grade-separation build arrays released after meshing (they stayed alive in the floor lookups' scope: street bench heap 922 → 677 MB) |
| 2026-10-22 | P3 gate, `--bench car` | 5.2 | median 4.2 ms, p95 5.2 ms (238 fps) | 809 | 0 | |
| 2026-10-22 | P3 gate, `--bench heli` | 5.3 | median 4.9 ms, p95 7.2 ms (204 fps) | 566 | 0 | Still the slice loop; the core overview shot (`p3-heli-core`) runs at 143–152 fps |
| 2026-10-22 | P3 gate, `--bench hill` | 5.2 | median 4.8 ms, p95 5.8 ms (208 fps) | 552 | 0 | |
| 2026-10-22 | P3 gate, `--bench russian-hill-view` (new) | 5.2 | median 4.8 ms, p95 6.0 ms (208 fps) | 561 | 0 | A 360° turn on Russian Hill's summit (110 m), 8 m above the ground |
| 2026-10-22 | P4.1–P4.3 SF building types, paint, fronts, `--bench street` / `heli` | 5.2 | 196 / 161 fps | 591 / 837 | 0 | Paint-mode facades, 24k bay boxes, crowns |
| 2026-10-22 | P4.4 street furniture, `--bench street` | 5.2–5.8 | 164–204 fps over identical runs | 585–648 (live 556) | 0 | Probe gains `heapLiveMB` (forced GC): heap without a GC swings with garbage, and in `--shots` mode with the pages before (1.6 GB read, 550 MB live). Bench fps varies ±20% between identical runs on this machine |
| 2026-10-22 | P4.6 with street trees & transit, before the tree fix, `--bench street` / `car` / `heli` / `hill` / `russian-hill-view` | 5.5–6.2 | 111–128 / 159–161 / 147–159 / 114 / 112–114 fps; p95 10–14 / 24–26 / 25 / 10 / 10 ms | live 578–585 | 0 | A/B at Grant Ave (one page, hiding groups): all 142 fps, without trees 180, without the fronts' instanced details 145, without transit 142. Car bench without trees: 208 fps, p95 5.8 ms. The tree field re-sorted its 22,886 trees every 4 m of camera travel, re-uploading the instance buffers (JS ~1 ms; the spikes are GPU side) |
| 2026-10-22 | P4 gate, `--bench street` (two runs) | 5.5–5.6 | 161, 169 fps; median 5.9–6.2 ms, p95 6.6–7.4 ms | 615–753 (live 581–587) | 0 | Trees re-sorted every 10 m (or a fifth of the height above ground). 15,735 buildings, 22,886 street trees, 50 rail vehicles, 603 Muni stops, 13,731 parking meters |
| 2026-10-22 | P4 gate, `--bench car` | 5.4–5.5 | 152, 152 fps; p95 8.5–8.7 ms | 621–641 (live 582–584) | 0 | |
| 2026-10-22 | P4 gate, `--bench heli` | 5.5–5.9 | 137, 139 fps; p95 22.7–22.8 ms | 658–720 (live 580–582) | 0 | p95 from tree instance uploads in fast flight (handover risk) |
| 2026-10-22 | P4 gate, `--bench hill` | 5.2–5.5 | 123, 127 fps; p95 8.9–9.0 ms | 620–696 (live 579–580) | 0 | |
| 2026-10-22 | P4 gate, `--bench russian-hill-view` | 5.5–5.6 | 127, 127 fps; p95 8.9–9.6 ms | 661–688 (live 577–580) | 0 | |
