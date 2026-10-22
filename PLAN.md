# Slop San Francisco: master plan (revision 2)

A playable WebGPU San Francisco (walk, drive, cycle, fly) built by adapting
[mrdoob/slop-newyork](https://github.com/mrdoob/slop-newyork) (MIT). This file is the entry point. It is written so that a
fresh Claude session can continue the build with no other context. **To run the build unattended, follow `docs/RUNBOOK.md`.**

| File | Read when |
|---|---|
| `docs/RUNBOOK.md` | Every session start: the loop, stop rules, budgets |
| `docs/research.md` | Facts verified before building (data, baseline, NYC engine line numbers). Trust these over memory |
| `docs/phases/phase-N-*.md` | Only the phase you are on |
| `docs/file-disposition.md` | Before touching an NYC file |
| `docs/data-sources.md` | Before fetching data |

Legend: ✅ verified (see `docs/research.md`), ❓ not verified (verify before relying on it), 🛑 hard stop (see RUNBOOK).

---------------------------------------------------------------------------------------------------------------------

## 1. Goal and scope

**Goal.** An open-in-a-browser SF sim in the spirit of Slop New York:
- real streets, real curbs, real hills and real building footprints and heights;
- recognisable landmarks, traffic obeying real signals and stop signs, pedestrians;
- four travel modes, a map with teleports;
- SF atmosphere: marine-layer fog, the bridges, the bay.

**Areas.**

| Name | Area | Detail |
|---|---|---|
| **Slice** | Nob Hill, Chinatown, Financial District to the Ferry Building and Embarcadero. Roughly 1.6 × 1.4 km; exact box fixed in P1 from data | Everything working end to end: the first thing built |
| **Core** | North-east quadrant: slice + North Beach, Telegraph Hill, Russian Hill (Lombard), Fisherman's Wharf, Union Square, SoMa to the ballpark, Civic Center | Full detail |
| **Region** | Rest of the city | Terrain, real footprints as cheap instanced buildings, parks, no traffic |
| **Horizon** | Golden Gate and Bay bridges, Marin Headlands, East Bay, islands | Set pieces and terrain rings |

**Non-goals** (unless the user adds them): interiors, multiplayer, live data, photo textures, enterable vehicles beyond the four modes.

**Success criteria (final gate).**
1. Loads from a static server in Chrome with WebGPU; zero console errors in the headless probe.
2. Drive from the Ferry Building up California St over Nob Hill and down to Russian Hill in traffic without clipping, flipping, floating or stalling.
3. Performance, measured by the headless probe at 1280×720 uncapped (NYC baseline 92–98 fps, heap 650–820 MB, ready in 5–12 s):
   - street path ≥ 75 fps median;
   - helicopter and hilltop views ≥ 60 fps median;
   - JS heap ≤ 1.2 GB;
   - ready in ≤ 25 s.
4. Every teleport lands on a real roadway (automated test). Every Tier 1 landmark is recognisable.
5. Attribution is correct (section 8). All tests pass.

---------------------------------------------------------------------------------------------------------------------

## 2. The NYC engine in one page (details and line numbers: `docs/research.md` §3)

**Structure.**
- No bundler. `index.html` has an import map to three.js on jsDelivr plus ordered IIFE scripts sharing `window.NYC`.
- All materials are procedural TSL; all geometry is built in code; there are no assets.
- One generated data file, `js/nyc-geodata.js`, made by Node tools in `tools/`.

**What helps us.**
- **Already terrain-ready:** highway traffic (true 3D lanes with slope pitch), PersonRig (per-foot `ground()` callback), scene culling (as long as geometry is baked at world y).
- **The road network is mostly generic.** About 200 of 1,223 lines are Manhattan grid; `centrelineStreets()` already turns a centreline graph into edges.
- **The facade instancing is reusable:** boxes with yaw, per-wall treatments, quadtree detail streaming.
- **Borough chunked instancing is reusable.**

**What does not carry over.**
- **Flat ground.** The road is one polygon at y = 0, curbs are extruded from 0 to 0.22, and constants appear in traffic, controllers, cameras, road paint and street details.
- **Absolute world y in shaders.** Facade floors and storefronts and the signal lenses are positioned in absolute y. They break on hills unless given a base y.
- **Colliders** have an absolute `maxY` and no `minY`. Car and cyclist query them at a constant y.
- **Signals** are derived from Manhattan avenue × street tables. Crosswalks exist only at signals and are axis-aligned.

**Existing support.**
- Debug hook `window.__NYC_APP` with `.ready`, `getFps`, renderer, scene and systems.
- Fog already exists (`FogExp2` plus a height-falloff aerial `fogNode`).
- 97 Node tests: run with `node --test tests/*.test.cjs tests/*.test.mjs`. The directory form fails on Node 26.

---------------------------------------------------------------------------------------------------------------------

## 3. Why SF is different, and what we use for each part

| # | SF trait | Data / approach | Phase |
|---|---|---|---|
| 1 | Hills (Nob Hill sample: 38–112 m within 1 km) | USGS 1 m lidar DEM (CA_SanFrancisco_B23) ✅ → CPU-baked terrain chunks; one height API | 2 |
| 2 | No single grid | DataSF centreline with node topology ✅ → graph path only | 1, 2 |
| 3 | Curb geometry | DataSF **Curbs and Islands** ✅ → polygonise into curb islands (no raster width guessing) | 1 |
| 4 | Real buildings | DataSF footprints, **177k with lidar heights and ground elevation, 100% filled** ✅ | 2, 4 |
| 5 | Signals and stop signs | DataSF Traffic Signals + Stop Signs keyed by node CNN ✅ | 2 |
| 6 | Sidewalk widths | DataSF Sidewalk Widths ✅ | 1 |
| 7 | Row-house vernacular | New generators + Land Use mix ✅ + Tall Building Inventory (facade material, storey heights) ✅ | 4 |
| 8 | Water, bridges, fog | Reuse water and bridge code; extend the existing fog | 5, 6 |
| 9 | Trees, Muni, bikes | Street Tree Inventory, Muni routes/stops, bike network ✅ | 4 |

---------------------------------------------------------------------------------------------------------------------

## 4. Design decisions (change only via the decision log, section 10)

**D1. Import the baseline.** First commit: the plan docs. Second commit: `slop-newyork@0049a49` without `tools/data/*.json` (16 MB of NYC raw data). Evolve in place.

**D2. Keep the internal namespace.** `window.NYC` and `window.__NYC_APP` stay as internal names. Only user-facing text changes.
- Why: renaming touches all 24 files and the tests that regex-extract source, for zero user value.
- Files whose names say "nyc" are renamed only where user-visible: `nyc-geodata.js` → `sf-geodata.js` (generated anyway), `nyc-map.js` → `sf-map.js` (P7).

**D3. Coordinate frame.**
- Local tangent plane (NYC's `geo-base.mjs` math), origin at the Market St & Montgomery St centreline node (resolved from the streets data), **no rotation**.
- x east, z south, y up, 1 unit = 1 m.
- **y = NAVD88 metres.** The water level is the DEM's hydro-flattened bay value, measured in P1, not assumed.

**D4. Terrain is a CPU-baked chunked mesh.**
- 64 m chunks at 2 m spacing in the core, coarser LODs (4/8/16 m) with skirts.
- Rejected: clipmaps or vertex-texture displacement, because `scene-culling.js` shadow proxies and bounding spheres need real vertex y, and CPU height queries are needed anyway.
- Roads are terrain regions shaded through a mask texture. Curb islands are draped slabs.

**D5. Height field.**
- 1 m DEM → 2 m core grid (block average) plus light smoothing (σ about 2 m), then quantised to uint16. No road "conforming" bake at first.
- P2 measures the residual bumpiness along street centrelines (15 m-window curvature). A conforming step is added only if a threshold is exceeded.
- Buildings use `gnd_min_m` from the footprint data for their base.

**D6. Curb islands come from the curb data.**
- Polygonise DataSF curb lines: snap ends, then close gaps ≤ 12 m (alley mouths become sidewalk).
- Fallback if polygonisation leaves holes: NYC's raster method (`geo-blocks.mjs`) with widths measured from centreline to curb.
- Sidewalk width comes from the Sidewalk Widths dataset; fallback 3.0 m.

**D7. Road graph comes from DataSF streets.**
- Use `f_node_cnn`/`t_node_cnn`, `oneway`, `classcode`, `layer`.
- Curb-to-curb width is measured from the curb polygons (perpendicular distance at link midpoints).
- Lanes: OSM `lanes` where present; else `floor((width - parking) / 3.2)` with parking by class. Record the source of each value.
- Intersection control from Traffic Signals (`type` SIGNAL) and Stop Signs (`cnn`, `st_facing`).

**D8. Buildings come from footprints.**
- Footprint → oriented-rectangle masses (rectangle cover, reusing NYC `lotRects`) → existing facade-box instancing with yaw.
- Base = `gnd_min_m`. Main roof (absolute) = `median_1st_m`, the median first-return elevation, which is robust to antennas.
- `peak_1st_m` above the roof by more than about 6 m marks a spire, tower top or rooftop structure, used for crown and detail decisions.
- `hgt_median_m` (median height above local ground) is a sanity check.
- **Facade shaders get a per-instance base y.**
- Landmarks override generated masses.

**D9. Binary data.**
- Vector data stays in `js/sf-geodata.js`.
- Large typed data goes to `data/*.bin` with a JSON header, loaded by `js/data-loader.js` before the build steps.
- Each committed file < 50 MB (GitHub warns at 50 MB and rejects at 100 MB).

**D10. Pin three.js** to `gh/mrdoob/three.js@bc7d0b3c3838d5da9495b5e603afd77ed3154d57` ✅ (boots NYC, WebGPU backend, 0 errors). Upgrade only deliberately, with the probe.

**D11. Offline tool dependencies.** Runtime stays dependency-free.
- `tools/package.json` (dev only) with `geotiff` for the DEM. Add `polygon-clipping` only if hand-written polygonisation fails.
- No GDAL, no Homebrew installs.

**D12. Data snapshots.** Raw downloads go to `data/raw/` (git-ignored) with `MANIFEST.json`: URL, retrieval date, bytes, sha256, license, row counts. DataSF refreshes daily; the manifest pins what we built from.

**D13. Determinism.** Seeded PRNGs only. The same raw data gives byte-identical outputs; a test hashes the outputs.

**D14. Verification.**
- **Primary: headless Chrome** via `tools/dev/probe.mjs` ✅. It reports backend, ready time, FPS, heap and console errors, and saves a screenshot. Extend it with named shots and benchmark paths.
- The in-app browser pane only when the user is watching: it renders nothing while hidden ✅.
- Add URL parameters `?cam=x,y,z,yaw,pitch&mode=&time=&hud=0&freeze=1&bench=`.

**D15. Vertical slice first.** Before scaling anything, the slice must work end to end: terrain, curbs, buildings on slopes, player in all four modes, traffic with signals and stop signs, pedestrians. This retires the integration risk early instead of discovering it in phase 4.

**D16. Autonomy.** The build runs unattended per `docs/RUNBOOK.md`. Visual reviews are asynchronous: screenshot galleries the user can look at later. There are only a few hard stops (section 7).

---------------------------------------------------------------------------------------------------------------------

## 5. Phases

| Phase | Title | Est. sessions* | Gate |
|---|---|---|---|
| 1 | Bootstrap and data pipeline (slice) | 2 | Tests green; flat SF slice boots from SF data; probe and harness work |
| 2 | **Vertical slice**: terrain, curbs, buildings v1, player, traffic, pedestrians | 6 | Slice drivable and walkable on real hills; signals and stops obeyed; budgets met; gallery `docs/review/p2/` |
| 3 | Scale to the core | 3 | Core area loads and streams within budgets; teleports test green |
| 4 | SF look: row houses, towers, street furniture, trees, transit details | 4 | Gallery `docs/review/p4/`; budgets met |
| 5 | Landmarks and bridges | 3 | Tier 1 landmarks present; gallery |
| 6 | Region, horizon, fog and atmosphere | 3 | Whole-city views within budget; fog states gallery |
| 7 | UI, map, polish, release prep | 2 | Final success criteria; acceptance report |

*A session is one long working block (several hours, heavy tool use). Total ≈ 23 sessions, plausible range 16–32. Revision 1
estimated 29: real curbs, signals, stop signs and heights remove most of the guessing, and the vertical slice cuts rework.

**Token use** (rough): 5–15M tokens processed per session, mostly cached context, so ≈ 120–350M for the whole build. The RUNBOOK
records actual usage per phase so this estimate gets replaced by measured numbers after phase 1.

Phases 4 and 5 could run as parallel sessions in separate worktrees after phase 3: they touch different files. This is
optional and only with the user's OK (RUNBOOK §6).

---------------------------------------------------------------------------------------------------------------------

## 6. Cross-cutting rules

**Performance.**
- Every gate runs the probe benches and appends to `docs/perf-log.md`. Budgets are in section 1.
- No per-frame allocation. Static geometry is baked at world y, merged by cell and frustum-culled. Big new shadow casters go through `scene-culling.js`.

**Tests.**
- Run with `node --test tests/*.test.cjs tests/*.test.mjs`.
- Keep the NYC style (`node:test` + `vm` + stubs).
- `geodata.test.mjs` is rewritten for SF in P1, because the NYC version builds from NYC raw data.
- A phase is not done with failing tests.

**Git.**
- Work on `main`; this repo is not `layers_app`, so no branch is needed.
- Commit per task, message `Pn.m: what`, with the harness's attribution line.
- **Never push, never create remotes, never publish.**
- `.gitignore`: `.DS_Store`, `data/raw/`, `node_modules/`, `tools/node_modules/`, `shots/`, `*.tmp.*`.

**Data honesty.** Never invent coordinates, heights, field names or landmark facts. A missing value is recorded as missing and gets an explicit, labelled fallback.

**Surgical edits.** Change what SF needs; keep NYC code style; do not reformat files you only touch lightly.

---------------------------------------------------------------------------------------------------------------------

## 7. Hard stops (🛑): the only reasons to stop and wait for the user

1. A dataset license turns out to forbid this use, or OSM ODbL obligations look unclear for the generated data.
2. Spend: a phase uses more than 1.5× its session estimate, or the projected total exceeds 40 sessions.
3. A gate fails twice after a fix attempt, and the fix would change a design decision that affects other phases.
4. Anything outward-facing: pushing, publishing, creating accounts, deploying.
5. Destructive actions outside this repo, or system installs (Homebrew and similar).

Everything else: decide, log the decision (section 10), continue. Visual reviews are galleries, not stops.

---------------------------------------------------------------------------------------------------------------------

## 8. Licensing and attribution

| Source | License | Required action |
|---|---|---|
| Code from slop-newyork | MIT | Keep `LICENSE`; add `NOTICE.md` ("Derived from slop-newyork by mrdoob, MIT") |
| DataSF datasets | PDDL (Land Use: CC0) ✅ | Attribution not required; credit "City and County of San Francisco / DataSF" anyway |
| USGS 3DEP DEM | US government work ❓ (confirm on the product page in P1) | Credit USGS |
| OpenStreetMap (landmarks, coast, piers, rail) | ODbL | "© OpenStreetMap contributors" in the HUD and README. `sf-geodata.js` contains OSM-derived geometry, which makes it a derived database: keep it under ODbL terms and say so in `NOTICE.md` (same as the NYC repo's practice) |

---------------------------------------------------------------------------------------------------------------------

## 9. Questions answered (so the build can run unattended)

| Question | Answer | Why |
|---|---|---|
| Detailed area? | Slice first (Nob Hill → Ferry Building), then the north-east quadrant core | Smallest area that has steep hills, flat downtown, waterfront, signals and stop signs |
| Real footprints or procedural? | Real footprints | 100% height coverage with ground elevation ✅ |
| Tool dependencies? | Yes, dev-only `tools/package.json` (`geotiff`); no system installs | No GDAL on the machine; Node is enough |
| Must-have SF features? | Golden Gate Bridge (visual), Bay Bridge (visual), Lombard St, cable cars on Powell and California (visual, rail-bound, P4), Transamerica, Salesforce Tower, Coit Tower, Ferry Building, fog | The postcard set; everything else is tiered |
| Hosting? | None for now; keep it GitHub Pages-compatible (static, files < 50 MB) | No publishing without the user (🛑 4) |
| Rename `window.NYC`? | No (D2) | Churn with no user value |
| Which three.js? | Pinned dev SHA (D10) | Verified working |
| How to verify visuals unattended? | Headless Chrome probe (D14) | Verified working; the in-app pane fails when hidden |

---------------------------------------------------------------------------------------------------------------------

## 10. Decision log

| ID | Date | Decision | Reason |
|---|---|---|---|
| D1–D16 | 2026-10-22 | Section 4 (revision 2) | Research in `docs/research.md` |
| R2-1 | 2026-10-22 | Revision 1 Phase 0 (spike) removed | Its questions were answered during planning (`docs/research.md`) |
| R2-2 | 2026-10-22 | Clipmap terrain → CPU chunks | Culling/shadow proxies need baked y |
| R2-3 | 2026-10-22 | Width-raster blocks → curb polygonisation | DataSF has curb lines |
| R2-4 | 2026-10-22 | Signal/stop heuristics → data | DataSF has both, keyed by node CNN |
| R2-5 | 2026-10-22 | Height fallbacks → not needed | 100% coverage |
| R2-6 | 2026-10-22 | No namespace rename | D2 |
| R2-7 | 2026-10-22 | Fog is an extension of the existing `fogNode`, not new | It already exists in `lighting.js` |
| R2-8 | 2026-10-22 | Sun lat/lon task removed | Time presets are hand-set, not computed |
| R2-9 | 2026-10-22 | Horizontal phases → vertical slice first | Integration risk |
| P1-1 | 2026-10-22 | `city-grid.js` is replaced by a new `js/sf-ground.js` (same return shape) instead of being modified in place; `buildings.js` NYC path likewise sits behind `FEATURES.buildings` while `js/sf-buildings.js` grows | The NYC ground and building builders are Manhattan through and through; a new module is smaller than gutting 3.5k and 2.6k lines. NYC helpers and materials are still reused |
| P1-2 | 2026-10-22 | `boroughs.js` removed from the script list now (not in P6) | It computes the five boroughs at load and crashes on empty tables; `region.js` replaces it in P6 |
| P1-3 | 2026-10-22 | Curb gaps: closed up to 9 m across any street that is not class 1–3 (many SF alleys are named "ST"); a chain may close on itself up to 60 m if only an alley lies across; park polygons without curbs become blocks; union fill | Measured on the slice: 98.6% of footprints inside blocks, 2.2% of curb length dropped |
| P1-4 | 2026-10-22 | DataSF `oneway` F = travel along the segment's drawing direction, T = against | 442 of 447 one-way links agree with OSM |
| P1-5 | 2026-10-22 | Water level = −1.07 m NAVD88 (mode of the hydro-flattened bay in the DEM) | Measured, not assumed (D3) |
| P1-6 | 2026-10-22 | Terrain is cross-checked against the footprints' own lidar ground: bias −0.04 m, median |error| 0.19 m, 91.6% within 1 m | Guards CRS/datum mistakes. A +1 m x shift improves it marginally (NAD83 vs WGS84 ~1 m); not applied |
| P1-7 | 2026-10-22 | OSM `lanes` and width-derived lanes clamped to [1, 8] | OSM counts both directions |
| P1-8 | 2026-10-22 | DataSF spatial filter: `intersects(geom, POLYGON)` instead of `within_box`; trees filtered by latitude/longitude (their point column is text) | `within_box` dropped long route lines |

---------------------------------------------------------------------------------------------------------------------

## 11. Progress log (update at the end of every session; RUNBOOK §4)

| Date | Tasks | Summary | Tests | Perf (probe) | Tokens | Notes |
|---|---|---|---|---|---|---|
| 2026-10-22 | plan r2 | Research done, plan revised, nothing built | NYC baseline 97/97 | NYC 92–98 fps | n/a | Ready for P1 |
| 2026-10-22 | P1.1–P1.13 | Phase 1 done in one session. NYC engine imported and pinned; harness (URL params, benches, batch shots); fetcher; frame; terrain baker; curb islands; road graph; land/piers/parks/landmarks; buildings binary; engine boots on the flat SF slice | 107/107 | street 417, car 370, heli 500, hill 385 fps; heap ≤ 120 MB; ready 2.5 s; 0 errors | Plan 5-hour window 6%, weekly 4% (planning + P1 together); context 64% of 1M | P1 estimate was 2 sessions, took ~1 |

- [x] P1 · [ ] P2 · [ ] P3 · [ ] P4 · [ ] P5 · [ ] P6 · [ ] P7
