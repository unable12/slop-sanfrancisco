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
| 2026-10-22 | P5 gate, `--bench street` (two runs) | 5.1–6.0 | 172, 172 fps; median 5.8 ms, p95 6.4–6.6 ms | 843–869 (live 689) | 0 | Landmarks (22 models, ~48k triangles, 65 draws), both bridges (~90k triangles, 12 draws), the interim region ground (~1M triangles in 2 km chunks, PLAN P5-1). A third pass in between ran ~20% slower on every bench (135 / 122 / 103 / 99 / 106 fps) while another shell loop ran; not counted |
| 2026-10-22 | P5 gate, `--bench car` | 6.2–6.3 | 154, 147 fps; p95 9.6–9.8 ms | 1,019–1,377 (live 690–691) | 0 | |
| 2026-10-22 | P5 gate, `--bench heli` | 6.3–6.5 | 145, 137 fps; p95 23.0–23.4 ms | 1,007–1,010 (live 688) | 0 | p95 still the tree uploads (P4 handover) |
| 2026-10-22 | P5 gate, `--bench hill` | 6.5–7.0 | 125, 127 fps; p95 8.9–9.6 ms | 771–804 (live 686–687) | 0 | |
| 2026-10-22 | P5 gate, `--bench russian-hill-view` | 6.2–6.6 | 116, 127 fps; p95 9.8–10.3 ms | 735–830 (live 687–691) | 0 | Looks over the region ground to Sutro Tower and the bridges |
| 2026-10-22 | P5, A/B `--query region=0` (no interim region ground) `hill` / `russian-hill-view` / `heli` | 5.6–6.3 | 94 / 87 / 102 fps | live 650–653 | 0 | Slower than with it: the run-to-run noise on this machine is larger than the region ground's cost, so no measurable cost. The region ground adds ~35 MB live heap |

## Phase 6 — 2026-10-22, implementation complete; fog-cost gate open

**Method change:** the headless Chrome probe repeatedly stalls at `renderer.init()` before scene construction
(22–27 MB heap, no JavaScript errors). Longer waits, foregrounding the page and alternate ANGLE selection did
not resolve it reliably. Results below use the in-app browser on the same machine. `?bench` forces a 1280×720
canvas, DPR 1; animation is refresh-capped around 120 fps. These are not directly comparable to older uncapped
headless results. No tests or data builds ran during the final quiet fog comparison.

| Path / preset | Median frame ms | p95 ms | FPS | Raw heap MB | Notes |
|---|---:|---:|---:|---:|---|
| street / haze | 8.3 | 8.9 | 120 | 972 | Final implementation; raw heap before collection |
| car / haze | 8.3 | 16.7 | 120 | 2,539 | Final implementation; raw heap before collection |
| heli / haze | 8.4 | 16.8 | 119 | 1,151 | Final implementation; raw heap before collection |
| hill / haze | 8.4 | 16.9 | 119 | 908 | Final implementation; raw heap before collection |
| russian-hill-view / haze | 8.4 | 16.7 | 119 | 2,101 | Final implementation; raw heap before collection |
| heli-city / clear | 8.3 | 16.7 | 120 | 2,287 | 855 MB after 20 s idle, full scene retained; before final seam/paint polish |
| heli-city / clear, final | 8.3 | 16.7 | 120 | 952 | Final geometry and shader; 874 MB after idle |
| twin-peaks-view / fog off | 8.3 | 9.3 | 120 | 1,652 | Final geometry; 817 MB after idle |
| twin-peaks-view / marine | 8.3 | 9.3 | 120 | 961 | Latest fog branch; GPU measurement below |

The post-benchmark idle read stops animation for 20 s and gives the browser an opportunity to collect garbage,
without releasing the scene. It is not a forced-GC measurement, but a used-heap reading below 1.2 GB is an upper
bound on retained JS heap. The initial raw 1.8–2.3 GB readings alone did not establish a live-memory failure.
The final Twin Peaks marine startup phases total about 5.1 s; no console errors or warnings were observed in
these final browser runs.

### Fog cost: not passed

`&gpuTiming=1` uses the pinned Three.js `trackTimestamp` / `resolveTimestampsAsync()` API and records the median
sum of GPU render-pass durations for each frame. This is a GPU query metric, not presentation FPS. The comparison
uses the same 20 s Twin Peaks path and midday preset; `?fog=off` removes the fog graph entirely.

| Version / run | Fog-off GPU median ms | Marine GPU median ms | Delta ms |
|---|---:|---:|---:|
| Initial marine colour sampled filtered sky environment | 17.564 | 19.268 | +1.704 |
| Diffuse marine colour, quiet final geometry comparison | 14.221 | 18.481 | +4.260 |
| Separate marine/aerial calculations, latest run | 14.221 | 16.843 | +2.622 |

An intermediate marine result was 15.466 ms; another baseline during other checks was 20.251 ms. Those illustrate
substantial run-to-run variation and are not used to claim a pass. Refresh-capped frame medians differed by 0 ms,
which is insufficient evidence for the <1 ms GPU-cost target. After the initial implementation and two shader
optimisations, the target remains unproven and the latest clean comparison exceeds it. The Phase 6 gate remains
open. Do not weaken the target or hide this result behind the 120 fps ceiling.

Raw browser log entries, including intermediate runs: `docs/review/p6/browser-benchmarks.json`.


### Fog optimisation — final depth composition (2026-10-23)

The earlier failures above are retained as history. Fog now uses the existing resolved scene depth in the
final colour graph and the half-resolution bloom prefilter, with no extra render target. The camera's inverse
projection includes reversed Z; sky depth zero gets only directional marine horizon haze. Clear/haze retain
the sky-matched aerial equations. Marine colour remains below the bloom threshold. Transparent effects
without depth writes use the opaque surface underneath, a screen-space approximation.

`?bench=twin-peaks-view&fog=marine&time=midday&gpuTiming=1&fogCompare=1&benchIdle=1` runs a
40-second paired comparison at 1280×720: eight five-second blocks in ABBAABBA order (A=fog off,
B=marine), discarding the first second of each block. Camera position and fog animation time are fixed;
traffic is frozen and sun/sky illumination stays identical. Only the fog composition uniform toggles.
No tests, builds, or other animated preview tabs run during the measurements. An optional `&cam=x,y,z,yaw,pitch`
selects a second viewpoint. Report the upper median of four signed adjacent-pair differences, keeping all
blocks, including negative differences and outliers. This measures the shader cost without separately
reloading/compiling a scene. GPU timer quantisation and clock variation remain; negative deltas indicate
noise, not proof that fog is free. The threshold is still <1 ms, not a refresh-rate comparison.

Pre-sky-fix exploratory paired runs are saved in `docs/review/p6/fog-paired-benchmarks.json` and are
superseded by final-shader results below.


| Final shader viewpoint | Four signed paired differences, ms | Upper median delta, ms | Result |
|---|---|---:|---|
| Twin Peaks, above layer | -0.459, -0.328, +0.328, +0.262 | **+0.262** | Pass |
| Golden Gate / Crissy, inside layer | -0.918, +0.655, +0.852, +3.932 | **+0.852** | Pass |
| Ocean Beach, dense coastal layer | -0.852, +1.901, -1.245, -0.655 | **-0.655** | Pass (within noise) |

The worst viewpoint's paired median is **0.852 ms**, below 1 ms. Individual blocks still vary by several
milliseconds; this is a median-cost acceptance result on this machine, not a guarantee that every frame or
other GPU stays below 1 ms. No pairs were discarded. All three views maintained 120 fps; Twin Peaks retained
817 MB after idle. Raw final-shader evidence: `docs/review/p6/fog-final-benchmarks.json`.

Regression validation: **160/160 tests**, including numerical quadrature of the production marine integral,
horizontal/zero-length rays, and reversed-depth reconstruction with camera rotation/translation. Six gallery
images were regenerated from the final shader; no console shader errors or warnings were observed.

### Final runtime regression pass — 2026-10-23

All seven paths rerun with the final fog shader, 1280×720, no concurrent tests or animated tabs.

| Path | Median ms | p95 ms | FPS | Raw heap MB | After idle MB |
|---|---:|---:|---:|---:|---:|
| street | 8.3 | 9.1 | 120 | 935 | 816 |
| car | 8.3 | 16.7 | 120 | 1105 | 819 |
| heli | 8.4 | 16.8 | 119 | 1071 | 820 |
| hill | 8.4 | 16.7 | 119 | 849 | 813 |
| russian-hill-view | 8.4 | 16.7 | 119 | 865 | 814 |
| heli-city | 8.3 | 16.7 | 120 | 906 | 855 |
| twin-peaks-view | 8.3 | 9.3 | 120 | 836 | — |

Core paths use light haze; city flight uses Clear; Twin Peaks uses Marine at midday. All meet the
frame-rate and heap budgets. No console errors or warnings. Raw evidence: `docs/review/p6/final-runtime-benchmarks.json`.
Phase 6 gate passed; Phase 7 is next.

## Phase 7 final pass — 2026-10-23

Same machine and IAB fallback used for Phase 6, fixed 1280×720, one animated page at a time, no concurrent tests.
The browser is refresh-capped at 120 Hz: these results prove the frame-rate floors, not an uncapped maximum.
Headless renderer initialization remained an established limitation from P6; no new headless result is claimed.
Raw chronological console evidence (including interrupted setup attempts): `docs/review/p7/browser-benchmarks.json`.

| Quality / path | Median ms | p95 ms | FPS | Raw heap MB | After idle MB |
|---|---:|---:|---:|---:|---:|
| High / street | 8.3 | 8.6 | 120 | 956 | 825 |
| High / car | 8.3 | 16.7 | 120 | 1101 | 839 |
| High / heli | 8.4 | 16.8 | 119 | 2281 | 837 |
| High / hill | 8.4 | 16.7 | 119 | 1687 | 820 |
| High / russian-hill-view | 8.4 | 16.7 | 119 | 1783 | 819 |
| High / heli-city, Clear | 8.3 | 16.7 | 120 | 937 | 863 |
| High / twin-peaks-view, Marine/midday | 8.3 | 9.4 | 120 | 869 | 827 |
| Low / heli-city, Clear | 8.3 | 9.3 | 120 | 745 | 709 |
| Medium / heli-city, Clear | 8.3 | 16.6 | 120 | 1492 | 862 |

The retained heap is below 1.2 GB in every run. The largest observed raw end-of-bench reading is **2,281 MB**;
this includes uncollected transient allocations and can include the previous navigation's world. It is not a measured
peak and must not be reported as below budget. As in P6, the retained-scene budget is checked after 20 seconds idle;
a strict peak-allocation budget would remain unproven. Startup phase totals are approximately 5–6 seconds, below 25 seconds.

Scene geometry/material-array GPU estimates are 379–383 MB. High/Medium report 38 textures; Low reports 34.
The estimate excludes render targets, shadow maps and node-owned textures and is not total GPU residency.
Draw-call/triangle counters read zero after the render pipeline's counter reset, so those counters are not useful evidence.
Low uses no SSR graph and no sun shadows; regional building/tree culling distances are reduced. All presets rendered
without console warnings/errors in the recorded runs. Phase 6's final fog shader and <1 ms paired-cost evidence remain
unchanged; these refresh-capped tests are not a replacement fog GPU-cost measurement.

## 2026-10-23 — Phase 8 checkpoint, no new GPU claim

Route planning in the actual WebGPU app checked the full city at 1.55 m clearance and selected a 2.153 km route.
Production car physics completes the static-world test against 62,650 colliders with no wall contacts; maximum
route-center deviation is 4.862 m at turns. Seeded live traffic completes in 516.6 simulated seconds, with three
low-speed traffic contacts: the reliability gate remains open. This is simulation evidence, not a rendered FPS bench.
The visible preview showed no console warnings/errors; hidden WebGPU initialization stalled and was closed.
Full-suite curb construction exceeded its existing 10 s budget once (11.764 s) while the live preview was running;
the unchanged test passed separately at 9.635 s. No performance threshold was relaxed. Final GPU/ride-overhead
benchmarks and subjective audio listening remain outstanding. Phase 7's numbers have not been relabeled as Phase 8 results.

## 2026-10-23 — Phase 8 final driving regression

The final 2.146 km route is Embarcadero → Washington → Sansome → California. The full regression suite
passes **182/182** in 207.0 seconds with serial test scheduling; no retries or relaxed thresholds in this run.
All three production-controller runs include live cars, buses, pedestrians, hills/signals and 62,650 static
colliders. Each completes pickup through passenger exit within the original 720-second limit, with zero
world contacts, traffic impacts and traffic overlaps. These results supersede the three-contact checkpoint.

| Seed | Simulated driving time | Max route-center deviation | Mean assisted-control CPU time per update |
|---|---:|---:|---:|
| 3 | 561.0 s | 4.268 m | 0.661 ms |
| 8 | 589.2 s | 4.549 m | 0.649 ms |
| 21 | 462.7 s | 4.590 m | 0.611 ms |

These CPU timings measure route control in the regression harness, not total frame or GPU time.
Static packaging and whitespace checks pass. Browser evidence is recorded in the Phase 8 gallery.
Phase 6 fog-cost measurements remain unchanged; no new fog/GPU-cost claim is made here.

Actual WebGPU browser acceptance: 463.494 driving seconds, maximum deviation 4.859 m, zero world contacts,
traffic impacts or overlaps. Normal traffic, High/midday, actual 984 × 853 preview. Sampled HUD readings
85–120 fps; no percentile or GPU-cost inference. No console warnings/errors. Full-map pause held progress
unchanged and resumed. Screenshots and console evidence: `docs/review/p8/`.
