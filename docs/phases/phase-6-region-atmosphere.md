# Phase 6: the rest of the city, the horizon, and the atmosphere

**Objective.** Make the whole city and its surroundings visible and cheap:
- real terrain everywhere;
- all 177k footprints as low-detail instanced buildings;
- parks and forests;
- the bay with islands, Marin and the East Bay on the horizon;
- SF's marine layer, built by extending the fog that already exists.

**Estimate.** 3 sessions. **Prerequisites.** P3 gate (P4 and P5 recommended, since their objects appear in these views).

---------------------------------------------------------------------------------------------------------------------

## What we reuse (✅ `docs/research.md` §3)
| NYC piece | Reuse for |
|---|---|
| `boroughs.js` `buildBuildingChunks(list, mat, 1200)`: one InstancedMesh per 1,200 m chunk, frustum culled, no shadows; unit box with no bottom face; one window-grid shader | Region buildings, fed **real** footprint boxes instead of procedural ones |
| `boroughs.js` land-use texture (31 m/texel) + zone texture driving a procedural ground shader | Region ground: a mask baked from SF data (streets, parks, sand, rock) driving the same kind of shader |
| `boroughs.js` Palisades heightfield | Precedent for far terrain; we use the DEM instead |
| `lighting.js` `FogExp2` + aerial `fogNode` with height falloff (H = 900 m) | Base for the marine layer |

---------------------------------------------------------------------------------------------------------------------

## Tasks

### P6.1 Region data (offline)
1. **City box** fetch (all datasets, plus DEM tiles for the whole city: 4 tiles, about 523 MB raw in `data/raw`).
2. **Terrain:**
   - region tier at 8 m for the city outside the core;
   - far tier at 32 m for the horizon from available DEMs: CA_SanFrancisco_B23 covers the city; Marin and East Bay come from other 1 m projects or the 1/3 arc-second national DEM ❓ (pick what TNM returns for those boxes, record it);
   - tiles in 1 km (region) and 4 km (far) files.
3. **Region buildings:**
   - per footprint: one oriented box (the minimum-area rectangle of the ring), or two for L-shapes when the rectangle covers < 75%;
   - base and roof from data; quantised;
   - grouped in 1,200 m cells; `data/region/buildings-<cell>.bin`.
4. **Region ground mask** (R8 at 4 m): asphalt corridors from the full road graph (widths per P1.9), parks (Rec and Parks), sand (OSM `natural=beach`), rock (slope > 45° on the DEM), forest (OSM `natural=wood` / `landuse=forest`; Golden Gate Park, Presidio), cemetery, industrial (Land Use `pdr`). Compressed (palette + RLE + gzip by the server).
5. **Trees:** the street tree inventory citywide as instanced low-detail trees; forest canopy as instanced clusters at 2 densities.

**Accept:** `tests/region-data.test.mjs`: counts, bounds, base/roof non-null, region boxes do not overlap core masses, mask classes valid. File sizes recorded; every file < 50 MB.

### P6.2 Region renderer (`js/region.js`, replacing `boroughs.js`)
1. Terrain chunks (the P2.2 mesh code with coarser LODs), with a ground shader driven by the region mask (procedural street lines inside asphalt areas, roofs not needed since buildings are real).
2. Buildings via `buildBuildingChunks` with real boxes; window-grid shader with a per-instance palette tint and night lights.
3. Hand-off with the core: the core's far LOD and region chunks must not double-draw. The core box is excluded from region data, with a 50 m overlap and dithered fade.
4. Islands: Alcatraz (P5 landmark), Treasure Island and Yerba Buena (terrain + region boxes), Angel Island (terrain).
5. Horizon: Marin Headlands and East Bay hills from the far tier. Oakland downtown as region boxes if footprints exist for Oakland ❓ (likely not in DataSF; OSM buildings with heights as a fallback, else skip).
6. Delete `boroughs.js` from the script list when `region.js` covers its role. Keep the file in git history only.

**Accept:** `twin-peaks-view` and `heli-city` benches ≥ 60 fps, heap ≤ 1.2 GB (re-check budgets; if the 177k boxes alone exceed them, drop region buildings beyond 6 km and log it).

### P6.3 Marine layer (extend `lighting.js` fog)
1. **Read the existing `fogNode` (212-236) first.** It has a sky-colour aerial term and an exponential height falloff on absolute y. Extend it rather than replacing it:
   - `layerTop` (m, default 200, animated slowly ±40 m);
   - inside the layer, dense fog (visibility about 300–800 m); above it, thin haze;
   - the transition through `smoothstep(layerTop − 40, layerTop + 40, y)` of the sample point **and** the camera, so standing on Twin Peaks above the layer shows a white sea with bridge towers poking out;
   - flow: 2D noise in xz advected east by "wind" through the Golden Gate gap, thickening fog on the west side and thinning it downtown.
2. **Presets** in the time/weather UI: Clear, Light haze, Marine layer, plus `?fog=clear|haze|marine`.
3. **Sun and sky:** the sun disc dims inside the layer; the sky is fogged near the horizon; bloom is not driven by fog.
4. **Cost:** analytic plus one texture lookup per fragment, target < 1 ms at 1280×720. No volumetric ray marching unless measured headroom exists.

**Accept:** gallery shots `twin-peaks-marine-layer`, `ocean-beach-fog` (Region), `embarcadero-clear`, `golden-gate-from-crissy-fog`. Bench delta < 1 ms vs fog off.

### P6.4 Water, ships, night
- Water tuning (bay colour, chop near the Gate, foam at piers);
- a few ferries on Ferry Building routes (reuse NYC ferry/ship code if present in `city-grid.js` piers);
- container ships near Oakland (instanced, slow);
- night city glow and bridge lights.

### P6.5 Perf pass and gallery
All benches plus `heli-city`, `twin-peaks-view`. Gallery `docs/review/p6/`.

---------------------------------------------------------------------------------------------------------------------

## Gate (P6)
- [x] Whole-city frame rate and memory within budgets; fog states captured.
- [x] Marine-layer GPU cost < 1 ms versus fog off (P6.3 acceptance).
- [x] Tests green; data files < 50 MB each.
- [x] Logs and handover.


## Implementation and verification (2026-10-22)

P6.1 is implemented and data-validated. The city snapshot contains 177,023 footprints; 154,870 regional
buildings become 161,645 oriented boxes after core/landmark/tiny-mass exclusions. There are 109,192 inventory
trees outside the core and two canopy densities. City terrain is 8 m in 1 km tiles; the horizon is 32 m in
4 km tiles from the pinned USGS national DEM. OSM directed coastlines flatten tidal water without removing
low coastal land. The 366 assets total 18.16 MB, largest 2.48 MB, and rebuild byte-identically.

P6.2 uses `js/region.js`: the former borough facade shader and 1,200 m instancing cells, terrain LOD,
mask-driven ground and night glow. Regional LOD geometries are cached after first use. Flight bounds now
cover the measured horizon; ground modes remain in the core. `boroughs.js` is deleted. Oakland's terrain
is included; its buildings are omitted because no Oakland footprint source was fetched.

P6.3 adds Clear / Light haze / Marine layer and URL presets. An analytic integral handles rays crossing
the 200 ± 40 m ceiling; two advected sine fields vary density without volumetric marching. Sun intensity
and its disc dim below the layer. The equations are composed from resolved depth in the final image graph and bloom prefilter,
with marine horizon haze for sky pixels (decision P6-5). `?fog=off` skips the composition.

P6.4 adds four ferries on OSM routes, one water-checked cargo ship with instanced containers, pier foam,
stronger chop near the Golden Gate and night bridge lamps. Vessel sizes/speeds/motion are visual estimates.

**P6.5 passed on 2026-10-23.** Fog is composed from resolved reversed-Z depth instead of every
scene material. Same-page ABBA comparisons at three fixed viewpoints give upper-median GPU deltas of
+0.262 ms (Twin Peaks), +0.852 ms (Crissy/Golden Gate) and -0.655 ms (Ocean Beach, within timer noise).
The worst paired median is below the unchanged <1 ms target. Individual pairs remain noisy; all are retained.
Whole-city flight reaches 120 fps, with 855 MB retained heap after idle. Tests: 160/160. All six gallery images
were refreshed. Headless initialization remains unreliable, so the documented in-app browser fallback is used.
See `docs/perf-log.md`, `docs/review/p6/fog-final-benchmarks.json` and the gallery. Phase 6 is complete.

Implementation notes:
- The core terrain now dithers over its outer 50 m into regional ground. Interior regional quads are excluded;
  boundary vertices sample core heights and sit 0.15 m lower. Horizon/city edges use a 0.2 m inset and LOD skirts.
- Regional dashed centre paint follows mapped DataSF road segments, is clipped to the asphalt mask, and is
  culled by distance. Its markings are a visual estimate; detailed lane paint remains in the core.
- Regional boxes and trees are visual scenery, without new ground traffic or building collision meshes.
