# Research log (evidence behind the plan)

Collected on 2026-10-22, before any build work. Everything here was checked by running a query, a script or the app;
nothing is from memory. When a later session finds something different, add a dated note below; do not silently edit.

---------------------------------------------------------------------------------------------------------------------

## 1. Machine and tools

| Item | Value |
|---|---|
| CPU / RAM | Apple M4 Pro, 14 cores, 48 GB |
| Free disk | ~209 GB |
| Node | v26.7.0 (has global `fetch` and `WebSocket`) |
| Python | 3.14.6, **no numpy** |
| GDAL | **not installed** (`gdalinfo`, `ogr2ogr` missing). Homebrew is present, but installing system packages is not planned |
| jq, curl | present |
| Google Chrome | 154.0.8037.95 at `/Applications/Google Chrome.app` |

## 2. NYC baseline (`mrdoob/slop-newyork@0049a49`, HEAD at 2026-10-22T07:25Z)

### Tests
- `node --test tests/` **fails** on Node 26 (the directory argument is treated as a file).
- `node --test tests/*.test.cjs tests/*.test.mjs`: **97 tests pass** in ~16 s. Use this form.
- `geodata.test.mjs` runs `tools/build-geodata.mjs` against `tools/data/*.json` (180 s timeout, 8 GB heap). It therefore depends on the NYC raw data.

### Running it
- **Headless Chrome works with the real WebGPU backend.** `renderer.backend.isWebGPUBackend === true`, adapter `apple/metal-3`. Probe script: `tools/dev/probe.mjs` (CDP over the Node global WebSocket, no dependencies).
  - Flags: `--headless=new --enable-unsafe-webgpu --enable-gpu --use-angle=metal --ignore-gpu-blocklist --disable-gpu-vsync --disable-frame-rate-limit`, viewport 1280×720, DPR 1.
- **Baseline numbers** (headless, 1280×720, uncapped):

  | Run | FPS | JS heap | Ready after | Console errors |
  |---|---|---|---|---|
  | Pinned three.js | 92–98 | 650–820 MB | 5–12 s | 0 |
  | `@dev` (as of today) | n/a | n/a | n/a | 0 |

  - The `[init]` timings sum to about 11 s. The two largest are shader compile (5.1 s) and GPU warm-up (3.3 s).
- **In-app browser pane:**
  - It ran the live demo at about 90–104 fps (1024×768).
  - It also logged about 2,000 WebGPU "binding size is zero" validation errors. The cause is unknown; they did not reproduce in headless Chrome.
  - When this session's window is not on screen, the pane is hidden. The page then has a 0×0 viewport and rendering fails.
  - So the pane is only usable while the user is watching. Unattended verification must use headless Chrome.
- **Debug hook already exists:** `window.__NYC_APP` (main.js:508-530). It holds `renderer`, `scene`, `cityBlocks`, `trafficSystem`, `controllerManager`, `cameraSystem`, `getFps` and more. `.ready` becomes true after the first GPU frame (main.js:672). There are no URL parameters yet.

### three.js pin candidates
| Candidate | Notes |
|---|---|
| `gh/mrdoob/three.js@bc7d0b3c3838d5da9495b5e603afd77ed3154d57` | Last dev commit before NYC's HEAD time. REVISION `187dev`. Verified: boots, 0 errors, WebGPU backend. **Use this.** |
| `npm/three@0.186.1` | Latest release. Has every addon NYC imports (SunLight, SunLightNode, ClusteredLighting, SSRNode, BloomNode, SkyMesh). Not tested with NYC; NYC was built on 187dev. |

## 3. NYC engine facts that matter for terrain

Gathered by a read-only code study; line numbers refer to the baseline.

### Ground and geometry
- **Ground slab:** the road is one flat polygon at y = 0 (city-grid.js:1486-1488). Curbs and sidewalks are 0..0.22 (1510-1560). Parks sit at constant heights.
- **Facade shaders use absolute world y** for floors and storefronts (tsl-materials.js:165-166, 438-445, 1700). Buildings on a hill would get misaligned floors. **Must add a per-instance base y.**
- **Signal lens shader** thresholds on absolute world y (street-details.js:62-64).

### City traffic (traffic.js)
- Lanes are xz only: `lanePoint` (1063-1069) and `locate` (1085-1096). Pitch and roll come only from acceleration and yaw rate (1108-1130).
- Rendering hard-codes y: body at y = 0 (1583, 1661); wheels at the wheel radius (1550, 1554); shadows at 0.018 (1617, 1654); headlights at y = 0 (1726).
- `visible()` tests the point at y = 1 (533).
- `player.active` requires `y < 2.6` (1842), which breaks on hills.
- Pedestrian ground is a constant (`pedGround`, 1770-1778).

### Highway traffic and pedestrians
- **Highway traffic is already 3D:** `createHighwayTraffic`, traffic.js:1973-2335. Its lanes are Vector3 lists, with arc length in 3D and pitch `-atan(slope)`. `traffic.test.cjs` already tests sloped and elevated lanes. **Reuse its math for city lanes.**
- **PersonRig takes a `ground(owner, x, z)` callback** per foot and pelvis (pedestrians.js:1062, 1136, 1142, 1210). It is already terrain-ready.
- **Pedestrian tracks:**
  - Sidewalks run parallel to edges at `half + 1.4..4 m` (traffic.js:1364-1385).
  - Crosswalks exist only at signal nodes and are axis-aligned (1391-1430).
  - **SF needs crosswalks at stop-controlled nodes and at any angle.**

### Road network (road-network.js)
- About 200 grid-specific lines; about 1,000 generic.
  - Grid parts: avenue corridors 101-192; cross streets 194-228; grid nodes 230-244; grid edges 445-467; signals 1062-1068.
  - `centrelineStreets()` (251-426) builds general edges from `GEO.roadGraph` (`nodes` flat [x, z]; `links` [a, b, nameIdx, w, lanes, dir, innerPts]).
- Edges and curves carry **no y** (443, 487, 750-752, 1161-1219).
- `onLand` uses `getIslandBoundsAtZ` (51-57). It is used by the generic `walkable` / `blocked` paths too, so it must be replaced by a polygon or terrain land test.
- Signals: a node is signalised if it lies within 4 m of an `AVENUES` × `STREETS` crossing (1062-1068).

### Controllers and cameras
- **Colliders** are `{minX, maxX, minZ, maxZ, maxY, obb?}` with an absolute `maxY` (controllers.js:796, buildings.js:273-284). There is no `minY`.
  - Car and cyclist pass a constant `yHeight = 1.0` (1044, 1105).
  - The helicopter is clamped to y 0.25..380 (1160).
  - `getGroundHeight` (710-725) is constants only.
- **Cameras** clamp y ≥ 0.55 (cameras.js:184, 338).

### Other modules
- **road-paint.js** is flat quads at a constant height (22-31).
- **lighting.js:**
  - The sun direction is per time preset, with no lat/lon (16-110).
  - **Fog already exists**: `FogExp2` (137) plus an aerial `fogNode` with height falloff H = 900 m on absolute y (212-236).
  - Shadow far grows with absolute y (303).
- **scene-culling.js** is y-agnostic if geometry is baked at world y. It **breaks if y is added by vertex displacement** (shadow proxies keep real vertex y).
- **buildings.js:**
  - The main loop runs over `BLOCKS` → frames → rects → `populateBlock` (1997-2015, 1810-1885).
  - Streaming quadtree: `STREAM_RADIUS` 560 m, re-query after an 18 m move, capped detail pools (2189-2192, 2400-2420).
  - Facade massing is static and island-wide.
- **boroughs.js:**
  - A land-use texture (31 m/texel) plus a zone texture drive a procedural ground (686-807).
  - Buildings use `buildBuildingChunks(list, mat, 1200)`: one InstancedMesh per 1,200 m chunk, frustum culled, no shadows (1856-1905). **Reusable for SF's region with real footprints.**
- **nyc-map.js:**
  - Canvas 2D `Path2D` layers on 500 m tiles; radar canvas cached (167-210, 995-1007).
  - Radar zoom uses absolute y (983).
- **index.html** script order (12-37): nyc-geodata, city-config, tsl-materials, trees, actor-models, vehicle-lights, pedestrians, lighting, city-grid, boroughs, buildings, landmarks, street-details, road-network, road-paint, traffic, controllers, touch-controls, cameras, nyc-map, scene-culling, post-processing, main.

## 4. San Francisco data (all verified by querying the source)

DataSF moved to **`data.sf.gov`**: the old host redirects, so use `curl -L`.
- **Query:** `https://data.sf.gov/resource/<id>.geojson?$where=within_box(<geom>, latN, lonW, latS, lonE)&$limit=50000`
- **Metadata:** `https://data.sf.gov/api/views/<id>.json`
- **Search:** `https://data.sf.gov/api/search/views.json?q=...`

The global Socrata catalog API returned nothing for this domain, so do not use it.

| Dataset | ID | Rows | License | What we use | Notes |
|---|---|---|---|---|---|
| Building Footprints | `ynuv-fyni` | 177,023 | PDDL | `shape`, `gnd_min_m` (NAVD88 m), `hgt_median_m`, `peak_1st_m` (NAVD88 m), `sf16_bldgid`, `mblr` | **Height fields are 100% non-null.** Lidar zonal statistics on 50 cm cells. Names (`p2010_name`) are useless (Pictometry filenames); take names from OSM. Rings are lidar-traced: median 23 vertices, p95 52 |
| Streets – Active and Retired | `3psu-pn9h` | 17,176 (16,395 active) | PDDL | `line`, `cnn`, `f_node_cnn`, `t_node_cnn`, `streetname`, `oneway` (B/F/T), `classcode` (0..6; 1 = freeway, 5 = residential), `layer`, `nhood`, `analysis_neighborhood` | **Topology given by node CNNs.** No width or lanes. Layers include STREETS, FREEWAYS, PAPER*, PARKS_NPS_PRESIDIO, PRIVATE, STREETS_PEDESTRI, STREETS_TI/YBI. Exclude `PAPER*`, `PSEUDO`, inactive |
| Curbs and Islands | `emxt-b6yg` | 7,195 lines | PDDL | Curb lines (layers CURBS, ISLANDS, CURBS_ALT) | **Real curb geometry** (2016 vintage). In a Nob Hill sample, 32 of 68 curb lines were closed rings; the open ones are blocks split at alley mouths (end gaps 3.7–7 m). Polygonise after closing short gaps |
| Sidewalk Widths (2014) | `4g86-grxu` | 16,174 | PDDL | `cnn`, `side`, `sidewalk_f` (ft; 0 = unknown, negative = varies) | 140 of 172 known in the sample; median 10 ft |
| Traffic Signals | `ybh5-27n2` | ~1,500 | PDDL | `cnn` (node), `type` = SIGNAL (1,290), `shape` | Also beacons, flashers |
| Stop Signs | `4542-gpa3` | 11,179 | PDDL | `cnn`, `st_facing`, `direction`, `shape` | **All-way and minor-road stops are available from data** |
| Street Tree Inventory | `tkzw-k3nq` | n/a | PDDL | `species`, `latitude`, `longitude`, `dbhrange`, `planttype` | Real tree positions |
| Muni Stops / Muni Simple Routes | `i28k-bkz6` / `9exe-acju` | n/a | PDDL | Stops, route shapes | Bus stops, overhead wire routes |
| MTA Bike Network Linear Features | `ygmz-vaxd` | n/a | PDDL | `cnn`, `facility_t`, `buffered`, `raised`, `contraflow` | Bike lane paint |
| San Francisco Land Use | `c5ge-t6pj` | n/a | CC0 | Per-parcel `resunits`, `retail`, `cie`, `pdr`, `visitor`, `open_space`, `mapblklot` | Use mix for typology. Join footprints by `mblr`/`mapblklot` |
| Recreation and Parks Properties | `gtr9-ntp6` | n/a | PDDL | Park polygons, names, acres | |
| Tall Building Inventory | `5kya-mfst` | n/a | PDDL | `height_ft`, `stories_above_grade`, `facade_material`, `typ_story_height`, `base_plan_size`, `tower_plan_size` | **Tower styling from data** |
| Elevation Contours | `6d73-6c4f` | n/a | PDDL | Not needed | Different vertical datum from NAVD88 |

### Nob Hill sample
Box 37.7965,-122.4205 → 37.7890,-122.4100; files in the session scratchpad, not kept.
- 1,465 buildings.
- Ground min 38–112 m NAVD88.
- `hgt_median_m`: p5 5.9, p50 12.0, p95 17.5, max 79.7 m.
- Peak minus ground: p50 15.1, max 144 m.
- 172 street segments: oneway B 97, F 42, T 33; class 5: 136, class 4: 29.

## 5. Terrain data

USGS TNM API:
```
https://tnmaccess.nationalmap.gov/api/v1/products?datasets=Digital%20Elevation%20Model%20(DEM)%201%20meter&bbox=-122.52,37.70,-122.35,37.83
```
- **CA_SanFrancisco_B23** (published 2024-08-26), 1 m GeoTIFF, UTM zone 10. Four 10 km tiles cover the city: `x54y418` (176.6 MB), `x54y419` (111.9 MB), `x55y418` (147.9 MB), `x55y419` (86.5 MB). About 523 MB total.
  - Download URLs come from the API response (`downloadURL`). Do not hand-type them.
- Also available: CA_CaliforniaGaps_B23 (2025), CA_AlamedaCounty_2021_B21 (East Bay edge), CA_NoCAL_Wildfires_B5b_2018.
- Not verified yet: whether the tiles are Cloud-Optimised GeoTIFFs. Reading needs a GeoTIFF reader; the plan uses the `geotiff` npm package in `tools/package.json`.
- Vertical datum NAVD88 (per the USGS 1 m DEM standard, stated in catalogue metadata). The bare earth is hydro-flattened, so the bay surface has a constant value. **Measure it and use it as the world water level.**

## 6. OpenStreetMap (Overpass, verified)

- **Landmark footprints with heights:**

  | Landmark | OSM height |
  |---|---|
  | Transamerica Pyramid | 260 m |
  | Salesforce Tower | 326 m |
  | Coit Tower | 64 m |
  | Grace Cathedral | 53 m |
  | Palace of Fine Arts | 48 m |
  | Chase Center | 38.1 m |
  | San Francisco City Hall (relation) | 30 m |
  | San Francisco Ferry Building | 15 m (main hall; the clock tower is taller, so model from photos) |
  | Conservatory of Flowers | 15 m |
  | de Young Museum (relation) | 13 m |

  Not found by that query: Sutro Tower, Oracle Park.
- **Rail:**
  - Muni Metro: `light_rail`, routes J/K/L/M/N/T, the Central Subway, and tunnels.
  - Streetcars: `tram`, E and F lines, plus 101 unnamed `tram` ways.
  - The **cable car lines were not identified** by name or tag. Find them in P1 (likely among the unnamed `tram` ways, or route relations).
