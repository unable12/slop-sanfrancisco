# Ground audit (P2.0)

The single checklist for "nothing floats or sinks" in Phase 2. Every place in `js/` that fixes a height without asking the terrain is classified; each A and S item has an owning task and a tick box. Tick `☐` when the owner has fixed it (or has explicitly deferred it with a note).

- **Produced:** 2026-10-22, by running exactly `grep -nE "position\.(y|set)|\.y\s*=|setY|positionWorld\.y|wy\b|yHeight|maxY|< *2\.6|0\.22|0\.012|0\.018|0\.55" js/*.js` (720 hits in 21 files), reading the code around every hit, and adding what the grep cannot see (last section). Plan source: `docs/research.md` §3 and `docs/phases/phase-2-vertical-slice.md`.
- **Snapshot:** line numbers are those of commit `ef42066` (HEAD when written: P2.1 height API plus the robotaxi change). The working tree already carried uncommitted P2.2 edits (see "Moving in the working tree" at the end); line numbers in `sf-ground.js`, `main.js`, `tsl-materials.js` and `city-config.js` will differ there.
- **Live code** is what `index.html` loads and `js/main.js` `FEATURES` builds: ground `sf-flat` (`sf-ground.js`), buildings `v0` (`sf-buildings.js`); `boroughs`, `landmarks`, `details`, `traffic` and `highway` are off today. `details` and `traffic` are turned on in Phase 2, so `street-details.js`, `traffic.js`, `road-network.js`, `road-paint.js`, `pedestrians.js` and `trees.js` are audited as live.

| Class | Meaning | Action |
|---|---|---|
| A | absolute ground (assumes ground at y = 0 or a constant world height) | must use terrain |
| B | relative to a placed parent (local coordinates in a model or group, offsets added to an already-placed y) | none |
| C | a vertical size, thickness or non-height constant that merely matched the regex | none |
| S | shader (TSL) using absolute world y for floors, storefronts, lenses or fog | must use a base attribute or be ground-relative |

Marks: ☐ open, ☑ fixed, ⏭ deferred: the code path is not used by San Francisco (NYC-only, or the v1 buildings build no awnings, fire escapes, sheds or yards); revisit with its owner phase (awnings and street trees: P4).

## Summary

| File | Hits | A | S | B/C | Owner(s) |
|---|---:|---:|---:|---:|---|
| `sf-ground.js` | 2 | 2 | 0 | 0 | P2.2, P2.4 |
| `sf-buildings.js` | 1 | 1 | 0 | 0 | P2.5 |
| `tsl-materials.js` | 76 | 0 | 2 | 74 | P2.5 |
| `buildings.js` | 45 | 10 | 1 | 34 | P2.5, P4.5 |
| `street-details.js` | 58 | 30 | 3 | 25 | P2.10, P4.5 |
| `road-network.js` | 2 | 0 | 0 | 2 | P2.7 |
| `road-paint.js` | 1 | 1 | 0 | 0 | P2.11 |
| `traffic.js` | 35 | 13 | 0 | 22 | P2.8, P2.9 |
| `pedestrians.js` | 23 | 0 | 0 | 23 | P2.9 |
| `trees.js` | 21 | 1 | 0 | 20 | P2.10, P4.5 |
| `controllers.js` | 61 | 6 | 0 | 55 | P2.6 |
| `cameras.js` | 14 | 3 | 0 | 11 | P2.6 |
| `lighting.js` | 4 | 0 | 0 | 4 | P2.6, P6.3 |
| `main.js` | 2 | 0 | 0 | 2 | P2.6, P2.12 |
| `nyc-map.js` | 12 | 1 | 0 | 11 | P2.6 |
| `vehicle-lights.js` | 2 | 0 | 0 | 2 | - |
| `actor-models.js` | 56 | 0 | 0 | 56 | - |
| `terrain.js` | 1 | 0 | 0 | 1 | - |
| `boroughs.js` (inactive, file-level) | 58 | not classified | not classified | not classified | Phase 6 (region.js replaces it) |
| `city-grid.js` (inactive, file-level) | 113 | not classified | not classified | not classified | P2.2.7 / P2.12 (deletion) |
| `landmarks.js` (inactive, file-level) | 133 | not classified | not classified | not classified | P5 |
| **Total** | **720** | **68** | **6** | **342** (+ 304 in inactive files) | |

Beyond the grep, the last section lists the further A and S items found by reading (they are not in the counts above).

## `sf-ground.js`

Live (ground `sf-flat`). Everything here is built flat; the P2.2 terrain mesh replaces the road deck, P2.4 drapes the slabs and lawns.

| ☐ | line | class | code | note / fix | owner |
|---|---|---|---|---|---|
| ☑ | 47 | A | `water.position.y = ISLAND_BOUNDS.waterLevel;` | Bay plane at the placeholder ISLAND_BOUNDS.waterLevel (-2.2 at this commit); use Terrain.waterLevel | P2.2.5 |
| ☑ | 63 | A | `if (b.park > 0.5 && !b.median) lawns.push(flat(b.poly, H + 0` | Park lawn laid flat on the constant curb height H; drape on groundAt + CURB_H (+ lawn offset) | P2.4 |

## `sf-buildings.js`

Live (buildings `v0`). Replaced by the `v1` path in `buildings.js` (P2.5); until then it must at least not float.

| ☐ | line | class | code | note / fix | owner |
|---|---|---|---|---|---|
| ☑ | 38 | A | `colliders.push({ minX, maxX, minZ, maxZ, maxY: h });` | Collider top = footprint height measured from y = 0 (the extrusion starts at y = 0); needs minY = base, maxY = roof | P2.5 |

## `tsl-materials.js`

Live. 76 hits, almost all cell-local shader constants. The two S items are the whole facade story: `facadeCell` (`vCoord`) and the canyon AO. Further S lines that the grep misses are in the last section.

| ☐ | line | class | code | note / fix | owner |
|---|---|---|---|---|---|
| ☑ | 166 | S | `const streetCrevice = smoothstep(0.0, 7.5, wp.y).mul(0.22).a` | canyonSkyAONode: street-crevice AO on absolute y (and 68 m openness one line above, not matched); use height above ground (boxBase / ground attribute) | P2.5.1 |
| – | 225, 547, 577, 764-784 (6), 840-875 (5), 983-1043 (8), 1145, 1192, 1193, 1250, 1260, 1306, 1394-1425 (4), 1466, 1584, 1588, 1647-1746 (6), 1798, 1896, 1957, 1973, 2054, 2354-2363 (3), 2465, 2688, 2895-2912 (7), 2994-3118 (8) | C | (66 lines) | Cell-local UV (cellUV.y, p.y, uv().y), direction components (n.y, reflectDir.y), alpha / roughness / smoothstep constants; not world heights | - |
| ☑ | 438 | S | `const vCoord = positionWorld.y;` | facadeCell: floor index, ground-floor / storefront mask, canyon band, soot, crown glow all derive from this vCoord; use positionWorld.y - boxBase | P2.5.1 |
| – | 1224, 1552, 1575, 1695, 1699 | C | (5 lines) | World y only sets the phase of brick courses / noise: cosmetic, no floor, lens or fog meaning | - |
| – | 1662 | B | (1 line) | Already relative to a baseY parameter (TKTS steps, landmark P5) | - |
| – | 2563 | C | (1 line) | OK: compares world y with the water level only (pond = park lakes above the bay); needs ISLAND_BOUNDS.waterLevel = Terrain.waterLevel (placeholder -2.2 at this commit) | - |
| – | 2793 | C | (1 line) | wp is positionWorld.xz here, so .y is z | - |

## `buildings.js`

Inactive NYC builder path (`FEATURES.buildings = "nyc"` is off). P2.5 reuses its facade-box instancing: `createFacadeBoxes` use, `commit()`, `pushCollider` and the detail streaming quadtree / instancing loop (about lines 273-283, 621-760, 2400-2620). Rows tagged **[P2.5 reuses]** belong to that code; **[NYC-only]** rows go away with the NYC recipes.

| ☐ | line | class | code | note / fix | owner |
|---|---|---|---|---|---|
| ☑ | 273 | A | `function pushCollider(x0, x1, z0, z1, maxY) {` | [P2.5 reuses] collider factory: maxY absolute, no minY; add minY = base | P2.5.5 |
| ☑ | 275 | A | `colliders.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, max` | [P2.5 reuses] AABB collider without minY | P2.5.5 |
| ☑ | 283 | A | `colliders.push({ minX: cx - ex, maxX: cx + ex, minZ: cz - ez` | [P2.5 reuses] OBB collider without minY | P2.5.5 |
| – | 721-878 (6), 941, 947, 1039, 1255, 1330, 1381, 1520, 1688-1695 (3), 1779, 2162, 2163, 2207, 2233, 2385 | C | (22 lines) | Recipe / material proportions (lot depth, setback, probability), geometry thickness (0.22 deck ring) or shader constants | - |
| ⏭ | 1874 | A | `if (z1 - z0 > 8) blockDetail.scaffoldSheds.push({ x: minX - ` | [NYC-only] sidewalk shed at y = 0.22 (NYC curb); drop with the NYC recipes or use groundAt + CURB_H | P2.5 |
| ⏭ | 2042 | A | `sites.push({ x, y: 0.22, z, scale: 0.8 + h * 0.3, species: h` | [NYC-only] street-tree sites at NYC curb height; SF trees come from the inventory | P4.5 |
| ⏭ | 2173 | A | `dummy.position.set((r.x0 + r.x1) * 0.5, 0.225, (r.z0 + r.z1)` | [NYC-only] rear-yard slabs at y = 0.225; v1 masses have no yards, drop | P2.5 |
| ⏭ | 2290 | S | `const storey = positionWorld.y.sub(3.55).div(3.45); // Landi` | [NYC-only] fire-escape landings from absolute y (3.55 + n * 3.45); needs the box base, or leave fire escapes off in v1 | P2.5 |
| – | 2293 | C | (1 line) | Pixel footprint (derivative) for the fire-escape mask | - |
| – | 2384, 2564, 2615 | C | (3 lines) | Off-screen parking spot for unused lights (sentinel) | - |
| – | 2448, 2476, 2485, 2494 | B | (4 lines) | [P2.5 reuses commit() detail streaming] offset from the item y that commit() stores (roof y1 / awning y); correct once parts carry absolute y | - |
| – | 2459, 2463, 2467 | B | (3 lines) | [disabled by FEATURES.waterTowers=false] offset from the roof y | - |
| ⏭ | 2502 | A | `dummy.position.set(a.x, 4.68, a.z);` | [P2.5 reuses] awning sign at constant y = 4.68; use awning y (a.y) + offset | P2.5 |
| – | 2516 | B | (1 line) | [NYC-only] offset from the shed y (source row is A) | - |
| ⏭ | 2570 | A | `const camY = camera.position.y;` | [P2.5 reuses] storefront-spot distance adds camY^2 as if awnings stood at y = 0; use camY - a.y | P2.5 |
| ⏭ | 2608 | A | `spot.position.set(a.x + outX * 0.45, 4.35, a.z + outZ * 0.45` | [P2.5 reuses] storefront spotlight at constant y = 4.35; use a.y + offset | P2.5 |
| ⏭ | 2609 | A | `spot.target.position.set(a.x + outX * 1.85, 0.0, a.z + outZ ` | [P2.5 reuses] spotlight target at y = 0.0; use the sidewalk ground at the target | P2.5 |

## `street-details.js`

Live once `FEATURES.details` is on (P2.10). Almost every placement is a literal height above a y = 0 ground, built from the NYC avenue x street grid; P2.10 re-places signals, stop signs and lamps from the graph and disables the NYC placements (P2.10.4). Tree y values come from here.

| ☐ | line | class | code | note / fix | owner |
|---|---|---|---|---|---|
| ☐ | 62 | S | `const wy = positionWorld.y;` | Signal lens shader reads world y; lens thresholds 5.60 / 5.24 (lenses at 5.78 / 5.42 / 5.06). Use positionWorld.y - baseY with a per-instance base (or the instance matrix y) | P2.10.1 |
| ☐ | 63 | S | `const isTopRed = step(5.60, wy);` | Red lens band: threshold 5.60 absolute; becomes baseY + 5.60 / relative | P2.10.1 |
| ☐ | 64 | S | `const isBottomGreen = float(1.0).sub(step(5.24, wy));` | Green lens band: threshold 5.24 absolute; relative to baseY | P2.10.1 |
| – | 202-250 (4), 369, 418, 450, 531-541 (3), 807, 935, 939, 985-1022 (3), 1091 | C | (17 lines) | Clearance pad (0.55 m), wind vector, scale / probability constants, geometry sizes (0.22 radius, pit box 0.22 thick) | - |
| ☐ | 263 | A | `dummy.position.set(px, 3.3, pz);` | Signal pole (6.4 m tall, centred at 3.3): literal y on a y = 0 ground; base = groundAt + CURB_H, centre = base + 3.2 | P2.10.1 |
| ☐ | 270 | A | `dummy.position.set(px + c.armDir * 0.68, 4.65, pz);` | Street-name blade at literal y 4.65; ground-relative | P2.10.1 |
| ☐ | 276 | A | `dummy.position.set(px + c.armDir * 0.24, 3.15, pz);` | Walk-signal box at literal y 3.15; ground-relative | P2.10.1 |
| ☐ | 283 | A | `dummy.position.set(armX, 6.1, pz);` | Signal mast arm at literal y 6.1; ground-relative | P2.10.1 |
| ☐ | 290 | A | `dummy.position.set(cornerLampX, 6.22, pz);` | Corner cobra luminaire at literal y 6.22; ground-relative | P2.10 |
| ☐ | 305 | A | `dummy.position.set(px + c.armDir * armDist, 5.42, pz);` | Signal heads (yellow box + lens instances) at literal y 5.42: also the lens shader base (S rows 62-64) | P2.10.1 |
| ☐ | 380 | A | `dummy.position.set(lx, 4.3, lz);` | Ornamental streetlight pole (8.4 m, centred 4.3); ground-relative | P2.10.3 |
| ☐ | 387 | A | `dummy.position.set(lx + outX * 1.15, 8.2, lz + outZ * 1.15);` | Streetlight bracket arm at literal y 8.2; ground-relative | P2.10.3 |
| ☐ | 394 | A | `dummy.position.set(headX, 8.08, headZ);` | Cobra-head luminaire at literal y 8.08; ground-relative (site y 8.02 in the last section) | P2.10.3 |
| ☐ | 427 | A | `dummy.position.set(px, 0.18, pz);` | Globe lamp post base at literal y 0.18 (NYC curb 0.22 minus sink); groundAt + CURB_H | P2.10.3 |
| ☐ | 459 | A | `dummy.position.set(px, 0.18, pz);` | Globe lamp post base at literal y 0.18 (NYC curb 0.22 minus sink); groundAt + CURB_H | P2.10.3 |
| ☐ | 520 | A | `shaft.position.set(at.x, cs.y, at.z);` | NYC canyon god-ray planes at fixed y 40-48 (authored on the NYC grid); disable with the NYC placements | P2.10.4 |
| ☐ | 583 | A | `dummy.position.set(sx, by, sz);` | [NYC-only] Con Ed steam stack bands, y = 0.28 + n * 0.56 from a y = 0 ground; disable or ground-relative | P2.10.4 |
| ☐ | 607 | A | `dummy.position.set(lx, 0.48, lz);` | [NYC-only] Sawhorse barricade legs at literal y 0.48 | P2.10.4 |
| ☐ | 619 | A | `dummy.position.set(rx, railY, rz);` | [NYC-only] Sawhorse rails at literal y 0.82 / 0.46 | P2.10.4 |
| ☐ | 718 | A | `dummy.position.set(subX, 0.8, subZ);` | [NYC-only] Subway stair railing at literal y 0.8 | P2.10.4 |
| ☐ | 727 | A | `dummy.position.set(subX + ox, 1.9, subZ + 2.9);` | [NYC-only] Subway entrance post lamps / globes at literal y 1.9 / 2.7 | P2.10.4 |
| ☐ | 732 | A | `dummy.position.set(subX + ox, 2.7, subZ + 2.9);` | [NYC-only] Subway entrance post lamps / globes at literal y 1.9 / 2.7 | P2.10.4 |
| ☐ | 774 | A | `dummy.position.set(cx, 0.85, cz);` | [NYC-only] Food cart box / umbrella at literal y 0.85 / 2.55 | P2.10.4 |
| ☐ | 780 | A | `dummy.position.set(cx, 2.55, cz);` | [NYC-only] Food cart box / umbrella at literal y 0.85 / 2.55 | P2.10.4 |
| ☐ | 809 | A | `dummy.position.set(hx, 0.64, hz);` | Hydrant at literal y 0.64 (placed on the NYC avenue x street grid); at corners from the graph, centre = sidewalk surface + 0.43 | P2.10.4 |
| ☐ | 821 | A | `dummy.position.set(mx, 0.84, mz);` | [NYC-only] Mailbox at literal y 0.84; ground-relative if kept | P2.10.4 |
| ☐ | 868 | A | `treePositions.push({ x: cp.maxX - 5, y: CP_LAWN_Y, z: tz, sc` | Central Park tree at CP_LAWN_Y = 1.19; NYC-only, disable | P2.10.4 |
| ☐ | 870 | A | `treePositions.push({ x: cp.minX + 5, y: CP_LAWN_Y, z: tz, sc` | Central Park tree at CP_LAWN_Y = 1.19; NYC-only, disable | P2.10.4 |
| ☐ | 953 | A | `const SIDEWALK_Y = 0.22;` | Street-tree base y = NYC curb 0.22 (stored in each site .y, read by trees.js); use groundAt + CURB_H | P2.10 / P4.5 |
| ☐ | 1038 | A | `dummy.position.set(t.x, 0.19, t.z);` | Tree-pit curb / soil / grate at literal y 0.19 / 0.20 / 0.225 (NYC curb 0.22); groundAt + CURB_H - 0.03 .. + 0.005 | P2.10 / P4.5 |
| ☐ | 1042 | A | `dummy.position.set(t.x, 0.20, t.z);` | Tree-pit curb / soil / grate at literal y 0.19 / 0.20 / 0.225 (NYC curb 0.22); groundAt + CURB_H - 0.03 .. + 0.005 | P2.10 / P4.5 |
| ☐ | 1048 | A | `dummy.position.set(t.x, 0.225, t.z);` | Tree-pit curb / soil / grate at literal y 0.19 / 0.20 / 0.225 (NYC curb 0.22); groundAt + CURB_H - 0.03 .. + 0.005 | P2.10 / P4.5 |
| – | 1090, 1099, 1120, 1124, 1168, 1203 | C | (6 lines) | Off-screen parking spot for unused lights (sentinel) | - |
| ☐ | 1130 | A | `const cy = camera.position.y;` | Light-site culling adds cy^2 as if sites stood at y = 0 (used in both loops below); use cy - s.y | P2.10 |
| – | 1161, 1197 | B | (2 lines) | Takes y from the site record (cobraLampSites / streetPointSites); the site y literals are listed in the last section | - |
| ☐ | 1162 | A | `spot.target.position.set(s.tx, 0.0, s.tz);` | Streetlight spot aimed at y = 0.0; aim at groundAt(tx, tz) | P2.10 |

## `road-network.js`

Live once `FEATURES.traffic` is on. The two hits are curve constants; the real ground work (edge height profiles, land test) is in the last section.

| ☐ | line | class | code | note / fix | owner |
|---|---|---|---|---|---|
| – | 1173, 1174 | C | (2 lines) | Bezier handle factor 0.552 (circle approximation), not a height | - |

## `road-paint.js`

Live once traffic is on (built from the road network).

| ☐ | line | class | code | note / fix | owner |
|---|---|---|---|---|---|
| ☐ | 12 | A | `const HEIGHT = 0.012; // above the asphalt` | All paint quads at one constant y (pushed at the strip() vertex push, not matched); ribbons at groundAt + 0.012 every 1 m | P2.11 |

## `traffic.js`

Live once `FEATURES.traffic` is on. The highway part (`createHighwayTraffic`, about 1973-2335) is already 3D and is the model for city lanes; its hits are B/C.

| ☐ | line | class | code | note / fix | owner |
|---|---|---|---|---|---|
| – | 246, 373, 1054, 1124, 1162, 1258-1294 (3), 1397, 1487, 1549, 2079 | C | (12 lines) | Rotation / pitch limits, impulse and gain factors, lateral offsets: not heights | - |
| – | 248 | B | (1 line) | Spark start = caller y; the callers pass literals (see last section) | - |
| – | 372, 381, 1741, 1764, 2078, 2329 | C | (6 lines) | Off-screen parking spot for unused lights (sentinel) | - |
| ☐ | 519 | A | `camY = camera.position.y;` | camY is used as height above y = 0 in the two camY * camY distance tests below; use camY - vehicle ground y | P2.8 |
| ☐ | 1550 | A | `dummy.position.set(v.x - halfTrack * cosY + wz * sinY, radiu` | Wheel y = wheel radius (axle on the y = 0 road); use axle ground y + radius | P2.8.2 |
| ☐ | 1554 | A | `dummy.position.set(v.x + halfTrack * cosY + wz * sinY, radiu` | Wheel y = wheel radius (axle on the y = 0 road); use axle ground y + radius | P2.8.2 |
| ☐ | 1583 | A | `dummy.position.set(c.x, 0.0, c.z);` | Car body at y = 0; body y = average axle y | P2.8.2 |
| ☐ | 1617 | A | `dummy.position.set(c.x, 0.018, c.z);` | Car contact shadow at y = 0.018; ground + 0.018 | P2.8.2 |
| ☐ | 1654 | A | `dummy.position.set(b.x, 0.018, b.z);` | Bus contact shadow at y = 0.018; ground + 0.018 | P2.8.2 |
| ☐ | 1661 | A | `dummy.position.set(b.x, 0.0, b.z);` | Bus body at y = 0; body y = average axle y | P2.8.2 |
| ☐ | 1726 | A | `dummy.position.set(v.x, 0, v.z);` | Headlight matrix origin at y = 0; take from the body instance matrix (as the highway code does) | P2.8.2 |
| ☐ | 1757 | A | `pt.position.set(v.x + side * v._cosY - 0.25 * v._sinY, 1.85,` | Police light bar at absolute y = 1.85; relative to the body (instance matrix) | P2.8.2 |
| – | 1768 | C | (1 line) | Comment above SIDEWALK_Y | - |
| ☐ | 1770 | A | `const SIDEWALK_Y = 0.22;` | Pedestrian sidewalk surface = NYC curb 0.22 above a y = 0 road (used by pedGround); groundAt + CURB_H | P2.9.1 |
| ☐ | 1771 | A | `const CROSSWALK_Y = 0.012;` | Crosswalk surface 0.012 above a y = 0 road; groundAt | P2.9.1 |
| ☐ | 1798 | A | `sp.y = 0.03;` | Spark bounce floor at y = 0.03 (the floor test is the line above); groundAt + 0.03 | P2.8 |
| – | 1807 | B | (1 line) | Spark instance from spark state (spawn and floor rows are A) | - |
| ☐ | 1842 | A | `player.active = Boolean(playerEntity && activeMode !== 'heli` | player.active: absolute y < 2.6 breaks above 2.6 m (all hills); compare height above ground | P2.8.3 |
| – | 2147 | B | (1 line) | Highway player record, entity y as is | - |

## `pedestrians.js`

Live. All hits are character-local geometry; no A. The rig takes ground through the `ground(owner, x, z)` callback (last section), so it is terrain-ready.

| ☐ | line | class | code | note / fix | owner |
|---|---|---|---|---|---|
| – | 100, 300-321 (5), 391-514 (9), 564, 691, 852, 888, 1123, 1406, 1431, 1488 | B/C | (23 lines) | Skeleton bind pose, body-part profiles and shader constants in character-local space (the rig plants feet through the ground() callback, see last section) | - |

## `trees.js`

Used by `street-details.js` only (`createTreeField`; no other builder calls it, checked with grep). Tree y comes from the site records, so the A item here is "who fills `t.y`".

| ☐ | line | class | code | note / fix | owner |
|---|---|---|---|---|---|
| – | 87-222 (10), 293, 403-420 (4), 534, 668-703 (3), 747 | C | (20 lines) | Tree skeleton / leaf geometry in tree-local space (limb heights, widths, scales) and shader constants | - |
| ☐ | 871 | A | `dummy.position.set(t.x, t.y \|\| 0, t.z);` | Tree instance at the site y (default 0) = whatever the caller stored; no terrain query here. Callers must pass groundAt (+ CURB_H on sidewalks) | P2.10 / P4.5 |

## `controllers.js`

Live. Colliders, `getGroundHeight` and the helicopter limits (P2.6). `getGroundHeight` itself has no regex hit; see the last section.

| ☐ | line | class | code | note / fix | owner |
|---|---|---|---|---|---|
| ☐ | 164 | A | `const altitude = heli ? Math.max(92, Math.min(380, ent.posit` | Helicopter teleport altitude band 92..380 is absolute: hilltops reach 117 m; use groundAt + clearance | P2.6.5 / P2.6.7 |
| ☐ | 170 | A | `ent.position.y = heli ? altitude : this.getGroundHeight(dest` | Heli branch sets an absolute y; the ground branch calls getGroundHeight (fixed by P2.6.1) | P2.6.7 |
| – | 183, 192, 289, 335-371 (4), 450-541 (13), 599-632 (5), 871, 1011, 1113, 1122 | B | (29 lines) | Local offset inside the entity model (child of the entity mesh), already relative to the placed parent | - |
| – | 185, 195, 434-508 (8), 822, 825, 903, 1006-1024 (3) | C | (16 lines) | Rotation angle, impulse factor, material or geometry size | - |
| – | 216 | B | (1 line) | Other entities' cylinders from their own y | - |
| ☐ | 245 | A | `if (y > c.maxY + 1.5) continue;` | Teleport clearance test uses y = 1 (car, cyclist) or ground + 1 (person) against maxY with no minY; pass the real y and test minY | P2.6.2 |
| ☐ | 718 | A | `resolveHorizontalCollision(pos, radius, yHeight = 1.0, carEn` | Default yHeight = 1.0 (callers for car and cyclist pass the constant too); pass position.y + 1 | P2.6.2 |
| ☐ | 748 | A | `if (yHeight > c.maxY + 1.5) continue;` | Collider skip test uses yHeight against maxY only; add the minY test (skip if below minY - 0.5) | P2.6.2 |
| – | 859, 941-950 (5), 997, 1058, 1110 | B | (9 lines) | Player y follows getGroundHeight() (itself constant, row in the last section) or is relative to the entity y | - |
| ☐ | 1112 | A | `h.position.y = Math.max(0.25, Math.min(380, h.position.y));` | Helicopter clamp 0.25..380 absolute; floor = groundAt + 2 (soft ceiling) | P2.6.5 |

## `cameras.js`

Live (P2.6.6).

| ☐ | line | class | code | note / fix | owner |
|---|---|---|---|---|---|
| – | 82, 219, 244, 268 | C | (4 lines) | Mouse y, horizontal offset, sway amplitude | - |
| ☐ | 184 | A | `Math.max(0.65, entity.position.y + height),` | Chase camera floor 0.65 absolute; groundAt(x, z) + 0.65, plus the 4-sample boom test | P2.6.6 |
| – | 191, 200, 209, 231, 236, 328, 333 | B | (7 lines) | Offset from the followed entity's y (already terrain-based once the entity is) | - |
| ☐ | 204 | A | `Math.max(0.55, lowY),` | Action camera floor 0.55 absolute; groundAt + 0.55 | P2.6.6 |
| ☐ | 338 | A | `this.currentPos.y = Math.max(0.55, this.currentPos.y);` | Follow-camera floor 0.55 absolute (research: 338); groundAt + 0.55 | P2.6.6 |

## `lighting.js`

Live. Shadow far (P2.6.9) has no regex hit; see the last section. The fog row is a decision (OK).

| ☐ | line | class | code | note / fix | owner |
|---|---|---|---|---|---|
| – | 84, 117 | C | (2 lines) | Preset values (0.55 / 0.22) | - |
| – | 207 | C | (1 line) | Hemisphere light only uses the direction from the origin | - |
| – | 228 | C | (1 line) | OK: haze falloff exp(-y / 900 m) on absolute y. Altitude falloff is physical with NAVD88 y; the clamp at 0 only affects the bay (-1..0 m). P6.3 extends this node | P6.3 |

## `main.js`

Live.

| ☐ | line | class | code | note / fix | owner |
|---|---|---|---|---|---|
| – | 699 | B | (1 line) | setCameraPose writes the pose given by ?cam / bench; those coordinates are absolute (BENCH_PATHS and ?cam y values, last section) | - |
| – | 799 | C | (1 line) | HUD altitude readout (elevation in feet); display only | - |

## `nyc-map.js`

Live (radar zoom, P2.6.8). Canvas coordinates named `wy`, `panStart.y` are screen pixels.

| ☐ | line | class | code | note / fix | owner |
|---|---|---|---|---|---|
| – | 254, 475, 571, 800, 1051-1053 (3), 1141-1143 (3), 1215 | C | (11 lines) | Canvas pixel y (wy / panStart.y), zoom thresholds, alpha, comment text matching the regex; none is a world height | - |
| ☐ | 983 | A | `const target = Math.max(0.05, RADAR_SCALE / (1 + Math.max(0,` | Radar zoom-out starts at absolute y = 25; use height above ground | P2.6.8 |

## `vehicle-lights.js`

Live. Local to the vehicle, and applied with the vehicle matrix, so it follows slope.

| ☐ | line | class | code | note / fix | owner |
|---|---|---|---|---|---|
| – | 28, 31 | B | (2 lines) | Headlight offsets in vehicle-local space (applied with the vehicle matrix; follows slope) | - |

## `actor-models.js`

Live. Models are built in local space (geometry translate, bevels, shader constants in model space). **A: none.** Wheels sit at `spec.wheelRadius` in the model; traffic.js and controllers.js place the models (A rows there).

| ☐ | line | class | code | note / fix | owner |
|---|---|---|---|---|---|
| – | 233-246 (3), 291, 405, 574, 659, 708, 713, 812-833 (3), 879, 1025-1205 (17), 1338-1388 (6), 1492, 1558, 1597, 1641-1709 (10), 1891-1900 (6), 1973 | B/C | (56 lines) | Model built in local space (geometry translate / bevel / shader-in-model-space constants); no world height | - |

## `terrain.js`

New in P2.1 (`js/terrain.js`). The single hit is the unit normal's y component.

| ☐ | line | class | code | note / fix | owner |
|---|---|---|---|---|---|
| – | 72 | C | (1 line) | normalAt output component (the unit normal's y), not a height | - |

## Inactive files (file-level rows)

| ☐ | file | hits | status | note / action | owner |
|---|---|---:|---|---|---|
| ☐ | `js/boroughs.js` | 58 | not loaded (decision P1-2) | Not in `index.html`, so it never runs. Not classified line by line. Its mask-driven ground and chunked building instancing are ported into `region.js` in Phase 6; every height in the port must come from the terrain/region height source. | Phase 6 |
| ☐ | `js/city-grid.js` | 113 | superseded by `sf-ground.js`; removal slated for P2.2.7 | Only `buildCityGrid` runs it, and `main.js` calls that only for `FEATURES.ground = "nyc"`. Flat road slab at y = 0, curbs 0..0.22, Central Park and bridges at constant heights: all of it is dropped, not fixed. Helpers other live files call: see below. | P2.2 / P2.12 (deletion) |
| ☐ | `js/landmarks.js` | 133 | disabled (`FEATURES.landmarks = false`) | Rewritten in Phase 5. `fitToSite` / every landmark placement must use `Terrain.groundAt` (and a base per tier) when rewritten; today it assumes ground at 0. It also sets `window.NYC.bryantParkLawn`, which `controllers.js` and `cameras.js` read (rows above). | P5 |

### Helpers in `city-grid.js` that other live files call

`Object.assign(window.NYC, { buildCityGrid, batchStaticGroupMeshes })` is the whole export list.

| name | lines | callers | hits inside | action |
|---|---|---|---|---|
| `buildCityGrid` | 1442-2523 | `main.js` (only when `FEATURES.ground === "nyc"`) | all remaining hits of the file | none; delete with the file |
| polygon and extrusion helpers: `createWorldXZShape` 177, `createExtrudedPolygonMesh` 188, `createFlatPolygonMesh` 203, clip / offset / `pointInPolygonXZ` 216-388 | 177-388 | not exported; only used inside the file today, but P2.4 ("the existing helpers") and P2.2.6 (seawall: "reuse `createExtrudedPolygonMesh` logic") plan to reuse them | none (the y comes in as `bottomY` / `y` arguments, so they are y-agnostic) | lift into a shared module before the file is deleted |
| `batchStaticGroupMeshes` | 124-170 | `city-grid.js` itself, `landmarks.js` (dormant); P2.4 plans to reuse it for 128 m cells | none (it merges geometry by material, y-agnostic) | move to a shared module before deleting the file (P2.2.7 / P2.4) |

All other hits sit in code reachable only through `buildCityGrid`: `addStoneArchBridge` and `buildManhattanSchistGeometry` (hits at lines 41-111; called at 1866-1898), the waterfront pier builders and materials (452-1441, hits 534-1381), `buildManhattanWaterfrontEdge` (2524), `buildSouthStreetViaduct` (3065) and `buildUnderpassPortal` (3420). Globals that `buildCityGrid` sets (`parkTreeSites`, `parkLampSites`, `pavedPlazaRects`, `sidewalkBlocks`, `centralParkClearings`, `fdrViaduct`) are read by `street-details.js` and `buildings.js` with `|| []` fallbacks, so they are inert under `sf-flat`.

## Items found outside the grep

From `docs/research.md` §3 and from reading the code. Class is A or S as in the legend; line numbers are current (commit `ef42066`), not the NYC baseline numbers in research.md.

| ☐ | where | class | what | fix | owner |
|---|---|---|---|---|---|
| ☐ | `traffic.js:1772` | A | Pedestrian ground is a constant: `pedGround` returns SIDEWALK_Y 0.22 or CROSSWALK_Y 0.012 (rows above); it is the PersonRig `ground()` callback | `groundAt + CURB_H` on sidewalks, `groundAt` on crosswalks | P2.9.1 |
| ☐ | `traffic.js:533` | A | `visible()` tests the point (x, 1, z) against the frustum side planes: the `+ normal.y` term is y = 1 | test (x, groundAt + 1, z) | P2.8.3 |
| ☐ | `traffic.js:1063, 1070, 1085` | A | Lane geometry is xz only: `lanePoint`, `pathPoint`, `locate` return x, z, dx, dz; vehicles carry no y, so pose is flat | edge height profile (`edgeY`, `edgeGrade`, `curveY`) from P2.7.4; y at both axles | P2.7.4 / P2.8.1 |
| ☐ | `traffic.js:1108` | A | Pitch and roll come only from acceleration and yaw rate | add terrain pitch (-atan(dy / wheelbase)) and roll (normal, clamped +-4 deg) under the spring terms | P2.8.1 |
| ☐ | `traffic.js:1165, 1299` | A | Collision sparks spawn at literal y 0.56 / 0.58 / 0.65 (the bounce floor is the 0.03 row above) | spawn at ground y + the same offset | P2.8 |
| ☐ | `traffic.js:1624, 1671` | A | Draw-distance test adds camY^2, as if the vehicle stood at y = 0 (with the `camY` row above) | use the camera height above the vehicle's ground y | P2.8 |
| – | `traffic.js:2135` | B | Highway player test: \|player y - lane y\| < 2.6 is relative to the lane, already correct (highway is off; this is the pattern to copy for `player.active`) | none | - |
| ☐ | `controllers.js:662` | A | `getGroundHeight` is constants only: Central Park 1.24, Bryant lawn `top`, `ISLAND_BOUNDS.sidewalkHeight` on a curb island, else 0.0 | `Terrain.groundAt` (+ `CURB_H` on sidewalks for the person); drop the Central Park and Bryant cases | P2.6.1 |
| ☐ | `controllers.js:301, 393, 560, 644` | A | Spawn positions: person y = sidewalkHeight, car 0.0, cyclist 0.0, helicopter 96 (all NYC grid, `SPAWN_Z = streetZ(37)`) | spawn through `teleportActiveTo` at a slice point (y from `groundAt`; heli at ground + clearance) | P2.6.7 |
| ☐ | `controllers.js:234` | A | Teleport clearance uses y = 1 for car and cyclist (hit row for `y > c.maxY + 1.5` above) | ground + 1, and test `minY` | P2.6.2 |
| ☐ | `controllers.js:224, 725` | A | Land test by the shore table (teleport `clampPoint` and the walk/drive clamp in `resolveHorizontalCollision`) | land polygon / `groundAt > waterLevel`; vehicles and the person must not enter the bay | P2.6 (with P2.7.3) |
| ☐ | `controllers.js:1000` | A | Car (and cyclist) chassis pitch / roll come only from throttle and steering springs; no terrain pitch or roll | sample ground at front/rear axle and left/right, add smoothed pitch/roll | P2.6.3 |
| ☐ | `cameras.js:242` | A | The 8 scenic presets (centralPark, fifthAve, timesSquare, chryslerGCT, observatory, bryantPark, waterfront, drone: `case` lines 242-300) use NYC world coordinates with literal y (5.5 m street level up to 322 m, drone 240-420 m); bryantPark reads `bryantParkLawn.top` with a fallback of 1.3 | No phase file assigns re-authoring or hiding them. At minimum the P2.6.6 ground clamp must apply to them; better, replace with SF viewpoints or hide the NYC ones | unassigned (suggest P2.6.6, P7) |
| ☐ | `lighting.js:303` | A | Shadow far grows with absolute y (`focusPos.y`): on a 100 m hill at street level it already reaches 420 m | altitude = camera y - groundAt(x, z) | P2.6.9 |
| – | `lighting.js:220` | C | Aerial fog height falloff exp(-y / 900 m) on absolute y (`ya = max(positionWorld.y, 0)`). Decision: fine as world-height fog, altitude haze is physical with NAVD88 y. Marine layer extends it in P6.3 | none | P6.3 |
| ☐ | `road-network.js:51` | A | `onLand` uses `getIslandBoundsAtZ` (shore table); `blocked`, `walkable` and `blockedOnStreet` all go through it | land polygon (P1.10) or `groundAt > waterLevel` | P2.7.3 |
| ☐ | `road-network.js:443, 487` | A | Edges carry x0, z0, dx, dz, lanes and no y (both `addEdge` and `addEdgeGeneral`); curves (`k0 = 0.552` builder) carry no y either | height profile every 2 m from `groundAt`, cumulative 3D length, Hermite y for curves: `edgeY`, `edgeGrade`, `curveY` | P2.7.4 |
| ☑ | `sf-ground.js:62` | A | Curb slabs: base -0.05, top H = `ISLAND_BOUNDS.sidewalkHeight`, both constant (the grep only caught the lawn at H + 0.012) | outline meshes draped on `groundAt`, top = groundAt + CURB_H | P2.4 |
| ☑ | `sf-ground.js:54` | A | Road deck: `LAND_RINGS` polygon flat at y = 0 (and the stone bulkhead from `waterLevel - 0.4` to -0.02 on the line above) | replaced by the terrain mesh; seawall extruded to per-vertex `groundAt` | P2.2.1 / P2.2.6 / P2.2.7 |
| ☑ | `sf-ground.js:71` | A | Piers: deck top constant 0.1, base from `ISLAND_BOUNDS.waterLevel` (placeholder -2.2 in `city-config.js:121`; docs/handover.md: set it to `GEO.data.terrain.waterLevel`) | base = `Terrain.waterLevel - 0.3`, top = pier shore height + 0.1 | P2.2 |
| ☑ | `city-config.js:121` | A | `ISLAND_BOUNDS` = { sidewalkHeight 0.15, waterLevel -2.2 }: read by sf-ground (bay plane, bulkhead, piers), `tsl-materials.js` water (`harbourY`) and `controllers.js` | waterLevel from `Terrain.waterLevel`; sidewalkHeight becomes `CURB_H` (P2.4) | P2.2.5 / P2.4 |
| ☑ | `sf-buildings.js:35` | A | Each footprint extrudes from y = 0 up by `roof - base` and is never translated to `base`; the table's `base` is read and only subtracted | v1 path: mass bottom = base - 1.0, top = roof (P2.5.3); stop-gap: translate by base | P2.5 |
| ☑ | `main.js:54` | A | Bench paths (street y 1.7, car 1.4, hill 8) and `?cam=x,y,z` use absolute y, so they sink into hills; heli path y 300-340 is above the 117 m peak | y relative to `groundAt` for street, car and hill; keep heli absolute | P2.6 / P2.12 |
| ☐ | `road-paint.js:29` | A | Paint quad vertices pushed at the constant `HEIGHT` (row above); flat quads between two points, no subdivision | ribbons subdivided every 1 m with y = groundAt + 0.012 | P2.11 |
| ☐ | `street-details.js:296, 403, 434, 466, 737, 784` | A | Light-site records (`cobraLampSites`, `streetPointSites`) store literal world y (6.18, 8.02, 4.02 twice, 2.75, 2.15); the pool placement at lines 1161 / 1197 uses them directly | store ground y + offset, or site records relative to a per-site base | P2.10 |
| ☐ | `street-details.js:834, 843` | A | Central Park and Bryant Park tree heights (CP_LAWN_Y = 1.19, Bryant terrace `top - 0.2`) | disable (NYC-only) behind a flag | P2.10.4 |
| ☑ | `tsl-materials.js:165` | S | `canyonSkyAONode` also opens the sky by absolute y (`smoothstep(0, 68, wp.y)`, the row above is the street crevice term); used by 13 materials | height above ground (shared fix with the crevice row) | P2.5.1 |
| ☑ | `tsl-materials.js:592, 828, 839, 1042` | S | Facade canyon-bounce band, soot and crown glow thresholds are all in `vCoord` (absolute y); they follow the `vCoord` fix (rows above) but their thresholds (14 / 22-75 m, 180 m, `crownGlowHeight`) are heights above ground | confirm after the `boxBase` change | P2.5.1 |
| ☐ | `tsl-materials.js:1700` | S | Marble ashlar ground-splash grime on absolute y (3.6 .. 0.2 m); landmark material (Washington Square Arch) | ground-relative when the landmark is placed | P5 (or P2.5.1 if used earlier) |
| ☑ | `buildings.js:481` | A | [P2.5 reuses] `mass()` stacks parts from y = 0 (`y0 = f0 * storey`); every downstream box, collider and roof item inherits it | v1: masses from `base - 1.0` to `roof` | P2.5.3 / P2.5.4 |
| ⏭ | `buildings.js:604, 724` | A | [P2.5 reuses] awnings at y = 3.8 and fire-escape landings at y = 3.55 are literal heights above a y = 0 ground (the sign, spotlight and shader rows above follow them) | ground y of the front + offset | P2.5 |
| ☑ | `buildings.js:415` | A | [P2.5 reuses] each block gets one collider from y = 0 up to 26 m, with no `minY` | per-mass colliders `{minY: base, maxY: roof}` | P2.5.5 |
| ☑ | `buildings.js:306` | A | [P2.5 reuses] the detail-streaming quadtree is sized by `ISLAND_BOUNDS` (x, z only) | data bounds (x, z); no y issue | P2.5.6 |
| – | `pedestrians.js:1062, 1097, 1136, 1142, 1210` | B | PersonRig takes ground through `ground(owner, x, z)` for every foot and the pelvis (lines in the second column are the call sites). Terrain-ready: it only needs the callbacks (`personGround`, `pedGround`) to return terrain heights | none in this file | - |
| – | `trees.js:879` | B | Tree culling centre = site y + 6 m, relative to the site | none | - |

Checked, no action: `scene-culling.js` (no regex hits; y-agnostic as long as geometry is baked at world y, which is why the terrain mesh bakes y into its vertices and joins the shadow proxies in P2.2.4), `vehicle-lights.js`, `actor-models.js`, `post-processing.js`, `touch-controls.js`.

## Moving in the working tree (uncommitted when this was written)

Another session was landing P2.2 in the working tree on top of `ef42066`. These audit rows are affected; re-grep after it is committed and re-tick:

- `sf-ground.js`: bay plane now at `Terrain.waterLevel`; the flat road deck and bulkhead are replaced by `buildTerrainMesh` (`js/terrain-mesh.js`); piers get a per-pier top from `groundAt`. Slabs (`prism(b.poly, -0.05, H)`) and lawns (`H + 0.012`) are unchanged: still A, P2.4.
- `city-config.js`: `ISLAND_BOUNDS.waterLevel` now comes from the terrain data and `CURB_H = 0.15` is exported; this resolves the placeholder noted in the `sf-ground`, `tsl-materials` (`harbourY`) and `city-config` rows.
- `tsl-materials.js`: adds `createTerrainMaterial` (ground mask); no new world-y use.
- `main.js`: `BENCH_ON_GROUND` and `?camGround=1` make the street, car and hill bench paths and `?cam` ground-relative (the `main` bench row).
