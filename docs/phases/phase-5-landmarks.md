# Phase 5: landmarks and set pieces

**Objective.** Hand-modelled, recognisable SF landmarks placed on their real sites, replacing the generated buildings at those
sites, plus the big set pieces (bridges, Lombard Street, cable-car lines).

**Estimate.** 3 sessions. **Prerequisites:**
- P3 gate (terrain, buildings v1, core data);
- landmark names matched in the building pipeline (P4.1 `landmark` type; if P4 has not run yet, add the landmark override to `tools/geo-buildings.mjs` here).

**Verified OSM facts** (`docs/research.md` §6): footprints with heights exist for Transamerica (260 m), Salesforce Tower (326 m),
Coit Tower (64 m), Grace Cathedral (53 m), Palace of Fine Arts (48 m), Chase Center (38.1 m), City Hall (30 m, relation),
Ferry Building (15 m main hall), Conservatory of Flowers (15 m), de Young (13 m, relation).

Sutro Tower and Oracle Park were **not** found by a name query on `building`/`man_made`. Search by other tags
(`man_made=mast`, `tower:type`, `leisure=stadium`) or by `wikidata`.

---------------------------------------------------------------------------------------------------------------------

## How NYC does it (✅ `js/landmarks.js`, 1076 lines)

- Landmark footprints come from OSM (`tools/data/osm_landmarks.json`, query `q_landmarks.overpassql` lists names). `build-geodata.mjs`
  turns them into `GEO.landmarks[name] = { x, z, w, d, h, area, ring }` (grid-aligned bounding box + real ring). `city-config.js` exposes
  them as `LANDMARK_SITES`.
- `landmarks.js` builds geometry for a small set of landmarks from primitives with TSL materials, then `fitToSite(objs, site, c0, { height, horizontal, stretch, offset, name })`
  scales/rotates/places a prebuilt object group onto the real footprint. Colliders returned to `main.js`.
- Landmark blocks are excluded from generated buildings (`LANDMARK_BLOCKS`/`voidLots`).

For SF: same mechanism, SF list, SF models, terrain-aware placement (base at the minimum ground under the site, plinth to the downhill side).

---------------------------------------------------------------------------------------------------------------------

## Method for each landmark (repeat per item)

1. **Facts.** Collect height, footprint, orientation, notable features from the data (OSM tags, footprint dataset) and from
   public sources via web search. Record sources in `docs/landmarks/<slug>.md` (3-10 lines: facts, source URLs, what is simplified).
   Do not invent numbers: if a dimension is unknown, mark it estimated and keep proportions from silhouettes you can verify.
2. **Site.** Resolve the site from OSM (Overpass by name) into `GEO.landmarks`; verify it lies on land and inside the intended block; read the
   ground elevation range under it.
3. **Model.** A function `buildXxx(group, mats, site, ground)` in `js/landmarks.js` (or `js/landmarks/<slug>.js` if the file grows past ~1,800 lines;
   register in the `sfAppScripts` list). Use primitives, `ExtrudeGeometry` from outlines, instancing for repeated elements. Materials come from
   `tsl-materials.js`; add new TSL materials only if needed (record in the file header).
4. **Fit.** Call `fitToSite`. Add colliders (box or OBB with `minY`/`maxY`).
5. **Verify.** Take three named shots (street level near, mid-distance, heli) into `shots/landmarks/<slug>-*.png`; compare with 2 reference photos found on the web by
   eye (do not copy imagery; reference only). Fix proportions until the silhouette matches. Append a line to `docs/landmarks/INDEX.md` with the shot file names and the verdict.
6. **Budget.** Triangles and draw calls per landmark logged; each landmark < 2% of the frame budget; instance everything repeated.

---------------------------------------------------------------------------------------------------------------------

## Landmark tiers

Tiers decide order and scope. Items outside the list need the user's OK (R9).

### Tier 1: the skyline and the postcards (must ship)
| Landmark | Notes |
|---|---|
| Transamerica Pyramid | Pyramid with wings; verify wing geometry from photos; white quartz look |
| Salesforce Tower | Tapered tower with rounded crown; glass material, crown LED lighting at night (optional animation) |
| Ferry Building | Clock tower, long arcaded hall, waterfront plaza; pier access |
| Coit Tower | Fluted column on Telegraph Hill; verify the hill site and approach stairs are not needed |
| Golden Gate Bridge | Set piece; far from the core; built as long-range model (towers, cables, deck, approach); detail level for heli fly-by; orange-vermilion colour, fog interplay in P6 |
| Bay Bridge (west span) | Double suspension spans with central anchorage + the eastern cantilever section as a simplified distant model; deck lights |
| Sutro Tower | Skeletal triple-mast TV tower; instancing of lattice segments; visible from everywhere |
| City Hall | Dome, symmetric plan, plaza |
| Palace of Fine Arts | Rotunda + colonnade + lagoon |
| Oracle Park | Ballpark ring with light towers, bay side open outfield; reuse stadium structures from NYC if any (check `landmarks.js`) |

### Tier 2
| Landmark | Notes |
|---|---|
| Grace Cathedral | Twin towers, rose window texture via TSL |
| Painted Ladies (Alamo Square row) | Use the row house generator with fixed Victorian features and the postcard palette; park with city view |
| Lombard Street crooked block | Terrain+road special case; switchback road shape in the road graph; flower beds; one-way down (data-driven) |
| Alcatraz | Island polygon, cell house, water tower, lighthouse; low detail |
| Fort Point and Crissy Field shore | Brick fort under the bridge; beach material |
| Chase Center | Arena massing |
| Pier 39 | Pier with sea lion docks (instanced simple animals optional) |
| Ghirardelli Square sign | Rooftop sign, brick complex |
| Conservatory of Flowers | Glass house with white framing |
| de Young Museum tower | Twisting tower on copper-clad building |
| Salesforce Park | Elevated park on transit centre roof |
| Embarcadero Center and 555 California | Dense downtown fixtures; likely handled by generated tower rules |
| Mission Dolores | Small, white adobe church |
| Painted staircases, Filbert Steps | Skip unless time remains |

### Tier 3 (optional, only with the user's OK)
Cable car turntable at Powell and Market, Muni Metro portals, BART station kiosks, Ocean Beach Great Highway, Dolores Park palm row, Flood Building flatiron,
Wells Fargo history museum... (all of these must be justified by visible value per hour of work).

---------------------------------------------------------------------------------------------------------------------

## Set pieces

### Bridges
- NYC has four East River bridge builders in `city-grid.js`/`boroughs.js` (`EAST_RIVER_BRIDGES`, `makeBridge` in `city-config.js`, necklace lights) and
  distant GWB/Verrazzano models. Read these first. Reuse the suspension logic (towers, main cables with catenary, suspenders, deck with lamps, approach spans) for
  both SF bridges. Parameters from data: tower positions (OSM nodes/ways), deck heights, span lengths. Anything else is estimated and labelled in the landmark notes.
- Bay Bridge: western double suspension + central anchorage; eastern span as a simple cantilever silhouette to Yerba Buena Island; tunnel portal on Yerba Buena (simple). Deck uses a grade-separated road link (flag `bridge`) so a car can drive on it if included in the graph. Decide in P5.2 whether the bridge is drivable; default: **visual only**, with a non-drivable fence.
- Golden Gate: visual in the core view; drivable is a stretch goal, off by default.

### Lombard Street (visuals)
Driving works since P3.4. Here add:
- the brick paving (road mask class);
- planted beds between the switchbacks (instanced boxes with colour noise);
- the stairs on both sides (stepped boxes following the terrain);
- the view from the top as a teleport.

### Cable car turntable
P4.6 runs the cable cars. Here add the turntable at Powell and Market as a small landmark: a turntable disc, a queue rail, and the cable car rotating at the end of each run.

---------------------------------------------------------------------------------------------------------------------

## Tasks

### P5.1 Landmark pipeline for SF
1. `tools/queries/landmarks.overpassql` with the names above (single quoted regex like NYC's, split into several queries if the regex gets too long).
2. Extend `geo-extra.mjs` to build `GEO.landmarks` (keep NYC's output shape; add `base`, `topH`, `kind`).
3. P4.1 type override: any footprint whose name or whose centroid lies in a landmark ring is `landmark`; the generated mass is suppressed.
4. Test: every landmark in the list resolves to exactly one site on land; list unresolved names in the progress log.

### P5.2 Bridge set pieces (Golden Gate, Bay Bridge)
Build a generic `buildSuspensionBridge(scene, spec)` from the NYC bridge code; two specs. Check scale: spans in metres from data; deck height above water.
Far-view LOD: merge instanced suspenders; only the main cables and towers are visible beyond 3 km.
**Acceptance:** shots from Crissy Field, from the heli above the bridge, from Twin Peaks (silhouette only).

### P5.3 Tier 1 buildings
Per landmark per the method. Order: Transamerica, Salesforce Tower, Ferry Building, Coit Tower, City Hall, Sutro Tower, Palace of Fine Arts, Oracle Park.
After each: note the files for the next commit batch (RUNBOOK §8); log shots in `docs/landmarks/INDEX.md`.

### P5.4 Tier 2
Same method. Skip any item whose facts cannot be found; record why.

### P5.5 Lombard Street and Alamo Square
Special cases as above.

### P5.6 Integration
- Teleports for Tier 1 landmarks: P3.5 already placed them; check that each still faces its landmark.
- Colliders: give every landmark `minY`/`maxY`, and check them with the controllers test.
- Perf pass: record landmark triangle totals and fix outliers.
- Gallery `docs/review/p5/` with three shots per Tier 1 landmark.

---------------------------------------------------------------------------------------------------------------------

## Deliverables
`js/landmarks.js` (and per-landmark files), bridge builder, data, `docs/landmarks/*`, shots, tests.

## Risks
| Risk | Mitigation |
|---|---|
| Recognisability needs details we do not know | Use silhouette-defining features first (height ratios, crown, towers); ask the user to veto a landmark that looks wrong rather than polishing forever |
| Bridge scale and distance cause z-fighting / precision issues | Reversed depth buffer is already on; cull small details; split large cable geometry into sections near the camera |
| Large far landmarks cost fill rate with SSR/bloom | Exclude from SSR layers; check performance at the Crissy Field vantage |
| Copyright of reference imagery | Reference only, never embed; models are original geometry |

## Handoff checklist
- [ ] Tier 1 complete and logged with shots
- [ ] Tier 2 status per item
- [ ] Perf log, progress log, decision log
