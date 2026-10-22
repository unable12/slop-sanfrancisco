# Phase 4: the San Francisco look

**Objective.** Make the core read as San Francisco instead of "NYC buildings on hills":
- row houses with bay windows and garages, pastel stucco and painted wood;
- SoMa warehouses; downtown towers styled from the Tall Building Inventory;
- SF street furniture, real street trees, Muni details, cable cars, an SF vehicle fleet.

**Estimate.** 4 sessions. **Prerequisites.** P3 gate. Buildings v1 (P2.5) is the base: masses, `boxBase`, plinths, colliders.

---------------------------------------------------------------------------------------------------------------------

## Data available (✅ `docs/research.md` §4)
| Source | Fields | Use |
|---|---|---|
| Footprints | `base`, `roof`, `peak`, ring | Height; spires and roof structures (`peak − roof > 6 m`) |
| Land Use, joined by `mblr` ↔ `mapblklot` | `resunits`, `retail`, `cie`, `pdr`, `visitor`, `med` | Use mix → ground-floor retail, residential typology, industrial |
| Tall Building Inventory | `facade_material`, `stories_above_grade`, `typ_story_height`, `base_plan_size`, `tower_plan_size`, `completion_date` | Towers: storey height, facade material, podium/tower split |
| Street Tree Inventory | species, lat/lon, `dbhrange`, `planttype` | Real tree positions |
| Muni Simple Routes / Stops | route shapes, stop points | Bus stops; overhead wire routes ❓ (which routes are trolleybus: check OSM `trolley_wire=yes` on ways or route `trolleybus` relations) |
| Bike Network | `facility_t`, `buffered`, `raised`, `contraflow` | Green paint, buffers |

No year-built field was found in the datasets checked. If needed, look for the Assessor's secured roll on DataSF (❓). Otherwise infer era from neighbourhood, height and lot width (a rule table, logged).

---------------------------------------------------------------------------------------------------------------------

## Tasks

### P4.1 Classification (offline, `tools/geo-buildings.mjs`)
Per building:
- front edges (facing a road corridor within 12 m) and front width;
- row membership (shared walls ≥ 3 m);
- land-use join.

Rule table in `tools/building-rules.json`, with thresholds logged; tune with a type-coloured SVG of the core (`docs/review/p4/types.svg`):

| Type | Rule (starting point) |
|---|---|
| `tower` | roof − base ≥ 60 m, or in the Tall Building Inventory with ≥ 15 storeys |
| `midrise` | 25–60 m |
| `office-low` | 8–25 m, `cie` or `retail` dominant, front width > 15 m |
| `warehouse` | footprint > 800 m², < 20 m, `pdr` > 0 or SoMa/waterfront |
| `rowhouse` | 6–14 m, front width 5–10 m, in a row of ≥ 3, `resunits` 1–3 |
| `flats` | 9–16 m, front width 7–12 m, `resunits` 2–8 |
| `apartment` | 12–30 m, larger footprint, `resunits` > 8 |
| `civic` | `med`/`visitor` dominant or named civic (OSM) |
| `shed` | < 5 m |
| `landmark` | P5 list |

Write `type`, `palette`, `bays`, `garage`, `retail`, `era` into the binary.

### P4.2 Row houses and flats (`js/sf-buildings.js`, new; called from `commit()`)
- **Bay windows.** Box protrusions on the front wall, 0.8–1.0 m deep. Count = `floor(frontWidth / 3.5)`, capped at 2 for rowhouses. Angled bays use 3 thin boxes (instanced).
- **Garage door** at the low end of the front on sloped lots (`drop > 0.6 m` → garage at the downhill side), else an entrance with stairs (stoop) when the front sits more than 0.5 m above the sidewalk.
- **Cornice and parapet.** A flat roof with a bracketed cornice (reuse the cornice detail pool); about 30% get a false-front gable (wedge geometry).
- **Light wells** are not modelled. Party walls are blank stucco.
- **Palettes** (`js/sf-style.js`): per-row palettes of 4–6 hues chosen by neighbourhood, colour per building from a row-hash, white or contrasting trim.
  - The palette is a per-instance attribute; materials stay shared.
  - Keep the material count at NYC levels (no draw-call growth).
- **Night:** lit window fraction by type.

### P4.3 Towers, midrise, warehouses, civic
- **Towers:**
  - storey height from the inventory (else 3.9 m);
  - podium/tower split from `base_plan_size` vs `tower_plan_size`, else from the footprint;
  - facade material mapped to existing shaders: glass → curtain wall, concrete/stone → prewar/postwar, metal panel → a new tint;
  - crown from `peak − roof`: setback box, mechanical penthouse, or spire.
- **Warehouses:** brick or concrete; big multi-pane windows; roll-up doors on fronts; loading docks on alleys.
- **Civic:** plain stone with a colonnade band (simple).

### P4.4 Street furniture and paint
Restyle and add assets (all procedural, in the NYC style):
- cobra-head street lights;
- Muni stop poles and shelters at Muni Stops;
- overhead trolley wires on trolleybus streets (two wires at 5.5 m, span wires to poles every 30–35 m, instanced);
- parking meters downtown;
- fire hydrants;
- bike lanes from the Bike Network (green paint and buffers);
- red/white curb paint at stops (optional).

Remove NYC items: steam stacks, scaffolding sheds (keep rare), NYC signage, yellow-cab stands.

### P4.5 Street trees from the inventory
Map species to 4–5 visual classes using NYC tree builders (`trees.js`): London plane, ficus, palm, generic broadleaf, conifer. Use the trunk size from `dbhrange`. Only trees with valid coordinates on sidewalks (within a curb island); others are logged. Instance and cull by chunks.

### P4.6 Vehicles and transit
1. **Fleet:**
   - replace NYC yellow taxis and NYPD cruisers with a mix: sedans, SUVs, delivery vans, rideshare-style cars, a few cars with roof sensor pods, SFPD-style cruisers;
   - Muni buses: look up the livery colours on the web; describe them in `docs/landmarks/muni.md` with sources.
2. **Light rail / streetcars:** trams along OSM `tram`/`light_rail` ways on the Embarcadero and Market St (F/E lines). A rail-bound vehicle on a polyline with stops; reuse bus logic with a fixed path.
3. **Cable cars:**
   - lines along Powell, Mason, Hyde and California streets (build the polylines from street centrelines by name between the termini; OSM rail ways where they exist);
   - the vehicle is a hand-modelled open-sided car; constant 15 km/h-equivalent cable speed; stops at intersections;
   - rails rendered as paint plus a slot in the road mask.
4. Turnaround at Powell and Market: P5 landmark.

### P4.7 Gallery and perf
- Gallery `docs/review/p4/` with shots: row houses on a slope (Russian Hill), Chinatown, a downtown canyon, SoMa warehouse block, Embarcadero tram, cable car on California St, and the same street at night.
- Benches must still meet budgets.

---------------------------------------------------------------------------------------------------------------------

## Gate (P4)
- [x] Type distribution report and SVG. (`docs/reports/building-types-core.md`, `docs/review/p4/types.svg`.)
- [x] Gallery shows SF character (self-review notes in the gallery index: what reads well, what does not).
      (`docs/review/p4/index.md`: 14 shots and the type map, with a self-review and known issues.)
- [x] Budgets met; tests green (add `tests/buildings-runtime.test.cjs`: masses inside blocks, collider counts, spatial queries).
      (Two runs per bench: street 161, 169; car 152, 152; heli 137, 139; hill 123, 127; russian-hill-view 127, 127 fps;
      live heap ≤ 587 MB; ready ≤ 5.9 s; 0 errors. Tests 136/136, with `buildings-runtime` and `transit`.)
- [x] Logs and handover. (`docs/perf-log.md`, `PLAN.md` §10 P4-1 … P4-7 and §11, `docs/handover.md`.)

## Results (2026-10-22, one session)

- **P4.1** `tools/geo-buildings.mjs` joins Land Use by block-lot (94.8%; else the parcel under the centroid) and the Tall
  Building Inventory (174 of 179 records, by ring then lot). It finds each building's front (the widest facing within
  12 m of the road), its ground drop along the front, its row (shared walls ≥ 3 m) and its neighbourhood (nearest
  street's `nhood`), and types it by `tools/building-rules.json`. The binary is now version 3 with `type, palette,
  bays, garage, era, frontW, row, storeyH, stories, facade, podium` (`docs/formats.md`). Report:
  `docs/reports/building-types-core.md`; map: `docs/review/p4/types.svg`. Of 15,735: rowhouse 4,507, flats 3,068,
  apartment 2,848, office-low 2,756, shed 713, midrise 695, warehouse 522, civic 422, tower 192, landmark 12. The
  rule-table changes are decision P4-1.
- **P4.2** `js/sf-style.js` holds the palettes (five neighbourhood sets) and surfaces by type. The masonry facade
  material gained a `paint` mode with per-instance wall and trim colours, a surface (brick, stucco, wood siding,
  panels) and a lit-window share. Paint mode also gives tar-grey roofs and drops AC units and ghost signs. `boxBase` is
  vec3 with a per-box storey height. `js/sf-buildings.js` `sfFrontDetails` lines up with the shader's window bays and
  adds:
  - bay windows (square, or angled from three boxes) from the second storey up;
  - a garage at the downhill end of the front, the entrance moved uphill;
  - stoops sized to the sidewalk;
  - on fronts too high for a stoop, a street-level door and a garage under the floors;
  - false-front gables on 30%.
  No bulkheads on row houses, flats or sheds. Count: 24,214 bay boxes and 1,714 gables.
- **P4.3** Towers take their storey height, facade material and podium from the inventory (P4-3). Crowns come from the
  lidar peak: penthouse, setback block, or setback and spire. Warehouses get multi-pane windows, roll-up doors and
  docks on alleys; civic buildings get engaged colonnades.
- **P4.4** Pipeline: `GEO.trolley`, `GEO.muniStops`, `GEO.bikeways`. Runtime: 603 Muni stops (228 shelters), 80.7 km of
  trolley wire pairs on 2,124 poles (1-pixel lines), 13,731 parking meters downtown and 742 bike lanes (`road-paint.js`).
  The old "green lane on wide one-way avenues" rule is gone, and no NYC street furniture is built in SF mode (P4-4).
- **P4.5** `GEO.trees`: 27,918 standing trees in five looks (`tools/tree-classes.json`). `trees.js` gained ficus,
  palm (frond cards) and conifer recipes and a palm bark. 22,886 are planted, 3,693 of them moved ≤ 2 m onto the
  sidewalk; 5,032 are left out (P4-5).
- **P4.6** Fleet: police cruisers 1 in 20, black and white with white doors (SFPD's scheme unverified); robotaxis 1 in
  7; vans; SF sedan colours; white plates (the player's car reads "California"); Muni buses silver and red. Transit:
  `GEO.transit` from the OSM route relations (rail query now `out geom`), and `js/sf-transit.js` with 10 F-line
  streetcars, 10 Muni Metro cars and 30 cable cars on 14 runs, braking into the stops, cable cars at 15 km/h, and the
  cable slot painted between the rails. Sources and simplifications: `docs/landmarks/muni.md` (P4-6).
- **P4.7** Gallery `docs/review/p4/` (14 shots + the type map). New tests: `tests/buildings-runtime.test.cjs` (the
  real `buildCityBlocks` in vm: masses on curb islands, colliders, quadtree, details) and `tests/transit.test.cjs`.
  The probe now reports `heapLiveMB` (forced GC) and the `[details]`, `[buildings]` and `[paint]` counts.

