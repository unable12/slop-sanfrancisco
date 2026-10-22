# Phase 2: vertical slice (real hills, end to end)

**Objective.** Everything works together on the slice (Nob Hill → Chinatown → Financial District → Ferry Building):
- terrain;
- curb islands and sidewalks on slopes;
- buildings from footprints standing on the ground;
- the player in four modes;
- the road network in 3D;
- traffic obeying real signals and stop signs on hills;
- pedestrians crossing at signals and stops.

This phase retires the project's main risk. Visual style stays NYC-ish (SF look is P4).

**Estimate.** 6 sessions. **Inputs.** P1 outputs; `docs/research.md` §3 for every line number cited below.

**Order matters.** Ground first (P2.1-P2.4), then buildings (P2.5), then the player (P2.6), then roads/traffic/pedestrians (P2.7-P2.10).
Each step leaves the app bootable with 0 console errors (probe after each task).

---------------------------------------------------------------------------------------------------------------------

## P2.0 Ground audit (checklist)
Create `docs/ground-audit.md` from `docs/research.md` §3 plus:
```
grep -nE "position\.(y|set)|\.y\s*=|setY|positionWorld\.y|wy\b|yHeight|maxY|< *2\.6|0\.22|0\.012|0\.018|0\.55" js/*.js
```
Classify each hit:

| Class | Meaning | Action |
|---|---|---|
| A | absolute ground | must use terrain |
| B | relative to a placed parent | none |
| C | a vertical size | none |
| S | shader using absolute world y | must use a base attribute |

Give every A and S item its owning task. Tick items as they are fixed. This file is the single checklist for "nothing floats or sinks".

## P2.1 Height API: `js/terrain.js` (new, pure JS, no THREE)
```
NYC.Terrain.load(header, uint16Array)   // from data-loader
NYC.Terrain.heightAt(x, z)              // bilinear, metres NAVD88; outside data -> waterLevel - 5
NYC.Terrain.groundAt(x, z)              // max(heightAt, waterLevel)
NYC.Terrain.normalAt(x, z, out)         // central differences, unit
NYC.Terrain.slopeAt(x, z)               // |grad|
NYC.Terrain.waterLevel
```
- Add it to the script list right after `data-loader.js`.
- Expose it through `__NYC_APP.debug.heightAt`.
- **Tests** (`tests/terrain.test.cjs`, `vm`):
  - continuity: 20k random pairs 0.1 m apart, |dh| ≤ 0.1 × maxGrade + quantisation;
  - unit normals;
  - `slopeAt` vs finite differences;
  - points in water return `waterLevel`;
  - footprint `gnd_min_m` agreement (re-checked at runtime resolution).

## P2.2 Terrain mesh (`js/terrain-mesh.js`, new)
1. **Chunks.** 64 m chunks; LOD0 at 2 m (32×32 quads), LOD1 4 m, LOD2 8 m, LOD3 16 m; skirts 2 m deep against cracks.
   - Shared index buffers per LOD.
   - Vertex positions in world space: **baked y, no displacement shader**.
   - Normals computed on the CPU from the height field.
2. **LOD selection** by camera distance with hysteresis (thresholds 150/400/900 m, tuned by bench). Updated at most every 0.25 s or after a 20 m move.
3. **Material.** Reuse `createRoadSurfaceMaterial` (asphalt) and the NYC sidewalk/lawn materials, chosen by a **ground mask** (R8, 1 m cells, baked in tools):
   - classes: 0 asphalt, 1 sidewalk/plaza (under curb islands, mostly hidden by slabs), 2 lawn/park, 3 sand, 4 rock, 5 water edge;
   - one TSL material samples the mask with nearest filtering and blends with `fwidth` anti-aliasing at class borders.
4. **Shadows.** Terrain receives shadows. For casting, add terrain chunks to the shadow-proxy mechanism in `scene-culling.js` (check that its 500 m proxy cells take non-instanced meshes; if not, add a branch). Hills must shade streets at golden hour.
5. **Water.** The existing water plane at `Terrain.waterLevel`.
6. **Seawall.** Along the Embarcadero, extrude the land/water boundary (OSM coastline, resampled every 5 m) from `waterLevel − 3` up to `groundAt` per vertex (reuse `createExtrudedPolygonMesh` logic, per-vertex top).
7. **Remove** the flat road polygon at y = 0 and the Manhattan seawall, Central Park, stone bridges and shore-highway belt code paths (`city-grid.js`, research §3), behind `FEATURES` first, then delete when the slice passes.

**Accept:**
- `nob-hill-top` and `california-at-powell` shots show hills with no cracks;
- `stats()` terrain draw calls ≤ 40 in the slice;
- `bench=heli` ≥ 75 fps median.

## P2.3 Road smoothness check (decides D5)
`tools/check-road-smoothness.mjs`: along every link centreline, sample the baked terrain every 1 m and compute the second difference over 5 m windows. Report p50, p95 and max per link, plus the worst 20 links with names.

- If p95 > 0.04 m⁻¹ (a visible bump at driving speed), implement **conforming** in `geo-terrain.mjs`:
  1. smooth each link's profile with a 10 m Gaussian;
  2. set each node's elevation to the mean of the incident link ends;
  3. blend links to their nodes over 12 m;
  4. write the profile into the road corridor (curb to curb, cross slope from the raw surface clamped to ±4%);
  5. blend back to raw terrain across the sidewalk.
- Else skip conforming. Log the decision with the numbers.

## P2.4 Drape curb islands, sidewalks, curbs (`city-grid.js` section 4)
1. All islands become outline meshes (no instanced flat slabs).
2. Triangulate with the existing helpers. Subdivide adaptively: split triangles whose terrain varies more than 5 cm from the planar fit, with a 1.5 m minimum edge.
3. Top = `groundAt + 0.15` (SF curb height; replaces NYC's 0.22; record it as `CURB_H`).
4. Curb faces: per-outline-edge quads from road ground to top. The granite curb strip follows the same heights.
5. Merge geometry per 128 m cell (`batchStaticGroupMeshes`).
6. **Medians** (`ISLANDS` layer): same treatment.
7. **Ramps** at crosswalks (curb ramps): optional; skip in P2.

**Accept:**
- test: 5,000 sampled outline vertices satisfy `top − groundAt == CURB_H` within 1 cm;
- `chinatown-grant` shot shows sidewalks following the grade.

## P2.5 Buildings v1 on slopes
1. **Shader fix (class S items).** `createFacadeBoxes` gets a new per-instance attribute `boxBase` (absolute y of the box bottom), or the box-local mode becomes the only mode. Then:
   - floor and storefront maths in `tsl-materials.js` (165-166, 438-445, 1700) use `positionWorld.y − boxBase` instead of `positionWorld.y`;
   - check every TSL function reading `positionWorld.y` for floor/shopfront logic (grep);
   - add `tests/facade-base.test.cjs` (extend `facade-projection.test.cjs`): the same box at y = 0 and at y = 87 gives identical floor indices.
2. **Rectangle cover** (`tools/rect-cover.mjs`, extracted from NYC `geo-blocks.mjs` `lotRects`):
   - per footprint: rotate to its dominant angle, rasterise at 0.5 m, greedy largest rectangles until 97% coverage or 10 rectangles;
   - footprints under 90% coverage go to a polygon list (rendered as an extruded polygon with the same facade shader in world-u mode; budget < 2% of buildings).
3. **Masses:**
   - bottom = `base − 1.0` (foundation hidden in the ground);
   - top = `roof`;
   - downhill plinth where `max ground − min ground under the footprint > 0.6 m`: no extra geometry, the facade shader treats the band below `boxBase + drop` as a solid plinth. This is a shader parameter per instance (`plinth`), packed with `boxBase`.
4. **Runtime.** A new path in `buildings.js`, `buildCityBlocks` with `FEATURES.buildings = 'v1'`:
   - for each mass, push a facade box `{x, y, z, w, h, d, ry, faces, tone}` into the existing material buckets;
   - choose the material by height class (towers: curtain wall; midrise: prewar; low: brick or loft) as a placeholder until P4;
   - `faces`: front walls (facing a road within 12 m) get shop or entrance treatment by land use (`retail > 0`), others plain; party walls (shared with a neighbour within 0.5 m) blank.
5. **Colliders.** Add `minY` (= base) to colliders (`buildings.js` `pushCollider`, `controllers.js` around 796). Callers pass the entity's real y (see P2.6).
6. **Detail streaming** (cornices, roof gear) stays on via `commit()`, but NYC water towers are disabled by default (`FEATURES.waterTowers = false`). The quadtree covers the data bounds instead of `ISLAND_BOUNDS`.

**Accept:**
- test: for all buildings in the slice, `|massBottom + 1.0 − gnd_min_m| < 0.05` and `top == median_1st_m`; no mass intersects a road corridor by more than 0.3 m;
- `california-at-powell` shot: no floating or buried buildings, floor lines level per building.

## P2.6 Player, cameras, colliders
1. **`getGroundHeight`** (controllers.js 710-725):
   - land: `Terrain.groundAt`;
   - on a sidewalk: plus `CURB_H` for `person` (keep `isPointOnSidewalk`);
   - remove the Central Park and Bryant Park cases.
2. **Collider queries.** Pass `yHeight = position.y + 1` for car and cyclist (was a constant 1.0, at 1044 and 1105). Skip a collider if the entity is above `maxY + 1.5` or below `minY − 0.5`.
3. **Car and cyclist pose.**
   - Sample ground at front axle, rear axle, left and right; pitch = atan((front − rear) / wheelbase); roll similarly.
   - Critically damped smoothing (τ = 0.1 s), added to the existing chassis spring offsets (1047-1059).
   - The cyclist uses pitch only (it already leans).
4. **Grade physics (player).** Acceleration −g·sin(pitch)·0.6 for the car (tunable); the bike gets a stronger uphill penalty; the person's walking speed scales by `1 − clamp(slope·0.8, 0, 0.5)` uphill.
5. **Helicopter.** Replace the 0.25 floor with `groundAt + 2` (landing) and a soft ceiling; no flying through hills.
6. **Cameras.** The clamp `y ≥ 0.55` (cameras.js 184, 338) becomes `y ≥ groundAt(x, z) + 0.55`. The third-person boom does a 4-sample terrain test and shortens when a hill occludes.
7. **Teleport.** Lands at `groundAt` facing along the road.
8. **Map radar zoom.** Use height above ground instead of absolute y (nyc-map.js 983).
9. **Shadow far** in `lighting.js` 303: use height above ground.

**Accept** (extend `tests/controllers.test.cjs` with a stub terrain having a 30% slope):
- the person keeps |y − ground| < 2 cm for 600 frames up and down;
- a car on the slope reaches pitch within 1° of the slope in 0.5 s;
- the helicopter cannot go below ground + 2 m;
- the camera never goes below ground + 0.5 m.

Probe: `?mode=car&cam=<bottom of California St>`, drive the script up (bench `car`), screenshot halfway up.

## P2.7 Road network in 3D (road-network.js)
1. **Remove the grid-specific parts** (research §3: 101-192, 194-228, 230-244, 445-467, 737-738, 857-870/902-907, 1062-1068). Keep the generic parts.
2. **`centrelineStreets()` becomes the only source.**
   - Read the SF graph (P1.9 format), with no snapping to grid avenues.
   - Junction merging under 14 m stays, but **check it against SF's short links**; tune to 8 m if it merges real intersections.
   - Lanes come from data, not the `MAJOR` regex.
3. **Land test.** `onLand` uses the land polygon (P1.10) instead of `getIslandBoundsAtZ`.
4. **Elevation.** Each edge stores a height profile sampled from `Terrain.groundAt` every 2 m along its centreline (`Float32Array` per edge, plus a cumulative 3D length). Curves get y by Hermite interpolation of end heights and grades.
   - Add `edgeY(e, s)`, `edgeGrade(e, s)`, `curveY(c, t)`.
5. **Control.** `n.signal` from data (`nodeControl`). New `n.stop` with an approach mask. Build sides and groups from approach angles, not compass sides.
6. **Arms at oblique junctions** (Market St diagonal, five-way junctions): `computeArms` sorts by angle; check that movements exist for every legal turn. Add `?debug=roads` to draw nodes, arms and movements as lines.

**Accept** (`tests/road-network.test.cjs`, `vm` with the SF geodata + terrain):
- builds in < 2 s for the slice;
- the strongly connected component covers ≥ 95% of edges;
- every edge has a finite height profile;
- every curve's length is under 2× its chord;
- all 4-way and 5-way junctions in the slice have through movements in both directions where the one-way rules allow.

## P2.8 Traffic on hills (traffic.js)
1. **Pose.** Reuse the highway traffic's 3D maths (1973-2335):
   - y = `edgeY` at front and rear axles;
   - pitch = −atan(Δy / wheelbase);
   - roll from the terrain normal (clamped to ±4°);
   - add the existing acceleration-based spring pitch on top.
2. **Rendering y** (class A items):
   - body y = average axle y (1583, 1661);
   - wheels at axle y + radius;
   - shadows at ground + 0.018;
   - headlight matrices from the instance matrix (1726), like the highway code;
   - the police light relative to the body.
3. **Visibility.** `visible()` tests (x, groundAt + 1, z) (533). `player.active` compares the player's height above ground (1842).
4. **Stop control (new):**
   - an approach with a stop sign must stop at the stop line (speed < 0.3 m/s for ≥ 1.0 s);
   - then go in arrival order, yielding to vehicles in the box and to pedestrians on its crosswalks;
   - a 6 s timeout breaks deadlocks if clear;
   - two-way stops: the minor road yields to major-road traffic using the existing give-way gap test.
5. **Signals** use the existing cycle per node, with groups from P2.7.5. Offsets come from a hash of the node id, so the city does not blink in sync.
6. **Grade dynamics.**
   - IDM acceleration += −g·grade·k (k = 0.5 for cars, 0.8 for buses);
   - target speed scaled down above 8% grade;
   - stopped vehicles do not roll.
7. **Vehicle counts** scale with drivable length (NYC: 200 cars and 32 buses for Manhattan). Start with 60 cars and 6 buses in the slice; tune by bench.

**Accept** (`tests/traffic-sim.test.cjs`): factor the pure update logic so it runs in `vm` with stub THREE (as `traffic.test.cjs` already does via extraction), then simulate 10 minutes at 60 vehicles:
- no overlaps in a lane;
- no vehicle stationary for more than 90 s unless held by red or stop rules;
- no deadlock (throughput > 0 at every all-way stop over 2 minutes);
- y within 3 cm of `edgeY`.

Probe shots: `california-at-powell` (bus climbing), an all-way stop in Chinatown.

## P2.9 Pedestrians (traffic.js pedestrian parts, pedestrians.js)
1. `pedGround` (1770-1778) → `groundAt + CURB_H` on sidewalks, `groundAt` on crosswalks. The PersonRig `ground()` callback uses `Terrain.groundAt` (+ curb on sidewalks).
2. **Crosswalk tracks at every signal and stop node**, along each arm's direction across the road (not axis-aligned):
   - from curb to curb, offset back from the junction box by the curb-return radius;
   - walk phases from the signal or stop rules (at stops, pedestrians have priority and cars yield).
3. **Sidewalk tracks:** the general-edge path (parallel at `half + 1.4..4 m`, checked by `blockAt`) stays. Remove the grid-rect path.
4. Slope-aware walking speed (same law as the player).

**Accept:** `freeze=0` shot at a Chinatown crossing shows pedestrians on crosswalks; a sim test checks that pedestrians only enter the roadway on crosswalks.

## P2.10 Street details, minimal (street-details.js)
1. **Signal heads** at `signal` nodes: one mast per arm corner (outer corner of each arm), placed on the curb island, y = ground. Fix the lens shader (62-64) to use `positionWorld.y − baseY` (instance attribute).
2. **Stop signs (new, simple model):** pole + octagon at each stop approach's right corner.
3. **Lamps** along links every 30 m alternating sides, on curb islands, y = ground + `CURB_H`.
4. **Disable NYC-specific placements** behind flags: One World Trade Center, Central Park, Bryant Park, avenue×street hydrants and lamps zone (research §3). Hydrants at corners, from the graph.

## P2.11 Road paint (road-paint.js)
Flat quads at a constant HEIGHT (22-31) become ribbons subdivided every 1 m, with y = `groundAt + 0.012`, for:
- lane lines from edges;
- crosswalk stripes from P2.9 tracks;
- stop lines at stop approaches.

## P2.12 Integration, perf and gallery
1. Enable `FEATURES.traffic = true`.
2. Run all benches (street, car, heli, hill). Fix regressions; typical culprits are per-frame terrain sampling (cache per edge) and too many chunk draw calls (raise LOD distances).
3. Gallery `docs/review/p2/` (RUNBOOK §7), with shots:
   - `market-street`
   - `california-at-powell`
   - `nob-hill-top`
   - `chinatown-grant`
   - `ferry-building`
   - `heli-slice`
   - `golden-hour-hill-shadow`
   - `all-way-stop`
4. Delete the NYC-only code paths that the slice no longer uses (where `docs/file-disposition.md` says drop). Keep the tests green.

---------------------------------------------------------------------------------------------------------------------

## Gate (P2)
- [x] Ground audit: every A and S item fixed or explicitly deferred with an owner.
- [x] Tests green, including terrain, facade-base, controllers-slope, road-network and traffic-sim.
- [x] Probe: 0 errors. Benches meet PLAN §1 budgets (street ≥ 75, heli/hill ≥ 60, heap ≤ 1.2 GB, ready ≤ 25 s).
- [x] Gallery written. Known issues listed.
- [x] Progress log, decision log, handover. Re-estimate phases 3-7 from measured P1-P2 usage.

Passed 2026-10-22 (one session). Tests 126/126; benches street 435, car 370, heli 357, hill 323 fps, heap ≤ 283 MB,
ready ≤ 3.7 s, 0 errors; gallery `docs/review/p2/index.md`.

## Risks and fallbacks
| Risk | Fallback |
|---|---|
| Curb data (2016) disagrees with today's streets (bulb-outs, plazas) | Accept small mismatches; footprints are clipped to the road corridor; log the worst 10 |
| Junction merging collapses SF's short offset intersections | Lower the merge distance; special-case by node CNN |
| Facade shader changes ripple widely | Add `boxBase` with default 0 so untouched paths behave as before; test parity on a flat scene |
| Vehicles jitter on steep curves | Sample y at axles from the cached edge profile, never per-frame raycasts; smooth pitch |
| Stop-sign logic deadlocks | Timeout plus throughput test; log stuck junctions with `?debug=roads` |
