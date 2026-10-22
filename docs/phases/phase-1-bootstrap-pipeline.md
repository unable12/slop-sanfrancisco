# Phase 1: bootstrap and data pipeline (slice)

**Objective.** A committed repo with the NYC engine pinned and runnable, a reproducible SF data pipeline for the slice box,
a debug/benchmark harness, and the engine booting on SF slice data on **flat ground** (terrain arrives in P2).

**Estimate.** 2 sessions. **Gate.** See the bottom of this file.

**Inputs.** `docs/research.md` (dataset IDs, fields, endpoints, baseline), PLAN decisions D1-D16.

---------------------------------------------------------------------------------------------------------------------

## Tasks

### P1.1 Commit plan, import baseline
1. `git add PLAN.md docs tools/dev && git commit -m "Add SF build plan and probe"`.
2. Clone `https://github.com/mrdoob/slop-newyork` into a temp directory **outside** this repo; `git checkout 0049a49`.
3. Copy its working tree into this repo **except** `.git` and `tools/data/*.json`. Keep `tools/data/q_*.overpassql` as examples.
4. Add `.gitignore` (PLAN §6) and `NOTICE.md` (PLAN §8).
5. Commit: `Import slop-newyork@0049a49 (MIT), minus NYC raw data`.
6. Run `node --test tests/*.test.cjs tests/*.test.mjs`. Expected: everything passes except `geodata.test.mjs`, because the raw data is absent.
   - Mark that test `{ skip: 'rewritten in P1.12' }` in a separate commit.
   - Record the result in the progress log.

**Accept:** two commits; tests green except the documented skip.

### P1.2 Pin three.js
1. In `index.html` replace every `gh/mrdoob/three.js@dev` with `gh/mrdoob/three.js@bc7d0b3c3838d5da9495b5e603afd77ed3154d57`.
2. Run the probe on the NYC app.
   - **Accept:** `backend.webgpuBackend: true`, `consoleErrors: 0`, fps within 10% of the baseline in `docs/research.md` §2.
   - Save the numbers to `docs/perf-log.md` as row "P1.2 NYC pinned".

### P1.3 Dev server and launch config
1. `tools/serve.mjs` (≈30 lines, Node `http`):
   - static files from the repo root;
   - MIME types for `.js .mjs .css .html .json .bin .png .svg`;
   - `Cache-Control: no-store`;
   - binds `127.0.0.1:8080`.
2. `.claude/launch.json` with a config `sf` running `node tools/serve.mjs`, for when the user watches in the in-app browser.

**Accept:** `curl -sI http://127.0.0.1:8080/index.html` returns 200; the probe works through it.
Run the server in the background (`run_in_background`) and stop it at the end of the session.

### P1.4 Debug, shot and bench harness
1. **URL parameters**, parsed early in `main.js`:

   | Parameter | Effect |
   |---|---|
   | `cam=x,y,z,yawDeg,pitchDeg` | Free camera pose |
   | `mode=person\|car\|cyclist\|heli` | Start mode |
   | `time=morning\|noon\|golden\|night` | Map to the existing `TIME_PRESETS` names (read `lighting.js` 16-110) |
   | `hud=0` | Hide HUD |
   | `freeze=1` | Stop traffic and pedestrians, for stable shots |
   | `seed=n` | Seed |
   | `bench=street\|car\|heli\|hill` | Scripted 20 s camera path, then logs `[bench] name median_ms p95_ms fps` to the console |

2. **Extend `window.__NYC_APP`** with a `debug` object:
   - `stats()`: `renderer.info` draw calls, triangles, geometries, textures, plus counts of cars and pedestrians;
   - `heightAt(x, z)`: stub until P2;
   - `teleport(name | x, z, heading)`;
   - `setTime(name)`;
   - `freeze(bool)`.
3. **Probe** (`tools/dev/probe.mjs`):
   - accept a `--shots tools/dev/shots.json` list (name → URL query) and write `shots/<name>.png` for each in one Chrome session;
   - accept `--bench name` and print the `[bench]` line;
   - return non-zero on console errors.
4. Shots for the slice (coordinates are filled in once the frame exists, P1.7): `market-street`, `california-at-powell`, `nob-hill-top`, `chinatown-grant`, `ferry-building`, `heli-slice`.

**Accept:** shots and benches run on the NYC app (temporary NYC coordinates) with no errors.

### P1.5 Data fetcher
`tools/fetch-geodata.mjs` (Node, no dependencies) plus `tools/boxes.json`, which defines named boxes (`slice`, `core`, `city`) as lat/lon.
Derive the slice box from data: the bounding box of the street segments named CALIFORNIA ST between the Embarcadero and Hyde St, expanded by 400 m. Record the result.

1. **DataSF** (IDs in `docs/research.md` §4). Use SoQL `within_box` per box, paginated with `$order=:id&$limit=50000&$offset=` until a short page. Save GeoJSON to `data/raw/datasf/<id>-<box>.geojson`.
   - Streets: `active=true`.
   - Curbs and Islands: all layers.
   - Datasets: Building Footprints, Sidewalk Widths, Traffic Signals, Stop Signs, Street Tree Inventory, Muni Stops, Muni Simple Routes, Bike Network, Land Use, Rec and Parks Properties, Tall Building Inventory.
2. **OSM via Overpass:** reuse NYC `tools/overpass.sh` (retries, validation). Queries in `tools/queries/*.overpassql`:
   - coastline;
   - piers (`man_made=pier`);
   - parks/landuse/natural in the box;
   - named landmark buildings (phase 5 list);
   - rail (`railway=tram|light_rail|funicular` + route relations);
   - `ele` peaks;
   - `highway` with `lanes`/`width`/`bridge`/`tunnel`/`layer` tags.
3. **DEM:** query the TNM API (`docs/research.md` §5) for project `CA_SanFrancisco_B23` tiles intersecting the box. Download via `downloadURL`, verify size, and record the URLs in the manifest. Tiles are 86–177 MB each; download only the ones the box needs.
4. **Manifest** `data/raw/MANIFEST.json`: URL, date, bytes, sha256, rows, license, box. `--verify` re-hashes. Re-running skips files whose query hash is unchanged.

**Accept:** a clean `data/raw/` plus one command (`node tools/fetch-geodata.mjs --box slice`) gives the full input set. Rerunning is a no-op. Row counts are printed.

### P1.6 Tool dependencies and DEM reader
1. Create `tools/package.json` (private, dev only) with `geotiff`, and `proj4` if needed for UTM 10N → WGS84. Run `npm install` inside `tools/`.
   - `tools/node_modules` is git-ignored; commit `package-lock.json`.
   - The runtime must never import from `tools/`.
2. `tools/geo-terrain.mjs`:
   - read the needed DEM windows;
   - reproject to the world frame on a 2 m grid (sample by bilinear on the 1 m source after a 2×2 box average);
   - apply a light Gaussian (σ = 1 cell);
   - quantise to uint16 with `{minH, maxH, cell, originX, originZ, w, h, waterLevel}` in a JSON header;
   - write `data/terrain-slice.bin`.
3. **Water level:** take the mode of DEM values inside an OSM water polygon in the box (the bay at the Embarcadero). Hydro-flattening makes it constant. Record it as `waterLevel`.
4. **Report** (`docs/reports/terrain-slice.md`):
   - elevation min/max;
   - quantisation step;
   - water level;
   - file size;
   - the 10 steepest street links (sample along centrelines every 5 m; max grade over a 15 m window).

**Accept:** `tests/terrain-data.test.mjs` passes:
- header sane;
- every footprint's `gnd_min_m` agrees with the baked terrain minimum under its ring within 0.75 m for ≥ 95% of buildings in the box;
- points inside OSM water are at `waterLevel`.

This cross-check of two independent lidar products is the main guard against CRS and datum mistakes.

### P1.7 Frame and projection
1. Rewrite the frame section of `tools/geo-base.mjs`:
   - origin = the node CNN shared by a MARKET ST segment and a MONTGOMERY ST segment (from the streets data);
   - `THETA = 0`;
   - same tangent-plane math as NYC;
   - add `fromWorld()`.
2. Delete NYC's theta refinement and NYC loaders. Add `loadGeoJSON(path)` → `{ geometry, props }[]`.
3. **Tests:** round trip lat/lon ↔ world within 1 cm over the core box. Distance between two street nodes is within 0.5% of the haversine distance.

### P1.8 Curb islands (blocks) from curb lines
`tools/geo-curbs.mjs`:
1. Project curb lines; drop zero-length lines; snap endpoints within 0.3 m.
2. Chain lines into rings by shared endpoints.
3. Close open chains whose ends are ≤ 12 m apart, with a straight segment. Alley mouths become sidewalk-continuous, matching how the sidewalk reads.
   - Log every closure (position, gap).
   - Gaps > 12 m: try pairing ends across chains, same rule. Leftovers are logged as unclosed.
4. Rings → polygons; orient CCW; drop polygons < 4 m². The `ISLANDS` layer becomes medians (`median: true`, like NYC's Park Ave malls).
5. Validate:
   - no self-intersections (fix with a small epsilon offset);
   - no overlaps between blocks (sampled test);
   - every footprint centroid lies inside some block or within 2 m of one. If not, report it: the curb data is from 2016 and some blocks changed.
6. **Frames:** per block, the dominant edge orientation(s) by length-weighted angle histogram. Output NYC's `frames` format `[θ, px, pz, rects]`, with `rects` empty: lots are not used.
7. Output to `GEO.blocks` in NYC's format `[flat, rects, park, parkName, isRect, frames]`, so `city-config.js` `BLOCKS` keeps working.
8. Write the SVG `docs/review/p1/curbs.svg` (blocks, closures in red, centrelines in grey) and look at it.

**Fallback (D6):** if fewer than 90% of the curb length closes into rings, use NYC's `geo-blocks.mjs` raster approach with curb-measured widths, and log the decision.

**Accept:** ≥ 95% of street-adjacent area covered by blocks; report in `docs/reports/curbs-slice.md`.

### P1.9 Road graph
`tools/geo-roadgraph.mjs`, rewritten for SF:
1. **Links:**
   - keep active streets whose `layer` is in {STREETS, FREEWAYS, STREETS_PEDESTRI (flag ped-only), PARKS*, PRIVATE (flag), STREETS_TI, STREETS_YBI};
   - drop `PAPER*`, `PSEUDO`, `UPROW`;
   - **nodes = `f_node_cnn`/`t_node_cnn`**; node position = the mean of the matching geometry endpoints.
2. **Direction:** `oneway` B → 0, F → +1 (from → to), T → −1.
3. **Width:** at the link midpoint and at quarter points, cast perpendicular rays to the nearest curb on each side; width = median of the sums. Clamp to [5, 45] m. Fallback by class.
   - Sidewalk widths from the Sidewalk Widths dataset (`cnn`, `side`), clamped to [1.5, 8] m, fallback 3 m.
4. **Lanes:**
   - OSM `lanes` matched by name and nearest geometry, else `max(1, floor((width - 2·parking) / 3.2))`;
   - parking 2.4 m per side for class ≥ 4, else 0;
   - one-ways put all lanes in one direction.
   - Record `lanesSource`.
5. **Flags:** tunnel or bridge (from OSM `tunnel`/`bridge`/`layer` on matched ways), freeway (class 1 or layer FREEWAYS), ped-only, private.
6. **Control per node:** `signal` if a Traffic Signals row with `type` SIGNAL has that `cnn`. Else `stop` with the approaches listed by the Stop Signs rows (`cnn`, `st_facing`); an all-way stop if every approach has one. Else `none` (yield to major class).
7. **Output** extends NYC's format:
   - `roadGraph.nodes` = flat `[x, z]` (y comes in P2);
   - `links` = `[a, b, nameIdx, w, lanes, dir, innerPts, flags, sidewalkL, sidewalkR]`;
   - `nodeControl` = per-node code + stop approach mask.
8. **Check script** `tools/check-roadgraph.mjs`: largest strongly connected component share, dead ends, nodes with more than 6 links, links with grade > 25% (once terrain exists), control coverage.

**Accept:** the strongly connected component holds ≥ 95% of drivable length in the slice; control assigned for every node with more than 2 links.

### P1.10 Coast, piers, parks
`tools/geo-extra.mjs`, rewritten:
- land polygon from OSM coastline, clipped to the box;
- piers (`man_made=pier` areas) in NYC's `piers` format `{name, cx, cz, len, wid, ang, ring}`;
- parks from Rec and Parks;
- water bodies from OSM.

### P1.11 Buildings v0 data
`tools/geo-buildings.mjs`, first version:
- per footprint: id, ring (RDP 0.3 m), `base = gnd_min_m`, `roof = median_1st_m`, `peak = peak_1st_m`;
- drop rings < 6 m² and buildings with `roof − base < 2.5 m`;
- clip anything inside a curb-to-curb corridor (log the area clipped);
- binary `data/buildings-slice.bin` (format: `docs/formats.md`, written in this task).

### P1.12 Assemble and boot on flat SF
1. `tools/build-geodata.mjs`, rewritten as an orchestrator: frame → curbs → road graph → extra → terrain → buildings → `js/sf-geodata.js` (vector) and `data/*.bin`. It prints sizes and a summary.
2. `js/data-loader.js`: fetch the binaries with progress into the loading bar; `main.js` awaits it before building. Add it to the `index.html` script list and to the preload list (the boot test checks the order).
3. Script list: `nyc-geodata.js` → `sf-geodata.js`.
4. **`js/city-config.js`:**
   - Keep the generic functions: `blockAt`, `blocksInRect`, `nearestRoads`, `pointInPoly`, the spatial hashes, `signalPhase`, `walkSignal`.
   - Replace the NYC tables with SF data or empty values: `ALL_AVENUES`, `AVENUES`, `STREETS`, `ALL_STREETS` = `[]`; `ROADS` from the graph; `districtAt` from `analysis_neighborhood` on the nearest street; `getLocationLabel` = nearest street name + neighbourhood; `TELEPORT_LOCATIONS` = 5 slice spots on roads; `ISLAND_BOUNDS` and `getIslandBoundsAtZ` → a land-polygon test (keep the names and exports so callers keep working).
5. **`FEATURES` in `main.js`:** `{ boroughs:false, landmarks:false, traffic:false, highway:false, details:'minimal', buildings:'v0' }`. Builders behind a false flag return empty groups with the same return shape.
6. **Buildings v0:** extrude footprints from `base` to `roof` with one plain material (flat ground for now: base clamped to 0, height = roof − base) so the scene has massing.

**Accept:** the probe shows the slice from `heli-slice` and `market-street` (flat), 0 console errors, ready < 15 s. Screenshots go to `docs/review/p1/`.

### P1.13 Tests
1. **`tests/geodata.test.mjs`, rewritten.** Load `js/sf-geodata.js` in `vm` (fast, without rebuilding) and assert:
   - blocks are valid;
   - graph strongly connected component ≥ 95%;
   - widths in range;
   - control codes valid;
   - piers and parks parse.
2. A separate slow test (`tests/geodata-build.test.mjs`) rebuilds from `data/raw` only if it exists, otherwise skips with a message.
3. **`teleports.test.cjs`:** keep the structure; SF destinations; use the land-polygon test instead of island bounds.
4. **`boot.test.cjs`:** passes with the new script list.

---------------------------------------------------------------------------------------------------------------------

## Gate (P1)
- [ ] All tests green (documented skips only).
- [ ] The probe: WebGPU backend, 0 errors, slice screenshots in `docs/review/p1/`, numbers in `docs/perf-log.md`.
- [ ] Reports: terrain, curbs, road graph.
- [ ] `docs/formats.md` documents the binary formats.
- [ ] Progress log, decision log and handover updated.
