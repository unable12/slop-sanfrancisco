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

**Re-estimate after P2 (measured):** P1 took about one session against 2, P2 about one against 6. The engine carried over
better than planned and the data pipeline did the heavy lifting. Remaining: P3 1–2, P4 2–3, P5 1–2, P6 1–2, P7 1, so
about 6–10 sessions instead of 15. Still to come and less predictable: the core's bigger data (streaming, curb gaps in SoMa),
SF's look (P4) and the landmark models (P5).

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
- **Kamil commits; sessions never run git write commands** (since 2026-10-22, decision K1). Every 2–4 tasks, and at gates and handovers, sessions write ready-to-run, path-limited `git add … && git commit -m "…" -- …` commands into `docs/commits.md` and their reply. Subjects are lowercase in Kamil's style with the task ID in parentheses, with no Claude attribution (`docs/RUNBOOK.md` §8).
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
| P2-1 | 2026-10-22 | Terrain: 64 m LOD chunks are drawn per 512 m tile (one mesh per tile, rebuilt when a chunk in it changes level) | Accept criterion ≤ 40 terrain draws: 1,000 chunk meshes would be ~1,000 draws; the slice is 18 tiles |
| P2-2 | 2026-10-22 | Seawall = the terrain itself: vertices on the bay drop 4 m below the water, the land's edge becomes a steep face painted as stone by the ground mask (class 5). No separate OSM-coastline extrusion | The DEM's land/water edge is the coastline (P1 traced `land` from it); one surface, no seams |
| P2-3 | 2026-10-22 | Hills cast shadows through a static 8 m stand-in drawn back faces only (`shadowSide = BackSide`) on the shadow proxy layer | No self-shadow acne on sunlit slopes; lee slopes still shade what lies behind them |
| P2-4 | 2026-10-22 | D5 settled: no road conforming. Second difference along all 837 slice links (1 m samples, 5 m windows): p50 0.0005, p95 0.0072, max 0.17 m⁻¹ (threshold p95 > 0.04). Worst: Broadway (tunnel portal), Ecker, Reed, Joice | `docs/reports/road-smoothness-slice.md` |
| P2-5 | 2026-10-22 | Curb islands, curbs and lawns are merged per 512 m cell (not 128 m) | Draw calls: 128 m cells would be ~700 draws in the slice; 512 m gives about 40 (3 materials × visible cells). Drape: quadtree leaves 2–32 m, 5 cm tolerance incl. corner twist; 570k sidewalk triangles; 0.36 s in Chrome |
| P2-6 | 2026-10-22 | Masses are clipped out of the road corridor: the roadway the curbs define, within 6 m of a curb (`tools/road-corridor.mjs`); 388 masses pulled back, 200 dropped (under 1 m left). 46 footprints lie further out, where the 2016 curbs have gaps (SoMa, Transbay, north Embarcadero), and stay as they are | Raw footprints reach up to 6 m past the curb lines in 446 buildings (data mismatch, not the rect cover); the risk table's fallback |
| P2-7 | 2026-10-22 | Facade floors count from each mass's own lowest ground (`boxBase.x`); where its ground drops more than 0.6 m the drop is a solid plinth (`boxBase.y`) and the floors start above it. The canyon AO measures height above the terrain (half-float height texture) | A building's floor datum must be on its own ground, not the footprint's lowest point (stepped masses on hills) |
| P2-8 | 2026-10-22 | Player colliders are skipped only when the player is more than 3 m below the building's lowest ground (`minY`), not 0.5 m as P2.6.2 suggested | A road running a little below a building's terrace (common on the hills) must still stop the car; 3 m still lets tunnels (Broadway, Stockton) pass under buildings |
| P2-9 | 2026-10-22 | Player vehicles: a car or bike left without throttle below 1 m/s holds on the brake instead of rolling down the grade; the walker sticks to the ground on step-downs under 0.4 m (it was leaving the slope for a few frames walking downhill) | Feel; the P2.6 slope test (feet within 2 cm for 600 frames) |
| P2-10 | 2026-10-22 | Road network: the centreline graph is the only source (the Manhattan grid stages are gone); junctions merge under 8 m (not 14: the slice's 9–12 m links join distinct offset T-junctions, some stop-controlled); lanes from the data's lane count and width; a dead end (a street that stops, or leaves the data box) allows a U-turn; freeway, ramp and tunnel links are left out until they get decks and bores (P3+); the land test is the terrain's water level with a 1 m margin. Connectivity is measured over edges away from the data box's 60 m border band and wider than alleys (6 m): 95.2% of 726 | Streets cut by the box and dead-end alleys too narrow to turn in can't join a strongly connected network |
| P2-11 | 2026-10-22 | Traffic on hills: a vehicle's body sits at the road height under its middle (not the mean of its axles, as P2.8.2 put it); wheels at their own axle heights, pitch from the axles. Uphill gravity never takes a driver below 0.3 m/s² of free acceleration; curves are driven at 2.5 m/s at least; a U-turn's curve keeps to the slope between its ends | The axle mean sank bodies into crests (up to 37 cm on a dead end's steep bank); buses (IDM a = 1.1) stalled on grades over 14%; kinked curves at oblique junctions held cars to 0.3 m/s; opposite end grades put a hump in U-turns |
| K1 | 2026-10-22 | Sessions stop committing. Every 2–4 tasks they write ready-to-run, path-limited commit commands (Kamil's lowercase style, task ID in parentheses, no Claude attribution) to `docs/commits.md`; Kamil runs them. History up to P2.3 was regrouped by Kamil (the Phase 1 work is now 5 commits) | Kamil's request: he creates every commit himself |
| P3-1 | 2026-10-22 | The core box is the union of the street extents (DataSF `analysis_neighborhood`) of Russian Hill, Nob Hill, Chinatown, Financial District/South Beach, North Beach, Tenderloin and South of Market, plus 300 m: 4.03 × 5.35 km. The game and the tests run on whichever box `js/sf-geodata.js` was built for; the slice's binaries are dropped. Three test bounds calibrated on the slice are restated for the core's real ground: terrain max grade < 10 (the Telegraph Hill quarry face north of Coit Tower is ~9.7 m over one 2 m cell) plus a real spike check (no cell over 2 m above or below all four neighbours: worst 1.2 m); max slope difference < 0.6 (0.48 on that face); the drape's worst-centroid check skips height cells creased more than its tolerance or crossed by the waterline (seawall tops), where 2 m leaves can't follow the ground | The P1/P2 bounds encoded the slice's gentler ground, not an engine limit; the medians and p99s are unchanged |
| P3-2 | 2026-10-22 | No streaming: everything loads eagerly | Measured first (P3.2.1): ready 3.9–5.4 s, 217–286 fps, heap ≤ 771 MB with all of the core loaded; budgets ≤ 25 s, ≥ 60/75 fps, ≤ 1.2 GB |
| P3-3 | 2026-10-22 | Grade separation (`js/grade-separation.js`, `road-network.js` `spans()`). Tunnels: the bore is the stretch whose ground stands > 3 m over the line between the link's ends, portals set back to where the ground is within 1 m of it; the road runs straight between the portals' ground; the hill isn't cut, only the terrain mesh dips where its surface comes into the 5.2 m bore; a floor and roof lookup (`floorAt`, `roofAt`, by the entity's height) lets the player and cameras use it. Street bridges: links crossing the DEM's water (carried on across wet nodes) get a straight deck between banks 8 m back from the water. Freeways: visual decks on columns plus highway traffic on the main lines; deck height `DECK_H_ESTIMATE` = 8 / 15 / 22 m over the ground for OSM `layer` 1 / 2 / 3 (bridge=yes), eased to ≤ 5% | 3DEP has no DSM over SF (only IFSAR DSMs, Alaska), and the lidar point cloud would mean GBs of LAZ; the bare-earth DEM has no bridges (Mission Creek's 3rd and 4th St bridges are water in it) |
| P3-4 | 2026-10-22 | Road network rules for the core: where a curb or median closes every lane of a street (not a one-way street's single centred lane: a plaza), its lanes slide across together up to 2.4 m; at a bend within one street (a shape node) the curve skips the curb test; turns up to ~143° are allowed (was 120°: Market St's diagonal, Columbus Ave); a straight-through curve needs 0.4 m from curbs (was 0.8: Columbus Ave at Greenwich St). Connectivity on the core: 95.4% of 4,642 counted edges | On HEAD's rules the core measured 93.0% (slice 95.2%): divided roads (the Embarcadero), hairpins (Telegraph Hill Blvd) and acute corners dropped whole streets |
| P3-5 | 2026-10-22 | Steep streets: stretches steeper than 40% over 15 m are not driven by traffic (the player can drive them): Kearny 76%, Greenwich 59%, Montgomery 59%, Macondray Ln 51%, Joice 43%, Bryant 41%, Larkin 40% (stairs and terraces on Telegraph and Russian Hill; Bryant's is a bump the DEM keeps under the Bay Bridge approach). Driven from 25% to 40%: Child St 38%, Dunnes Aly 35%, Duboce Ave 34%, Filbert St 32%, Broadway 31%, Francisco St 31%, Kearny St 30%, Romolo Pl 29%, Jones St 29%, Reed St 27%, Black Pl 27% | SF's steepest drivable streets are ~31%; vehicles don't stall on the rest (P2-11's 0.3 m/s² floor; the traffic sim's no-stuck check) |
| P3-6 | 2026-10-22 | Lombard St's crooked block is flagged in the pipeline by its cross streets (Hyde, Montclair Ter, Leavenworth): curves kept to 0.25 m, a station at each hairpin (≥ 8 m apart), 8 km/h, one-way as the data says, no pedestrians on its sidewalks (stairs). Surface rail (OSM tram & light rail, not in tunnels) is `GEO.rail`: a track bed and two rails painted along it; median islands it runs along for ≥ 20 m are rail medians, not walked | P3.4; trams come in P4 |
| P3-7 | 2026-10-22 | Teleports: the street junction (two or more drivable links, private ones counted: Don Chee Way) nearest an OSM landmark's centroid, facing it; Lombard's at the top of the crooked block (where its one-way traffic enters, Hyde St). The landmarks query now ends `out geom` and takes named attraction, historic and neighbourhood points | `out geom tags` (tags verbosity) dropped relations' members, so multipolygon buildings (City Hall, Oracle Park) had no footprint since P1; the Chinatown gate and Fisherman's Wharf are points |
| P4-1 | 2026-10-22 | Building classes (`tools/building-rules.json`, P4.1) depart from the phase file's starting table: civic = DataSF Land Use `cie` (cultural, institutional, educational) or `med` dominant, or inside a named OSM civic footprint; `visitor` (hotels) and `mips` (offices) count towards office-low, not civic; residential floor area, absent from the data, is estimated as `resunits` × 900 sq ft; front width is the widest facing (footprints break a front at its bay windows); a garage needs a ground drop of 0.6 m along the front (terrain), not across the lot; era comes from the Tall Building Inventory's completion date where joined (133) and otherwise from the type (a rule, reported apart). The P5 Tier 1/2 footprints are typed `landmark` | `cie` is not commercial floor space; with `visitor` as civic every hotel downtown got a colonnade. The lot-wide ground range made 87% of row houses garaged |
| P4-2 | 2026-10-22 | SF paint is per instance: the three masonry facade materials become paint-mode ones (`paintWall` rgb + surface: brick, stucco, wood siding, stone/concrete panels; `paintTrim` rgb + lit-window share), so six facade materials as in NYC; `boxBase` grows to vec3 with a per-box storey height (0 = the material's). Row-house fronts (bays, garages, stoops, gables), warehouse doors and docks, civic colonnades and spires are 4 instanced meshes | No draw-call growth (phase rule); storey heights from the inventory need a per-box value |
| P4-3 | 2026-10-22 | Towers: the podium/tower split uses the inventory's plan sizes (tower plan under 3/4 of the base plan), with the podium 4 storeys high (an estimate, capped at 40% of the height: the inventory has no podium height); crowns come from the lidar peak over the main roof: ≤ 12 m a penthouse, ≤ 45 m a setback block, higher a setback and a spire (the lidar can't tell a spire from a mast). Until P5 replaces them, landmarks get the same crowns (City Hall's dome and the Ferry Building's tower read as spires) | No other source for podium heights; the peak return is in the data (D8) |
| P4-4 | 2026-10-22 | Street furniture data: trolley wires on OSM `trolley_wire=yes` streets, drawn as 1-pixel lines over each way's curb lane (median lane offset along the way), span wires to poles every 32 m; Muni stops and shelters from DataSF (`shelter` = 1, where the sidewalk holds 3.6 × 1.5 m); parking meters on the links of the Financial District/South Beach, SoMa, the Tenderloin and Chinatown; bike lanes from the Bike Network class II (outside a 2.4 m parking lane where it fits) and IV (at the curb), one-way ones on the right of their compass `dir`. No NYC street furniture is built in SF mode | Cylinder wires vanished beyond ~30 m and looked like cables up close |
| P4-5 | 2026-10-22 | Street trees: five looks from `tools/tree-classes.json` (plane, ficus, palm, conifer, broadleaf; fine-leaved broadleaf on the locust builder), three new recipes in `trees.js` (palms grow frond cards along their limbs). A tree off the curb islands is moved onto one within 2 m (3,693), further off it is left out (5,032 = 18%, mostly where the 2016 curbs have gaps); size from `mapdbh`, else the middle of `dbhrange` | The inventory's points and the curbs disagree by about a metre at the curb line |
| P4-6 | 2026-10-22 | Transit runs from OSM route relations (`tools/queries/rail.overpassql` now ends `out geom`, the P3-7 fix: `out geom tags` dropped the members; the ways themselves are unchanged): one run per direction, surface only, stops as distances along it; vehicles are bound to their run with their own speed logic (not the bus logic of `traffic.js`), restart at the run's start; cars and pedestrians don't see them yet. Liveries: `docs/landmarks/muni.md` (SFPD's not verified). Robotaxis 1 in 7, police 1 in 20, vans added | The relations carry route order and stops; a separate rail model is far simpler than teaching traffic.js fixed paths |
| P4-7 | 2026-10-22 | Heap budgets are read after a forced GC (`heapLiveMB`, new in the probe); bench fps on this machine varies by up to ±20% between identical runs, so the gate reports two runs per bench. The tree field re-sorts its levels every 10 m of camera travel (was 4 m), or a fifth of the height above the ground | `usedJSHeapSize` without GC swings 550–1,800 MB with garbage (and across shots in one tab). With 22,886 street trees every re-sort re-uploads the instance buffers: car bench p95 24–26 → 8.5 ms |
| P5-1 | 2026-10-22 | Interim region ground outside the core: the DEM's 8 m overview sampled at 16 m over the `landmarks` box (`data/terrain-region.bin`, 2.6 MB), drawn as 2 km chunks by `sf-ground.js` and read by `Terrain.heightAt` outside the core's data (a patch); a 4 m patch over Alcatraz; ground at or under 0 m NAVD88 is water (the bay is hydro-flattened at -1.07 m in the core but -0.4 m round Alcatraz). The street network is built with the patches off (`Terrain.patchesEnabled`), so it stays on the core's terrain. Phase 6's region terrain replaces it. The x54 DEM tiles (289 MB) were fetched now (P6.1 needs them) | Tier 1 includes Sutro Tower (254 m summit), the Palace of Fine Arts and the Golden Gate, all outside the core: per-site DEM aprons stood as cliff-sided mesas in the bay (tried, dropped) |
| P5-2 | 2026-10-22 | Landmarks from OSM where OSM draws them in 3D (`building:part`s: Sutro Tower, the Golden Gate's towers, City Hall, the Ferry Building's tower, Coit Tower, the Palace of Fine Arts, Grace Cathedral, de Young), extruded as drawn with their roof shapes; hand models from sourced dimensions where OSM's parts are crude (Transamerica's steps, Salesforce Tower's wedges); every site's base is the lowest 1 m DEM ground under its outline. Models are in metres: `fitToSite` places (centre, base, yaw from the outline) and never scales (NYC's scaled to fit) | Data before estimates; the named query over a `landmarks` box (`tools/queries/landmarks-named.overpassql`) reaches past the core |
| P5-3 | 2026-10-22 | Generated building masses typed `landmark` are left out only under a modelled outline that covers them (`window.NYC.landmarkCovers`); Ghirardelli Square, the Palace and the others marked `cover: false` keep or add to what is there | A model replaces the masses only where it stands |
| P5-4 | 2026-10-22 | The Bay Bridge is driven by the highway traffic: the I-80 link's deck follows the bridge's decks (`sf-bridges.js bridgeDeckAt`: upper westbound, lower eastbound), the land approach climbs to it at 4.5% (estimate), no columns or slab under it on the bridge. The Golden Gate is visual only. The east span is today's self-anchored suspension span (the phase file's cantilever was demolished in 2014-2017) | The DataSF graph already carried I-80 to Yerba Buena Island at the P3 estimate heights (8-22 m) |
| P5-5 | 2026-10-22 | Bridge detail (suspenders, truss verticals and diagonals, deck lamps) is hidden beyond 3 km of the bridge (`update(camera)`); towers, cables, chords and decks always draw | The phase file's far LOD |
| P5-6 | 2026-10-22 | Tier 2: Pier 39 skipped (no heights in OSM or the sources; the pier is in the core's piers); Embarcadero Center and 555 California stay the generated towers; the painted staircases skipped. The Powell & Market turntable (a phase-file set piece; Tier 3 lists it too) is a static platform: cars turning on it are not done. Lombard Street's beds and stairs are estimates (the sources only mention them) | Visible value per hour (phase file); no invented facts |
| P6-1 | 2026-10-22 | City terrain uses 8 m SF lidar overviews in 1 km tiles; horizon uses the pinned USGS 1/3 arc-second n38w123 20250826 DEM at 32 m in 4 km tiles. Directed OSM coastlines classify sea; water is normalized to the core datum | National DEM tidal samples can be +0.6 m; a height-only cutoff incorrectly fills the bay |
| P6-2 | 2026-10-22 | Real footprint minimum rectangles, split concave footprints, 1,200 m instancing cells, 8.5 km building visibility, cached 8/16/32 m terrain LOD; 50 m dither between core and regional terrain | Reuse the borough facade/chunk machinery without procedural city geography or rebuilding the same terrain on every flight |
| P6-3 | 2026-10-22 | Marine layer uses an analytic smooth-density ray integral, advected sine variation and diffuse fog colour; clear/haze retain the original sky-matched aerial fog. No volumetric marching | The first environment-filtered marine colour exceeded the 1 ms target; the diffuse branch avoids that texture lookup |
| P6-4 | 2026-10-22 | Headless Chrome stalls in renderer initialization; use the in-app browser with fixed 1280×720 benches, optional GPU timestamps and a 20 s post-bench idle memory read while retaining the entire scene | Refresh-capped FPS alone cannot establish fog cost; uncollected heaps include previous-page garbage. Record the changed measurement method explicitly |
| P6-5 | 2026-10-23 | Compose the existing aerial/analytic marine equations from resolved reversed-Z depth in the final colour graph and bloom prefilter. Add marine horizon haze only to sky pixels. Use same-page ABBA GPU comparisons, with fixed camera and atmosphere, instead of separate-page timings | User requested the fog performance fix and completion of Phase 6. This removes per-material fog/overdraw without a new render target or ray marching; transparent effects inherit the underlying opaque depth |


### Phase 7 decisions (2026-10-23)

- **P7-1:** Low disables sun shadows instead of requesting one cascade. The pinned Three.js `SunLightShadow` hardcodes two cascades in its implementation and shaders; there is no supported count setter. Low also removes SSR from the postprocessing graph, rather than setting its visible intensity to zero while still running it.
- **P7-2:** Official DataSF neighborhood polygons replace nearest-street neighborhood guesses. Western destinations and map arrivals outside the core switch to helicopter; regional scenery remains outside the ground-driving scope agreed in Phase 6.
- **P7-3:** The inherited map’s right-angle “GPS route” was not road routing. It is now a direct waypoint bearing and labelled accordingly. Map input traps focus and blocks driving keys; native settings dialog pauses simulation.
- **P7-4:** Local release tagging belongs to Kamil under RUNBOOK §8. The final acceptance gate remains open for visual/driving review; no tag, commit, push or deployment is performed by the agent.


---------------------------------------------------------------------------------------------------------------------

**P9-1 (2026-10-23):** Use exact shared car/outline geometry, a 2 mm contact tolerance and bounded movement substeps; retain tangent velocity. This removes empty-corner/slanted-facade false hits without making walls passable. Trees and pedestrian reactions follow separately.

## 11. Progress log (update at the end of every session; RUNBOOK §4)

| Date | Tasks | Summary | Tests | Perf (probe) | Tokens | Notes |
|---|---|---|---|---|---|---|
| 2026-10-22 | plan r2 | Research done, plan revised, nothing built | NYC baseline 97/97 | NYC 92–98 fps | n/a | Ready for P1 |
| 2026-10-22 | P1.1–P1.13 | Phase 1 done in one session. NYC engine imported and pinned; harness (URL params, benches, batch shots); fetcher; frame; terrain baker; curb islands; road graph; land/piers/parks/landmarks; buildings binary; engine boots on the flat SF slice | 107/107 | street 417, car 370, heli 500, hill 385 fps; heap ≤ 120 MB; ready 2.5 s; 0 errors | Plan 5-hour window 6%, weekly 4% (planning + P1 together); context 64% of 1M | P1 estimate was 2 sessions, took ~1 |
| 2026-10-22 | P2.0–P2.12 | Phase 2 done in one session (gate passed). Terrain mesh + ground mask, draped curb islands, buildings v1 on slopes (rect covers, floors from each mass's ground), player/cameras on terrain, road network from the centreline graph with height profiles and real control, traffic and pedestrians on hills (stop-sign protocol, per-junction signal offsets, crosswalks at signals and stops), signal masts/stop signs/lamps/hydrants, draped road paint; `city-grid.js` dropped. P2.4–P2.6 were committed by the session before it saw K1; P2.7–P2.12 wait as one command in `docs/commits.md` | 126/126 | street 435, car 370, heli 357, hill 323 fps; heap ≤ 283 MB; ready ≤ 3.7 s; 0 errors | 5-hour window 12%, weekly 5% (account-wide); context 75% of 1M | P2 estimate was 6 sessions, took ~1.3 hours |
| 2026-10-22 | P3.1–P3.6 | Phase 3 done in one session (gate passed). Core box 4.03 × 5.35 km from data, fetched (two DEM tiles) and built; tests box-agnostic; no streaming needed (measured); tunnels (Stockton, Broadway) driven by traffic and the player, Mission Creek bridges, freeway decks with highway traffic; road-network rules for the core (95.4% connected); Lombard's crooked block, steep-street rule, rail medians; ten landmark teleports; `russian-hill-view` bench; gallery `docs/review/p3/`. P3.1–P3.5 wait as one command in `docs/commits.md`, the gate batch after it | 130/130 | street 244, car 238, heli 204, hill 208, russian-hill-view 208 fps; heap ≤ 809 MB; ready ≤ 5.3 s; 0 errors | 5-hour window 5%, weekly 7% (account-wide); context 61% of 1M | P3 estimate was 3 sessions (re-estimated 1–2), took ~1 |
| 2026-10-22 | P4.1–P4.7 | Phase 4 done in one session (gate passed). Building types from Land Use and the Tall Building Inventory (rule table, report, type map); painted row houses and flats with bay windows, garages, stoops and gables; warehouses, towers with podiums and crowns, civic colonnades; Muni stops and shelters, trolley wires, bike lanes, parking meters; 22,886 street trees in five looks; F-line streetcars, Muni Metro and cable cars on the OSM route runs; SF fleet (vans, black-and-white cruisers, white plates, silver-and-red Muni). Gallery `docs/review/p4/`. Everything waits as one command in `docs/commits.md` | 136/136 | street 161–169, car 152, heli 137–139 (p95 22.8 ms), hill 123–127, russian-hill-view 127 fps; live heap ≤ 587 MB; ready ≤ 5.9 s; 0 errors | unknown | P4 estimate was 4 sessions (re-estimated 2–3), took ~1. Frame time up ~50% (street trees) |
| 2026-10-22 | P5.1–P5.6 | Phase 5 done in one session (gate passed). Named landmark query over a new `landmarks` box, 22 sites with DEM ground and OSM 3D parts, `GEO.bridges`; interim 16 m region ground outside the core (P5-1); the Golden Gate and the Bay Bridge (`js/sf-bridges.js`, the I-80 traffic on the Bay Bridge's decks); Tier 1 (Transamerica, Salesforce Tower, Ferry Building, Coit Tower, City Hall, Sutro Tower, Palace of Fine Arts, Oracle Park) and most of Tier 2 in `js/landmarks.js` (NYC content replaced); Lombard's paving, beds and stairs; the Powell & Market turntable. Gallery `docs/review/p5/`, notes `docs/landmarks/`. Everything waits as one command in `docs/commits.md` | 144/144 | street 172, car 147–154, heli 137–145 (p95 23 ms), hill 125–127, russian-hill-view 116–127 fps; live heap ≤ 691 MB; ready ≤ 7.0 s; 0 errors | unknown | P5 estimate was 3 sessions (re-estimated 1–2), took ~1 |
| 2026-10-22 | P6.1–P6.4 implementation; P6.5 open | Real city and horizon terrain, 161,645 regional building boxes, trees, land cover, mapped road paint, 50 m core fade, marine presets, ferries/cargo and night water/bridge lighting; region replaces boroughs. Gallery saved. Fog-cost gate remains open after two optimisations | 157/157 | IAB 1280×720: whole-city 120 fps; idle heap 817–874 MB in recorded checks; startup ~5.1 s; no errors. Latest fog GPU delta +2.622 ms, fails <1 ms target | unknown | Headless renderer initialization stalled; fallback method and failed target documented; no Phase 7 work |
| 2026-10-23 | P6.3 performance and P6.5 gate | Depth-composited fog, reversed-Z sky handling, numerical fog/depth regression tests; final six-image gallery refreshed. Phase 6 complete; Phase 7 not started | 160/160 | Worst paired-median fog delta +0.852 ms (<1 ms); city flight 120 fps, idle heap 855 MB; no shader errors | unknown | All ABBA blocks retained, including noise/outliers. Full evidence in docs/perf-log.md; one pending commit batch |

| 2026-10-23 | P7.1–P7.8 implementation; P7.9 review open | SF terrain map, official neighborhoods and flight destinations; pause/settings, quality presets, WebGPU recovery; tests, attribution, architecture and local package | 171/171; final UI checks 20/20 | All seven High paths 119–120 fps; Low/Medium city 120 fps; idle heap 709–863 MB; startup 5.183–5.972 s; no observed console errors | unknown | Final visual/driving acceptance and local tag belong to Kamil; no Git writes or publication |

- [x] P1 · [x] P2 · [x] P3 · [x] P4 · [x] P5 · [x] P6 · [ ] P7 (implementation ready; acceptance/tag open)

| 2026-10-23 | P8 checkpoint: route/ride/audio implementation; reliability gate open | Featured Ferry Building → Nob Hill trip, pickup/drop-off state machine, actual map route, manual takeover/recovery, shared four-mode procedural audio and responsive controls | Expanded suite 176/177 initially; unchanged timing failure passed on retry; final affected-area 68/68 including new full-city test (178 unique tests) | Zero wall contacts across 62,650 colliders; live-traffic completion 516.6 s with 3 contacts; no new GPU claim | unknown | P8.2/P8.6 open: integrate shared junction priority, then full browser completion and perf/listening review; no Git writes |

Phase 8 scope and completed gate: [the first robotaxi ride](docs/phases/phase-8-first-ride.md).

| 2026-10-23 | P8.1–P8.6 complete | Shared grouped-junction right-of-way, curved-path traffic clearance, full Ferry → Nob Hill ride and four-mode sound | 182/182 pass; three full-city traffic seeds and actual browser ride all zero contacts/overlaps; static package passes | Browser 463.494 s; observed 85–120 fps at 984×853 High; assist CPU 0.611–0.661 ms/update; no console errors | unknown | No manual intervention/recovery; map pause and pickup/drop-off verified; final batch waiting for Kamil, no Git writes |

- [x] P8 — first robotaxi ride complete; committed as `e17d6c8`.

| 2026-10-23 | README / cinematic showcase | Two real-engine Waymo/helicopter captures, 720p MP4 Desktop delivery, compact GIFs and sourced building counts in README | 7 boot/teleport tests; syntax and whitespace clean; encoded frames inspected | 1280×720, 30 fps, ~14 s MP4; 576×324, 10 fps, 5 s GIF; no performance claim | unknown | Capture-only camera/vehicle staging; no publishing; folded into pending P8 batch |

| 2026-10-23 | P9 collision realism proposal | Inspected buildings, trees and pedestrians; reproduced a 0.250 m false corner push; prioritized exact contact, trunk colliders, pedestrian reactions and impact feedback | Read-only production-resolver reproduction; no gameplay changes or full-suite rerun | No new performance claim; proposed p95 collision budget in phase file | unknown | [Phase 9 plan](docs/phases/phase-9-collision-realism.md); implementation not started |

| 2026-10-23 | Player Waymo detail | Dedicated crossover profile, layered sensors, grille/DRLs, split-spoke wheels and clearcoat; refreshed cinematic | 39/39 targeted checks; static build and visual gallery | 40,804 triangles / 27 meshes; no new GPU timing claim | unknown | Player only; chassis unchanged; procedural interpretation; pending P8 batch |

| 2026-10-23 | Waymo cinematic framing | Replaced sidewalk orbit with closer road-facing tracking camera; refreshed MP4 and README GIF | 28 sampled frames clear of tree occlusion; syntax/whitespace checks | 1280×720, 30 fps, 13.933 s | unknown | Desktop `-clear-view` delivery; pending batch unchanged |

| 2026-10-23 | Waymo body/roof cohesion | Roof-following single fairing; unified hood/cabin, smoother arches and matching paint; ten-angle gallery and refreshed clip | 41/41 targeted; full 184/186 initially, both unchanged timing checks passed separately at original limits | 46,370 triangles / 28 meshes; no new GPU timing claim | unknown | Car only; pending P8 batch updated; no Git writes |


| 2026-10-23 | P9.1 building collision realism | Shared tapered car footprint, exact irregular outlines, full SAT, bounded substeps and wall sliding; opt-in live contact review | 198/198 serial, no retries; three full-city rides zero contacts; build/syntax/whitespace pass | Resolver p95 0.0950/0.1985 ms at 11/36 m/s; incremental 0.0909/0.1939 ms, max 41.0674 ms; CPU only | unknown | Building 7949 live gap 2 mm; tree trunks and pedestrian reactions remain next; user commits |

| 2026-10-23 | Responsive toolbar follow-up | Shared brand/toolbar layout, consistent fog selector, adaptive ride-card clearance | 5/5 boot/settings; nine widths 320–1440 px with no top-control overlap or offscreen controls; settings sync/clean view checked; build passes | No rendering/performance change claimed | unknown | Road holes deferred by user; folded into pending P9.1 batch |

| 2026-10-23 | Demo scope freeze | User prioritizes finishing a nice demo; defer tree/pedestrian collision work, further impact effects and road holes | Existing evidence retained; no runtime changes | No new measurement | unknown | Latest Waymo cohesive + helicopter exports are the recommended media; commit pending fixes, then optional hosted-demo publication/check |

| 2026-10-23 | Demo README / license | Creator credit, two verified GIFs, current playable-demo status, architecture and setup detail; MIT upstream notice retained and SF contribution notice added | GIF/frame metadata, local links, unchanged MIT grant body and static package verified; documentation only | No runtime change | unknown | P9.1 committed as 2237c78; GitHub main still 58dfcae pending user's push |

| 2026-10-23 | Public playable demo release | User authorizes public GitHub repository and Pages deployment; live README link, contribution guide, pinned Actions workflow and verified clean artifact | Release verification recorded in docs/release-audit.md | Static package about 67 MiB; no new rendering-performance claim | unknown | Commit/push authorized for this publication task; no force push or history rewrite |

| 2026-10-23 | Small sidewalk scenes | Three tents and six posed figures near Market/6th, Mission/6th and Howard/5th; bags, blankets and carts; exact placement clearance and pedestrian passage | 201/201 serial, three zero-contact assisted traffic runs; 416 packaged assets; three browser views without errors | Three merged scene meshes; no new animation loop or textures; no new FPS claim | unknown | Authored static scenery; physical impact work remains deferred; Kamil commits |

| 2026-10-23 | Social preview | Open Graph/X large image tags, creator credit, canonical Pages URL and a still from the final Waymo recording | Boot 2/2; JPEG 1280×720, 161 KB; 417 packaged assets verified | Metadata and static media only | unknown | Folded into the pending scene commit; not yet published |
