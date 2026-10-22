# File disposition: what happens to every NYC file (revision 2)

Baseline: `slop-newyork@0049a49`. Line numbers for the specific spots are in `docs/research.md` §3.

| Disposition | Meaning |
|---|---|
| Keep | Unchanged |
| Modify | Targeted changes |
| Rewrite | Keep the export shape, replace the body |
| Drop | Delete when the replacement works |

The internal namespace `window.NYC` / `__NYC_APP` stays (D2).

## Client code (`js/`)

| File | Lines | Disposition | What changes | Phase |
|---|---|---|---|---|
| `actor-models.js` | 1952 | Keep → small additions | SF fleet models (bus livery, sensor-pod cars, SFPD), cable car, tram | 4 |
| `boroughs.js` | 3394 | Not loaded since P1 (decision P1-2); drop after porting | `buildBuildingChunks`, window-grid shader, mask-driven ground shader → `region.js` | 6 |
| `buildings.js` | 2636 | Modify heavily | New v1 path: footprint masses → `commit()` → facade boxes; `minY` colliders; quadtree over data bounds; NYC recipes, avenue/district tables and landmark reserves removed once v1 passes | 2, 4 |
| `cameras.js` | 352 | Modify lightly | y ≥ ground + 0.55; terrain-aware boom | 2 |
| `city-config.js` | 809 | Rewrite internals, keep exports | Generic functions kept; NYC tables replaced by SF data or emptied; `ISLAND_BOUNDS` / `getIslandBoundsAtZ` become land-polygon based (same names) | 1 |
| `city-grid.js` | 3515 | **Dropped in P2.12** | Superseded by `sf-ground.js` + `terrain-mesh.js` + `drape.js` (decision P1-1); its globals' readers (`buildings.js`, `street-details.js`, `cameras.js`, `landmarks.js`) fall back without them | 2 |
| `controllers.js` | 1175 | Modify | `getGroundHeight` → terrain; real `yHeight`; `minY`; car/cyclist pitch and roll; grade physics; heli clearance | 2 |
| `landmarks.js` | 1076 | Rewrite content | SF landmarks; keep `fitToSite` | 5 |
| `lighting.js` | 308 | Modify | Shadow far relative to ground (P2); marine layer extends the existing `fogNode` (P6). No sun lat/lon work (presets) | 2, 6 |
| `main.js` | 707 | Modify | `FEATURES`, URL params, bench paths, `debug` API, data loading, build order | 1, 2 |
| `nyc-geodata.js` | 10 (1.1 MB) | Replace → `sf-geodata.js` | Generated | 1 |
| `nyc-map.js` | 1292 | Modify → `sf-map.js` | SF layers, hillshade, radar zoom by height above ground (P2), rename (P7) | 2, 7 |
| `pedestrians.js` | 1502 | Modify lightly | PersonRig `ground()` callback → terrain (already callback-based) | 2 |
| `post-processing.js` | 74 | Keep | Check pass order with fog | 6 |
| `road-network.js` | 1223 | Modify | Delete ~200 grid lines; `centrelineStreets()` becomes the only source; land polygon; edge height profiles; 3D curves; signal/stop control from data | 2 |
| `road-paint.js` | 115 | Modify | Ribbons draped on terrain | 2 |
| `scene-culling.js` | 328 | Modify lightly | Terrain chunks in shadow proxies if needed; cell sizes | 2, 3 |
| `street-details.js` | 1212 | Modify heavily | Signals at data nodes (lens shader base y), stop signs, lamps along links (P2); SF furniture, Muni, wires (P4); NYC placements removed | 2, 4 |
| `touch-controls.js` | 170 | Keep | | n/a |
| `traffic.js` | 2337 | Modify | City lanes in 3D (reuse highway maths), y fixes, stop control, grade dynamics, crosswalks at all controlled nodes along arm directions (P2); fleet, trams, cable cars (P4) | 2, 4 |
| `trees.js` | 992 | Modify | Ground y; inventory placement; species classes | 2, 4 |
| `tsl-materials.js` | 3156 | Modify + add | `boxBase` / `plinth` attributes for facade shaders (P2); ground-mask terrain material (P2); SF palettes and stucco (P4) | 2, 4 |
| `vehicle-lights.js` | 39 | Keep | Already follows slope (tested) | n/a |
| new `data-loader.js`, `sf-ground.js`, `sf-buildings.js` (exist since P1); `terrain.js`, `terrain-mesh.js`, `grade-separation.js` (P3.3), `sf-style.js`, `region.js` | | Create | | 1, 2, 3, 4, 6 |

## Page and styles

| File | Disposition | Notes | Phase |
|---|---|---|---|
| `index.html` | Modify | Pin three.js (P1.2); script list (P1, P2); title/HUD/teleports/attribution (P7) | 1, 2, 7 |
| `css/style.css` | Modify lightly | Branding only | 7 |

## Tools (`tools/`)

| File | Disposition | Phase |
|---|---|---|
| `build-geodata.mjs` | Rewrite as orchestrator | 1 |
| `geo-base.mjs` | Modify: SF frame, no rotation, GeoJSON loader, `fromWorld`; keep RDP/raster/EDT helpers | 1 |
| `geo-streets.mjs` | Drop (names come from the graph) | 1 |
| `geo-blocks.mjs` | Fallback only (D6); `lotRects` → `rect-cover.mjs` | 1, 2 |
| `geo-extra.mjs` | Rewrite: coast, piers, parks, water, islands | 1 |
| `geo-roadgraph.mjs` | Rewrite for DataSF (node CNNs, widths from curbs, control) | 1 |
| `overpass.sh` | Keep | 1 |
| `benchmark-pedestrians.mjs` | Keep | 2 |
| `data/*.json` | Not imported (D1) | 1 |
| new `fetch-geodata.mjs`, `boxes.json`, `queries/*.overpassql`, `geo-curbs.mjs`, `geo-terrain.mjs`, `geo-buildings.mjs`, `rect-cover.mjs`, `check-roadgraph.mjs`, `check-road-smoothness.mjs`, `serve.mjs`, `package.json` (dev only), `dev/probe.mjs` (exists), `dev/shots.json` | Create | 1-6 |

## Tests (`tests/`, run with `node --test tests/*.test.cjs tests/*.test.mjs`)

| File | Disposition |
|---|---|
| `boot.test.cjs` | Keep; update for the script list |
| `cameras.test.cjs` | Keep; add the terrain clamp case |
| `controllers.test.cjs` | Extend: slope contact, pitch, heli clearance, `minY` |
| `facade-projection.test.cjs` | Keep; add base-y parity (`facade-base`) |
| `geodata.test.mjs` | Rewrite: loads `sf-geodata.js` (fast); slow rebuild test separate and skips without raw data |
| `nyc-map.test.cjs` | Keep until P7 rename → `sf-map.test.cjs` |
| `overpass.test.mjs` | Keep |
| `smoke-texture.test.cjs` | Keep |
| `teleports.test.cjs` | Rewrite destinations; same structure |
| `touch-controls.test.cjs` | Keep |
| `traffic-performance.test.cjs`, `traffic.test.cjs` | Keep; may need updated regex extractions after refactors |
| `vehicle-lights.test.cjs` | Keep |
| new | `terrain-data`, `terrain`, `facade-base`, `road-network`, `traffic-sim`, `buildings-runtime`, `region-data`, `no-nyc-text` |
