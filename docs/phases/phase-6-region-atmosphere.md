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
- [ ] Whole-city views within budgets; fog states captured.
- [ ] Tests green; data files < 50 MB each.
- [ ] Logs and handover.
