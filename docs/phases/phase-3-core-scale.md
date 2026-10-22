# Phase 3: scale from the slice to the core

**Objective.** The same engine and data pipeline, applied to the whole north-east quadrant:
- slice plus North Beach, Telegraph Hill, Russian Hill (with Lombard), Fisherman's Wharf, Union Square, SoMa to the ballpark, Civic Center;
- performance, memory and load time within budget;
- streaming where the slice did not need it.

**Estimate.** 3 sessions. **Prerequisites.** P2 gate.

---------------------------------------------------------------------------------------------------------------------

## Tasks

### P3.1 Fetch and build the core
1. Define the `core` box in `tools/boxes.json` from data: the union of the bounding boxes of the neighbourhoods listed above (`analysis_neighborhood` on streets), plus 300 m. Record its size in km and the counts of buildings, links and nodes.
2. `node tools/fetch-geodata.mjs --box core`, then build.
3. **Size check:**
   - `terrain-core.bin` at 2 m; expect ~4-5 km sides, so ≈ 4-6M samples ≈ 8-12 MB raw;
   - buildings;
   - geodata.
   - If any file is over 50 MB, split by 1 km tiles (`data/tiles/<tx>_<tz>/...`) and make `data-loader.js` tile-aware.
4. **Reports** for curbs, road graph and smoothness, plus the conforming decision re-checked on the bigger area.

### P3.2 Load and streaming
1. **Measure first:** ready time, heap and GPU memory (`stats()`) with everything loaded eagerly. If within budget, stop here.
2. Otherwise stream in this order, re-measuring after each:
   1. terrain LOD distances;
   2. building detail (`STREAM_RADIUS` already 560 m);
   3. facade boxes chunked by 500 m cells with frustum culling (NYC keeps them island-wide and static, which may not fit the larger hilly sight lines);
   4. load 1 km data tiles around the player progressively after the first frame.
3. Startup: build the near tiles first, so the first frame appears early; build far tiles in idle callbacks.

### P3.3 Grade separation
SF's core has tunnels (Broadway and Stockton tunnels), freeways (the I-80 approach to the Bay Bridge in SoMa, ramps) and viaducts.

1. **Tunnels:**
   - links flagged `tunnel` keep the road at the portal-interpolated elevation (straight line between portal ground heights), not the terrain above;
   - terrain is not cut;
   - portals are simple masonry boxes;
   - inside, use a dark box tunnel with lights;
   - AI traffic may use them; pedestrians may not.
2. **Freeways / viaducts:**
   - OSM `bridge=yes` + `layer` on the matched ways gives which links are elevated, **not their height**;
   - deck height is not in the data: estimate it from the DSM first return (`peak` style) under the deck if available in the DEM products (❓ check whether a DSM tile is available), else use a labelled constant (`DECK_H_ESTIMATE`) per OSM `layer` value;
   - use NYC's highway traffic system (already 3D) for freeway lanes;
   - the deck is a ribbon mesh plus columns every 30 m.
3. If (2) eats more than 1 session, keep freeways **visual only** (deck + columns, no traffic) and log it.

### P3.4 Neighbourhood specifics needed for function (not looks)
- **Lombard St crooked block:**
  - check the graph geometry (tight curves); speed cap 8 km/h on that link; one-way per data;
  - curves must have enough inner points (do not RDP-simplify below 0.3 m there);
  - sidewalks are stairs in reality: pedestrians do not use that block in P3.
- **Steep streets over 25%:**
  - allowed for the player;
  - excluded from AI routing if vehicles stall; list them in the decision log.
- **Embarcadero:**
  - a wide boulevard with a centre median and light rail (`railway=tram` ways);
  - keep the rail strip as a median island class with rail texture paint (P4 adds trams).

### P3.5 Teleports and labels
- `TELEPORT_LOCATIONS`: Ferry Building, Transamerica, Coit Tower base, Lombard top, Fisherman's Wharf, Union Square, Chinatown Gate, Civic Center, Oracle Park, Nob Hill (Grace Cathedral).
- Each is computed from the nearest road node to an OSM landmark centroid, with the heading towards the landmark.
- Verified by the teleports test.

### P3.6 Perf pass and gallery
- Benches: street, car, heli, hill, plus a new `russian-hill-view` (static, 360° yaw sweep).
- Gallery `docs/review/p3/`: core overview from the helicopter, Lombard, Telegraph Hill, Union Square, SoMa, Civic Center, Embarcadero.

---------------------------------------------------------------------------------------------------------------------

## Gate (P3)
- [ ] Core loads, ready ≤ 25 s; budgets met on all benches.
- [ ] Tests green (geodata and teleports on core data).
- [ ] Tunnels work; freeways at least visual.
- [ ] Gallery, perf log, progress log, handover.
