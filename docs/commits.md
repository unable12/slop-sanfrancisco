# Pending commit commands

Sessions don't commit (`docs/RUNBOOK.md` §8). Every 2–4 finished tasks, they append a batch here: one ready-to-run command
per commit, each touching only its own files. Kamil runs them in order.

A batch whose subjects already appear in `git log` is done. Mark superseded batches as such; do not delete them.

---------------------------------------------------------------------------------------------------------------------

<!-- batches go below, newest last -->

## 2026-10-22 15:15: note from the Phase 2 session (no commands)

This session committed P2.4, P2.5 and P2.6 itself (`205cab0`, `6b29258`, `211d2c2`, in its old `P2.n: …` style with a
Claude attribution line) before it read K1. They are left as they are: undoing or rewording them would take git write
commands. Regroup or reword them if you like. From P2.7 on, this session writes commands here instead of committing.

## 2026-10-22 15:34: P2.7–P2.8 — SUPERSEDED by the P2.7–P2.11 batch below (not run yet when it was written)

Tests 125/125, probe 0 errors.

```bash
git add -- js/road-network.js js/traffic.js js/main.js tests/road-network.test.cjs tests/traffic-sim.test.cjs tests/helpers/traffic-harness.cjs tests/traffic-performance.test.cjs PLAN.md docs/ground-audit.md && git commit -m "drive the real street graph over the hills, with real signals and stop signs (P2.7, P2.8)" -- js/road-network.js js/traffic.js js/main.js tests/road-network.test.cjs tests/traffic-sim.test.cjs tests/helpers/traffic-harness.cjs tests/traffic-performance.test.cjs PLAN.md docs/ground-audit.md
```

## 2026-10-22 15:42: P2.7–P2.11 — SUPERSEDED by the P2.7–P2.12 batch below (not run yet when it was written)

Tests 126/126, probe 0 errors.

```bash
git add -- js/road-network.js js/traffic.js js/main.js js/road-paint.js js/street-details.js js/sf-street-details.js index.html tests/boot.test.cjs tests/road-network.test.cjs tests/traffic-sim.test.cjs tests/helpers/traffic-harness.cjs tests/traffic-performance.test.cjs PLAN.md docs/ground-audit.md && git commit -m "drive and walk the real streets over the hills: road graph in 3d, traffic at real signals and stop signs, crosswalks, signal masts, stop signs, lamps and draped road paint (P2.7, P2.8, P2.9, P2.10, P2.11)" -- js/road-network.js js/traffic.js js/main.js js/road-paint.js js/street-details.js js/sf-street-details.js index.html tests/boot.test.cjs tests/road-network.test.cjs tests/traffic-sim.test.cjs tests/helpers/traffic-harness.cjs tests/traffic-performance.test.cjs PLAN.md docs/ground-audit.md
```

## 2026-10-22 15:55: P2.7–P2.12, the Phase 2 gate and the handover (one commit: the tasks share js/traffic.js, js/main.js, index.html, PLAN.md and docs/ground-audit.md)

Tests 126/126, probe 0 errors, benches street 435 / car 370 / heli 357 / hill 323 fps. `js/city-grid.js` is deleted.

```bash
git rm --cached -q -- js/city-grid.js && git add -- js/road-network.js js/traffic.js js/main.js js/road-paint.js js/street-details.js js/sf-street-details.js index.html tests/road-network.test.cjs tests/traffic-sim.test.cjs tests/helpers/traffic-harness.cjs tests/traffic-performance.test.cjs tools/dev/shots.json PLAN.md docs/ground-audit.md docs/file-disposition.md docs/perf-log.md docs/phases/phase-2-vertical-slice.md docs/handover.md docs/commits.md docs/review/p2/index.md docs/review/p2/all-way-stop.jpg docs/review/p2/california-at-powell.jpg docs/review/p2/chinatown-grant.jpg docs/review/p2/ferry-building.jpg docs/review/p2/golden-hour-hill-shadow.jpg docs/review/p2/heli-slice.jpg docs/review/p2/market-street.jpg docs/review/p2/nob-hill-top.jpg && git commit -m "drive and walk the real streets over the hills: road graph in 3d, traffic at real signals and stop signs, crosswalks, street furniture and draped road paint; phase 2 gate and gallery (P2.7, P2.8, P2.9, P2.10, P2.11, P2.12)" -- js/city-grid.js js/road-network.js js/traffic.js js/main.js js/road-paint.js js/street-details.js js/sf-street-details.js index.html tests/road-network.test.cjs tests/traffic-sim.test.cjs tests/helpers/traffic-harness.cjs tests/traffic-performance.test.cjs tools/dev/shots.json PLAN.md docs/ground-audit.md docs/file-disposition.md docs/perf-log.md docs/phases/phase-2-vertical-slice.md docs/handover.md docs/commits.md docs/review/p2/index.md docs/review/p2/all-way-stop.jpg docs/review/p2/california-at-powell.jpg docs/review/p2/chinatown-grant.jpg docs/review/p2/ferry-building.jpg docs/review/p2/golden-hour-hill-shadow.jpg docs/review/p2/heli-slice.jpg docs/review/p2/market-street.jpg docs/review/p2/nob-hill-top.jpg
```

## 2026-10-22 16:55: P3.1–P3.5 — SUPERSEDED by the phase 3 batch below (not run yet when it was written)

Tests 130/130, probe 0 errors (ready 5.2 s, heap 786 MB). The slice's binaries are deleted (the game and the tests now run
on the core box; `tools/build-geodata.mjs slice` rebuilds them from data/raw). PLAN.md and the docs follow in the gate batch.

```bash
git rm --cached -q -- data/buildings-slice.bin data/groundmask-slice.bin data/terrain-slice.bin && git add -- data/buildings-core.bin data/groundmask-core.bin data/terrain-core.bin index.html js/cameras.js js/city-config.js js/controllers.js js/grade-separation.js js/main.js js/road-network.js js/road-paint.js js/sf-geodata.js js/sf-street-details.js js/terrain-mesh.js js/traffic.js tests/boot.test.cjs tests/buildings-v1.test.mjs tests/drape.test.cjs tests/geodata-build.test.mjs tests/geodata.test.mjs tests/grade-separation.test.cjs tests/helpers/geo-box.cjs tests/helpers/traffic-harness.cjs tests/road-network.test.cjs tests/teleports.test.cjs tests/terrain-data.test.mjs tests/terrain.test.cjs tools/boxes.json tools/build-geodata.mjs tools/geo-buildings.mjs tools/geo-extra.mjs tools/geo-roadgraph.mjs tools/queries/landmarks.overpassql docs/reports/curbs-core.md docs/reports/road-smoothness-core.md docs/reports/roadgraph-core.md docs/reports/terrain-core.md docs/review/p1/curbs-core.svg && git commit -m "scale to the north-east quadrant core: core data, tunnels, mission creek bridges, freeway decks with highway traffic, lombard's crooked block, rail medians and landmark teleports (P3.1, P3.2, P3.3, P3.4, P3.5)" -- data/buildings-slice.bin data/groundmask-slice.bin data/terrain-slice.bin data/buildings-core.bin data/groundmask-core.bin data/terrain-core.bin index.html js/cameras.js js/city-config.js js/controllers.js js/grade-separation.js js/main.js js/road-network.js js/road-paint.js js/sf-geodata.js js/sf-street-details.js js/terrain-mesh.js js/traffic.js tests/boot.test.cjs tests/buildings-v1.test.mjs tests/drape.test.cjs tests/geodata-build.test.mjs tests/geodata.test.mjs tests/grade-separation.test.cjs tests/helpers/geo-box.cjs tests/helpers/traffic-harness.cjs tests/road-network.test.cjs tests/teleports.test.cjs tests/terrain-data.test.mjs tests/terrain.test.cjs tools/boxes.json tools/build-geodata.mjs tools/geo-buildings.mjs tools/geo-extra.mjs tools/geo-roadgraph.mjs tools/queries/landmarks.overpassql docs/reports/curbs-core.md docs/reports/road-smoothness-core.md docs/reports/roadgraph-core.md docs/reports/terrain-core.md docs/review/p1/curbs-core.svg
```

## 2026-10-22 17:10: P3.1–P3.6, the phase 3 gate and the handover (one commit: the tasks share js/road-network.js, js/traffic.js, js/main.js, js/grade-separation.js, js/sf-geodata.js and the tests)

Tests 130/130, probe 0 errors, benches street 244 / car 238 / heli 204 / hill 208 / russian-hill-view 208 fps, heap
≤ 809 MB, ready ≤ 5.3 s. The slice's three binaries are deleted (the game and the tests run on the core;
`node tools/build-geodata.mjs slice` rebuilds them from data/raw).

```bash
git rm --cached -q -- data/buildings-slice.bin data/groundmask-slice.bin data/terrain-slice.bin && git add -- PLAN.md data/buildings-core.bin data/groundmask-core.bin data/terrain-core.bin docs/commits.md docs/file-disposition.md docs/handover.md docs/perf-log.md docs/phases/phase-3-core-scale.md docs/reports/curbs-core.md docs/reports/road-smoothness-core.md docs/reports/roadgraph-core.md docs/reports/terrain-core.md docs/review/p1/curbs-core.svg docs/review/p3/civic-center.jpg docs/review/p3/embarcadero.jpg docs/review/p3/heli-core.jpg docs/review/p3/index.md docs/review/p3/lombard.jpg docs/review/p3/mission-creek-bridge.jpg docs/review/p3/soma-freeway.jpg docs/review/p3/stockton-tunnel.jpg docs/review/p3/telegraph-hill.jpg docs/review/p3/union-square.jpg index.html js/cameras.js js/city-config.js js/controllers.js js/grade-separation.js js/main.js js/road-network.js js/road-paint.js js/sf-geodata.js js/sf-street-details.js js/terrain-mesh.js js/traffic.js tests/boot.test.cjs tests/buildings-v1.test.mjs tests/drape.test.cjs tests/geodata-build.test.mjs tests/geodata.test.mjs tests/grade-separation.test.cjs tests/helpers/geo-box.cjs tests/helpers/traffic-harness.cjs tests/road-network.test.cjs tests/teleports.test.cjs tests/terrain-data.test.mjs tests/terrain.test.cjs tools/boxes.json tools/build-geodata.mjs tools/dev/probe.mjs tools/dev/shots.json tools/geo-buildings.mjs tools/geo-extra.mjs tools/geo-roadgraph.mjs tools/queries/landmarks.overpassql && git commit -m "scale to the north-east quadrant core: core data, tunnels, mission creek bridges, freeway decks with highway traffic, lombard's crooked block, rail medians and landmark teleports; phase 3 gate and gallery (P3.1, P3.2, P3.3, P3.4, P3.5, P3.6)" -- data/buildings-slice.bin data/groundmask-slice.bin data/terrain-slice.bin PLAN.md data/buildings-core.bin data/groundmask-core.bin data/terrain-core.bin docs/commits.md docs/file-disposition.md docs/handover.md docs/perf-log.md docs/phases/phase-3-core-scale.md docs/reports/curbs-core.md docs/reports/road-smoothness-core.md docs/reports/roadgraph-core.md docs/reports/terrain-core.md docs/review/p1/curbs-core.svg docs/review/p3/civic-center.jpg docs/review/p3/embarcadero.jpg docs/review/p3/heli-core.jpg docs/review/p3/index.md docs/review/p3/lombard.jpg docs/review/p3/mission-creek-bridge.jpg docs/review/p3/soma-freeway.jpg docs/review/p3/stockton-tunnel.jpg docs/review/p3/telegraph-hill.jpg docs/review/p3/union-square.jpg index.html js/cameras.js js/city-config.js js/controllers.js js/grade-separation.js js/main.js js/road-network.js js/road-paint.js js/sf-geodata.js js/sf-street-details.js js/terrain-mesh.js js/traffic.js tests/boot.test.cjs tests/buildings-v1.test.mjs tests/drape.test.cjs tests/geodata-build.test.mjs tests/geodata.test.mjs tests/grade-separation.test.cjs tests/helpers/geo-box.cjs tests/helpers/traffic-harness.cjs tests/road-network.test.cjs tests/teleports.test.cjs tests/terrain-data.test.mjs tests/terrain.test.cjs tools/boxes.json tools/build-geodata.mjs tools/dev/probe.mjs tools/dev/shots.json tools/geo-buildings.mjs tools/geo-extra.mjs tools/geo-roadgraph.mjs tools/queries/landmarks.overpassql
```

## 2026-10-22 18:00: traffic gridlock fixes (the flaky traffic-sim stuck-vehicle test)

The test failed about one run in four. Seeded replays (64 seeds) found two gridlocks (511 s, 241 s) and a near-full
cycle wait on most seeds, all on the 9–10 m links where Columbus Ave crosses Kearny St and Pacific Ave. Three causes:
`room()` let three cars give way to one another in a circle (position on one road, waiting time across roads); a car
on the green gave way to one waiting at its red; cars filled a ring of one-car links. Worst standing time after: 61 s
(limit 90). Tests 130/130 and traffic-sim 4/4 runs, probe 0 errors, benches street 256 / car 250 fps.

```bash
git add -- js/traffic.js docs/commits.md && git commit -m "stop cars gridlocking on the short links where columbus ave cuts the grid" -- js/traffic.js docs/commits.md
```

## 2026-10-22 (before 18:00; the time first written here, 18:55, was wrong): P4.1–P4.3 — SUPERSEDED by the P4.1–P4.5 batch below (not run yet when it was written)

Tests 131/131, probe 0 errors, benches street 196 / heli 161 fps, heap ≤ 837 MB.

```bash
git add -- data/buildings-core.bin docs/formats.md docs/reports/building-types-core.md docs/review/p4/types.svg index.html js/buildings.js js/sf-buildings.js js/sf-style.js js/tsl-materials.js tests/boot.test.cjs tests/facade-base.test.cjs tools/build-geodata.mjs tools/building-rules.json tools/geo-buildings.mjs docs/commits.md && git commit -m "give the buildings san francisco's types: row houses with bay windows, garages and stoops in painted pastels, warehouses, towers by the tall building inventory with podiums and crowns, civic colonnades (P4.1, P4.2, P4.3)" -- data/buildings-core.bin docs/formats.md docs/reports/building-types-core.md docs/review/p4/types.svg index.html js/buildings.js js/sf-buildings.js js/sf-style.js js/tsl-materials.js tests/boot.test.cjs tests/facade-base.test.cjs tools/build-geodata.mjs tools/building-rules.json tools/geo-buildings.mjs docs/commits.md
```

## 2026-10-22 18:15: P4.1–P4.5 — SUPERSEDED by the phase 4 batch below (not run yet when it was written)

Tests 131/131, probe 0 errors, benches street 164–204 / heli 152 fps (run-to-run spread on this machine), live heap
≤ 574 MB. `js/sf-geodata.js` is rebuilt (trolley wires, Muni stops, bike lanes, street trees).

```bash
git add -- data/buildings-core.bin docs/commits.md docs/formats.md docs/reports/building-types-core.md docs/review/p4/types.svg index.html js/buildings.js js/road-paint.js js/sf-buildings.js js/sf-geodata.js js/sf-street-details.js js/sf-style.js js/trees.js js/tsl-materials.js tests/boot.test.cjs tests/facade-base.test.cjs tools/build-geodata.mjs tools/building-rules.json tools/dev/probe.mjs tools/geo-buildings.mjs tools/geo-extra.mjs tools/tree-classes.json && git commit -m "give the city san francisco's look: building types, painted row houses with bay windows, garages and stoops, warehouses, towers with podiums and crowns, muni stops and shelters, trolley wires, bike lanes, parking meters and the street tree inventory (P4.1, P4.2, P4.3, P4.4, P4.5)" -- data/buildings-core.bin docs/commits.md docs/formats.md docs/reports/building-types-core.md docs/review/p4/types.svg index.html js/buildings.js js/road-paint.js js/sf-buildings.js js/sf-geodata.js js/sf-street-details.js js/sf-style.js js/trees.js js/tsl-materials.js tests/boot.test.cjs tests/facade-base.test.cjs tools/build-geodata.mjs tools/building-rules.json tools/dev/probe.mjs tools/geo-buildings.mjs tools/geo-extra.mjs tools/tree-classes.json
```

## 2026-10-22 18:50: P4.1–P4.7, the phase 4 gate and the handover (one commit: the tasks share js/tsl-materials.js, js/buildings.js, js/sf-street-details.js, tools/build-geodata.mjs, tools/geo-extra.mjs and the generated data)

Tests 136/136, probe 0 errors, benches (two runs each) street 161/169, car 152/152, heli 137/139, hill 123/127,
russian-hill-view 127/127 fps, live heap ≤ 587 MB, ready ≤ 5.9 s. `js/sf-geodata.js` and `data/buildings-core.bin` are
rebuilt.

```bash
git add -- PLAN.md data/buildings-core.bin docs/commits.md docs/data-sources.md docs/formats.md docs/handover.md docs/landmarks/muni.md docs/perf-log.md docs/phases/phase-4-sf-look.md docs/reports/building-types-core.md docs/review/p4/index.md docs/review/p4/p4-california-cable-car.jpg docs/review/p4/p4-chinatown.jpg docs/review/p4/p4-downtown-canyon.jpg docs/review/p4/p4-embarcadero-palms.jpg docs/review/p4/p4-embarcadero-streetcar.jpg docs/review/p4/p4-fidi-towers.jpg docs/review/p4/p4-folsom-bike-lanes.jpg docs/review/p4/p4-muni-shelter-trolley-wires.jpg docs/review/p4/p4-north-beach-night.jpg docs/review/p4/p4-north-beach.jpg docs/review/p4/p4-powell-cable-cars.jpg docs/review/p4/p4-russian-hill-air.jpg docs/review/p4/p4-russian-hill-rowhouses.jpg docs/review/p4/p4-soma-warehouses.jpg docs/review/p4/types.svg index.html js/actor-models.js js/buildings.js js/controllers.js js/main.js js/road-paint.js js/sf-buildings.js js/sf-geodata.js js/sf-street-details.js js/sf-style.js js/sf-transit.js js/traffic.js js/trees.js js/tsl-materials.js tests/boot.test.cjs tests/buildings-runtime.test.cjs tests/facade-base.test.cjs tests/transit.test.cjs tools/build-geodata.mjs tools/building-rules.json tools/dev/probe.mjs tools/dev/shots.json tools/geo-buildings.mjs tools/geo-extra.mjs tools/queries/rail.overpassql tools/tree-classes.json && git commit -m "give the city san francisco's look: building types, painted row houses with bay windows, garages and stoops, warehouses, towers with podiums and crowns, muni stops, trolley wires, bike lanes, the street tree inventory, streetcars and cable cars on the muni routes and the sf fleet; phase 4 gate and gallery (P4.1, P4.2, P4.3, P4.4, P4.5, P4.6, P4.7)" -- PLAN.md data/buildings-core.bin docs/commits.md docs/data-sources.md docs/formats.md docs/handover.md docs/landmarks/muni.md docs/perf-log.md docs/phases/phase-4-sf-look.md docs/reports/building-types-core.md docs/review/p4/index.md docs/review/p4/p4-california-cable-car.jpg docs/review/p4/p4-chinatown.jpg docs/review/p4/p4-downtown-canyon.jpg docs/review/p4/p4-embarcadero-palms.jpg docs/review/p4/p4-embarcadero-streetcar.jpg docs/review/p4/p4-fidi-towers.jpg docs/review/p4/p4-folsom-bike-lanes.jpg docs/review/p4/p4-muni-shelter-trolley-wires.jpg docs/review/p4/p4-north-beach-night.jpg docs/review/p4/p4-north-beach.jpg docs/review/p4/p4-powell-cable-cars.jpg docs/review/p4/p4-russian-hill-air.jpg docs/review/p4/p4-russian-hill-rowhouses.jpg docs/review/p4/p4-soma-warehouses.jpg docs/review/p4/types.svg index.html js/actor-models.js js/buildings.js js/controllers.js js/main.js js/road-paint.js js/sf-buildings.js js/sf-geodata.js js/sf-street-details.js js/sf-style.js js/sf-transit.js js/traffic.js js/trees.js js/tsl-materials.js tests/boot.test.cjs tests/buildings-runtime.test.cjs tests/facade-base.test.cjs tests/transit.test.cjs tools/build-geodata.mjs tools/building-rules.json tools/dev/probe.mjs tools/dev/shots.json tools/geo-buildings.mjs tools/geo-extra.mjs tools/queries/rail.overpassql tools/tree-classes.json
```

## 2026-10-22: P5.1–P5.6, the phase 5 gate and the handover (one commit: every task touches js/landmarks.js, js/sf-geodata.js and tools/geo-landmarks.mjs)

Tests 144/144, probe 0 errors, benches (two runs each) street 172/172, car 154/147, heli 145/137, hill 125/127,
russian-hill-view 116/127 fps, live heap ≤ 691 MB, ready ≤ 7.0 s. `js/sf-geodata.js` is rebuilt and
`data/terrain-region.bin` is new; the core's `data/*.bin` are unchanged. The x54 DEM tiles and the named OSM query
are in `data/raw/` (git-ignored).

```bash
git add -- PLAN.md data/terrain-region.bin docs/commits.md docs/data-sources.md docs/formats.md docs/handover.md docs/landmarks/INDEX.md docs/landmarks/alcatraz.md docs/landmarks/bay-bridge.md docs/landmarks/cable-car-turntable.md docs/landmarks/chase-center.md docs/landmarks/city-hall.md docs/landmarks/coit-tower.md docs/landmarks/conservatory-of-flowers.md docs/landmarks/de-young-museum.md docs/landmarks/ferry-building.md docs/landmarks/fort-point.md docs/landmarks/ghirardelli-square.md docs/landmarks/golden-gate-bridge.md docs/landmarks/grace-cathedral.md docs/landmarks/lombard-street.md docs/landmarks/mission-dolores.md docs/landmarks/oracle-park.md docs/landmarks/painted-ladies.md docs/landmarks/palace-of-fine-arts.md docs/landmarks/pier-39.md docs/landmarks/salesforce-park.md docs/landmarks/salesforce-tower.md docs/landmarks/sutro-tower.md docs/landmarks/transamerica-pyramid.md docs/perf-log.md docs/phases/phase-5-landmarks.md docs/reports/landmarks.md docs/review/p5/index.md docs/review/p5/p5-alcatraz.jpg docs/review/p5/p5-baybridge-deck.jpg docs/review/p5/p5-baybridge-embarcadero.jpg docs/review/p5/p5-baybridge-heli.jpg docs/review/p5/p5-chase-center.jpg docs/review/p5/p5-cityhall-heli.jpg docs/review/p5/p5-cityhall-mid.jpg docs/review/p5/p5-cityhall-street.jpg docs/review/p5/p5-coit-heli.jpg docs/review/p5/p5-coit-mid.jpg docs/review/p5/p5-coit-street.jpg docs/review/p5/p5-conservatory.jpg docs/review/p5/p5-de-young.jpg docs/review/p5/p5-ferry-heli.jpg docs/review/p5/p5-ferry-mid.jpg docs/review/p5/p5-ferry-street.jpg docs/review/p5/p5-fort-point.jpg docs/review/p5/p5-gg-crissy.jpg docs/review/p5/p5-gg-from-marina.jpg docs/review/p5/p5-gg-heli.jpg docs/review/p5/p5-ghirardelli.jpg docs/review/p5/p5-grace-cathedral.jpg docs/review/p5/p5-lombard-air.jpg docs/review/p5/p5-lombard-top.jpg docs/review/p5/p5-mission-dolores.jpg docs/review/p5/p5-oracle-heli.jpg docs/review/p5/p5-oracle-mid.jpg docs/review/p5/p5-oracle-street.jpg docs/review/p5/p5-painted-ladies.jpg docs/review/p5/p5-pfa-heli.jpg docs/review/p5/p5-pfa-mid.jpg docs/review/p5/p5-pfa-near.jpg docs/review/p5/p5-salesforce-heli.jpg docs/review/p5/p5-salesforce-mid.jpg docs/review/p5/p5-salesforce-park.jpg docs/review/p5/p5-salesforce-street.jpg docs/review/p5/p5-sutro-from-core.jpg docs/review/p5/p5-sutro-mid.jpg docs/review/p5/p5-sutro-near.jpg docs/review/p5/p5-transamerica-heli.jpg docs/review/p5/p5-transamerica-mid.jpg docs/review/p5/p5-transamerica-street.jpg docs/review/p5/p5-turntable.jpg index.html js/buildings.js js/data-loader.js js/grade-separation.js js/landmarks.js js/main.js js/sf-bridges.js js/sf-geodata.js js/sf-ground.js js/terrain.js tests/boot.test.cjs tests/controllers.test.cjs tests/helpers/landmarks-build.cjs tests/landmarks-data.test.mjs tests/landmarks-runtime.test.cjs tools/boxes.json tools/build-geodata.mjs tools/dev/shots.json tools/fetch-geodata.mjs tools/geo-landmarks.mjs tools/geo-terrain.mjs tools/queries/landmarks-named.overpassql && git commit -m "landmarks and bridges on their real sites: the golden gate and bay bridge with i-80 traffic on its decks, transamerica, salesforce tower, the ferry building, coit tower, city hall, sutro tower, the palace of fine arts and oracle park, tier 2 landmarks, lombard's paving and flower beds, interim region ground outside the core; phase 5 gate and gallery (P5.1, P5.2, P5.3, P5.4, P5.5, P5.6)" -- PLAN.md data/terrain-region.bin docs/commits.md docs/data-sources.md docs/formats.md docs/handover.md docs/landmarks/INDEX.md docs/landmarks/alcatraz.md docs/landmarks/bay-bridge.md docs/landmarks/cable-car-turntable.md docs/landmarks/chase-center.md docs/landmarks/city-hall.md docs/landmarks/coit-tower.md docs/landmarks/conservatory-of-flowers.md docs/landmarks/de-young-museum.md docs/landmarks/ferry-building.md docs/landmarks/fort-point.md docs/landmarks/ghirardelli-square.md docs/landmarks/golden-gate-bridge.md docs/landmarks/grace-cathedral.md docs/landmarks/lombard-street.md docs/landmarks/mission-dolores.md docs/landmarks/oracle-park.md docs/landmarks/painted-ladies.md docs/landmarks/palace-of-fine-arts.md docs/landmarks/pier-39.md docs/landmarks/salesforce-park.md docs/landmarks/salesforce-tower.md docs/landmarks/sutro-tower.md docs/landmarks/transamerica-pyramid.md docs/perf-log.md docs/phases/phase-5-landmarks.md docs/reports/landmarks.md docs/review/p5/index.md docs/review/p5/p5-alcatraz.jpg docs/review/p5/p5-baybridge-deck.jpg docs/review/p5/p5-baybridge-embarcadero.jpg docs/review/p5/p5-baybridge-heli.jpg docs/review/p5/p5-chase-center.jpg docs/review/p5/p5-cityhall-heli.jpg docs/review/p5/p5-cityhall-mid.jpg docs/review/p5/p5-cityhall-street.jpg docs/review/p5/p5-coit-heli.jpg docs/review/p5/p5-coit-mid.jpg docs/review/p5/p5-coit-street.jpg docs/review/p5/p5-conservatory.jpg docs/review/p5/p5-de-young.jpg docs/review/p5/p5-ferry-heli.jpg docs/review/p5/p5-ferry-mid.jpg docs/review/p5/p5-ferry-street.jpg docs/review/p5/p5-fort-point.jpg docs/review/p5/p5-gg-crissy.jpg docs/review/p5/p5-gg-from-marina.jpg docs/review/p5/p5-gg-heli.jpg docs/review/p5/p5-ghirardelli.jpg docs/review/p5/p5-grace-cathedral.jpg docs/review/p5/p5-lombard-air.jpg docs/review/p5/p5-lombard-top.jpg docs/review/p5/p5-mission-dolores.jpg docs/review/p5/p5-oracle-heli.jpg docs/review/p5/p5-oracle-mid.jpg docs/review/p5/p5-oracle-street.jpg docs/review/p5/p5-painted-ladies.jpg docs/review/p5/p5-pfa-heli.jpg docs/review/p5/p5-pfa-mid.jpg docs/review/p5/p5-pfa-near.jpg docs/review/p5/p5-salesforce-heli.jpg docs/review/p5/p5-salesforce-mid.jpg docs/review/p5/p5-salesforce-park.jpg docs/review/p5/p5-salesforce-street.jpg docs/review/p5/p5-sutro-from-core.jpg docs/review/p5/p5-sutro-mid.jpg docs/review/p5/p5-sutro-near.jpg docs/review/p5/p5-transamerica-heli.jpg docs/review/p5/p5-transamerica-mid.jpg docs/review/p5/p5-transamerica-street.jpg docs/review/p5/p5-turntable.jpg index.html js/buildings.js js/data-loader.js js/grade-separation.js js/landmarks.js js/main.js js/sf-bridges.js js/sf-geodata.js js/sf-ground.js js/terrain.js tests/boot.test.cjs tests/controllers.test.cjs tests/helpers/landmarks-build.cjs tests/landmarks-data.test.mjs tests/landmarks-runtime.test.cjs tools/boxes.json tools/build-geodata.mjs tools/dev/shots.json tools/fetch-geodata.mjs tools/geo-landmarks.mjs tools/geo-terrain.mjs tools/queries/landmarks-named.overpassql
```

## 2026-10-22: README for San Francisco — SUPERSEDED by the batch below (not run yet when it was written)

The README was still Slop New York's. Now: a Transamerica shot from the phase 5 gallery, status, how to run, controls,
tests, license. The plain URL loads headlessly with 0 console errors.

```bash
git add -- README.md docs/commits.md && git commit -m "readme for san francisco: screenshot, status, how to run and controls" -- README.md docs/commits.md
```

## 2026-10-22 21:30: the robotaxi stopping on open road, the San Francisco loading screen, arrow keys in the hints, the README

Kamil's car stopped dead on Market St near Spear St. A scan of every traffic lane (2 m steps, the car's half width) found
271 player colliders over the lanes: buildings drawn from their outline collided by the outline's whole bounding box (one
244 × 224 m box over the Embarcadero), the Salesforce Transit Center was one solid block over 1st and Fremont streets, and
freeway columns stood in the lanes under I-80 and US-101. Now outline buildings collide by 1.5 m strips of their outline
(the bounding box stays the road network's obstacle, so traffic is unchanged), the Transit Center has 9 m openings over the
streets that cross it (ESTIMATE), and columns move off the roadway. Left: 197 grazing hits, none on Market St or the
Financial District's streets except Minna St (an alley along the Transit Center's wall); alleys where OSM and the
footprints disagree. Loading screen, page title, HUD brand and map header say Slop San Francisco (SF badge, dusk skyline);
the GitHub link to slop-newyork is gone from the HUD. Tests 144/144 (drape and road-network failed once on timing while
a probe ran, 5/5 alone), probe 0 errors.

```bash
git add -- README.md css/style.css docs/commits.md docs/landmarks/salesforce-park.md index.html js/buildings.js js/controllers.js js/grade-separation.js js/landmarks.js js/main.js && git commit -m "stop the car hitting invisible walls on the street, san francisco loading screen and title, arrow keys in the hints, readme for san francisco" -- README.md css/style.css docs/commits.md docs/landmarks/salesforce-park.md index.html js/buildings.js js/controllers.js js/grade-separation.js js/landmarks.js js/main.js
```


## 2026-10-22: road recovery and San Francisco cameras/map labels

Adds R recovery to a nearby clear surface road, using the existing teleport reset and camera handling.
Replaces seven NYC scenic views with georeferenced SF landmark views, updates their menu labels,
and replaces the hard-coded NYC map area labels and initial waypoint. Legacy camera IDs remain compatible.
README and HUD explain R. Tests: 146/146 pass with `--test-concurrency=1`, including recovery and camera-target coverage.
The headless browser probe stalled during WebGPU renderer initialization, before scene construction;
visual checks and a live Market Street drive remain unverified. No new performance numbers claimed.

```bash
git add -- README.md docs/commits.md index.html js/cameras.js js/controllers.js js/main.js js/nyc-map.js tests/cameras.test.cjs tests/controllers.test.cjs && git commit -m "recover to a clear road with r, san francisco camera views and map labels" -- README.md docs/commits.md index.html js/cameras.js js/controllers.js js/main.js js/nyc-map.js tests/cameras.test.cjs tests/controllers.test.cjs
```


## 2026-10-22: Phase 6 implementation checkpoint — SUPERSEDED by the final Phase 6 batch below

P6.1 data, P6.2 regional renderer, P6.3 functional weather implementation and P6.4 water/ships/night.
This saves the working implementation; it **does not mark Phase 6 complete**. Tests pass (157/157),
whole-city frame rate and memory are within budget, and the gallery is saved. The latest measured marine-fog
cost is +2.622 ms versus the <1 ms target. P6.5 and the overall phase gate remain open; details and next steps
are in `docs/perf-log.md` and `docs/handover.md`.

One batch because these tasks share `main.js`, `lighting.js`, the loader and generated manifest. Kamil commits.

```bash
git rm --cached -q -- js/boroughs.js && git add -- PLAN.md README.md css/style.css docs/commits.md docs/data-sources.md docs/file-disposition.md docs/formats.md docs/handover.md docs/perf-log.md docs/phases/phase-6-region-atmosphere.md index.html js/controllers.js js/data-loader.js js/lighting.js js/main.js js/sf-bridges.js js/sf-ground.js js/terrain-mesh.js js/tsl-materials.js tests/boot.test.cjs tests/controllers.test.cjs tools/boxes.json tools/dev/probe.mjs tools/serve.mjs data/region docs/reports/region.md docs/review/p6 js/region.js tests/region-data.test.mjs tests/region-runtime.test.cjs tools/fetch-horizon.mjs tools/geo-region.mjs tools/queries/ferries.overpassql && git commit -m "fill out san francisco and the bay, add marine fog and ferries (P6.1-P6.4)" -- PLAN.md README.md css/style.css docs/commits.md docs/data-sources.md docs/file-disposition.md docs/formats.md docs/handover.md docs/perf-log.md docs/phases/phase-6-region-atmosphere.md index.html js/boroughs.js js/controllers.js js/data-loader.js js/lighting.js js/main.js js/sf-bridges.js js/sf-ground.js js/terrain-mesh.js js/tsl-materials.js tests/boot.test.cjs tests/controllers.test.cjs tools/boxes.json tools/dev/probe.mjs tools/serve.mjs data/region docs/reports/region.md docs/review/p6 js/region.js tests/region-data.test.mjs tests/region-runtime.test.cjs tools/fetch-horizon.mjs tools/geo-region.mjs tools/queries/ferries.overpassql
```


## 2026-10-23: Phase 6 complete — run this batch only

P6.1–P6.5, including the final fog optimisation and gate evidence. Supersedes the uncommitted checkpoint above.
160/160 tests; worst paired-median fog cost 0.852 ms at 1280×720; city flight 120 fps, 855 MB after idle;
six final gallery images. No threshold relaxed. The array keeps the command limited to these Phase 6 paths.
One commit because the tasks share runtime, data and documentation files. Kamil commits; nothing is pushed.

```bash
p6_files=(
  PLAN.md README.md css/style.css docs/commits.md docs/data-sources.md docs/file-disposition.md docs/formats.md docs/handover.md
  docs/perf-log.md docs/phases/phase-6-region-atmosphere.md index.html js/controllers.js js/data-loader.js js/lighting.js
  js/main.js js/post-processing.js js/sf-bridges.js js/sf-ground.js js/terrain-mesh.js js/tsl-materials.js tests/boot.test.cjs
  tests/controllers.test.cjs tools/boxes.json tools/dev/probe.mjs tools/serve.mjs data/region docs/reports/region.md
  docs/review/p6 js/region.js tests/fog.test.cjs tests/region-data.test.mjs tests/region-runtime.test.cjs tools/fetch-horizon.mjs
  tools/geo-region.mjs tools/queries/ferries.overpassql
) && git rm --cached -q -- js/boroughs.js && git add -- "${p6_files[@]}" && git commit -m "fill out san francisco and the bay with fast marine fog and ferries (P6.1-P6.5)" -- "${p6_files[@]}" js/boroughs.js
```


## 2026-10-23: P7.1–P7.8 — implementation ready; P7.9 acceptance open

Phase 6 is committed as `5620d05`. All shared integration files belong to one batch.
171/171 tests pass; final map/dialog checks also pass. All seven High benches 119–120 fps;
Low/Medium city 120 fps. Review `docs/acceptance.md` before tagging. No Git writes performed.
The array below is supported by bash and zsh and keeps this one command limited to the listed paths.

```bash
(phase7_paths=(.gitignore NOTICE.md PLAN.md README.md css/style.css index.html js/city-config.js js/main.js js/region.js js/traffic.js js/settings.js js/sf-map.js js/sf-places.js tests/boot.test.cjs tests/teleports.test.cjs tests/traffic-sim.test.cjs tests/no-nyc-text.test.cjs tests/settings.test.cjs tests/sf-map.test.cjs tests/smoke-sf.test.cjs tools/build-static.mjs tools/geo-neighborhoods.mjs docs/ARCHITECTURE.md docs/acceptance.md docs/release-audit.md docs/data-sources.md docs/file-disposition.md docs/perf-log.md docs/phases/phase-7-ui-polish-release.md docs/handover.md docs/commits.md docs/review/p7); git rm --cached -q -- js/nyc-map.js tests/nyc-map.test.cjs && git add -- "${phase7_paths[@]}" && git commit -m "add the san francisco terrain map, settings and release checks (P7.1-P7.8)" -- "${phase7_paths[@]}" js/nyc-map.js tests/nyc-map.test.cjs)
```

After accepting and committing, Kamil may run `git tag v0.1.0`; do not tag the earlier Phase 6 commit.


## 2026-10-23: Phase 8 + showcase final batch — supersedes the uncommitted checkpoint

Phase 7 is committed as `2254186`. The earlier Phase 8 checkpoint command is superseded by this one batch,
including junction right-of-way, zero-contact regression coverage, sound for all four movement modes,
the subsequent cinematic README showcase, unobstructed camera angle and unified player Waymo body/roof. Phase 8 was subsequently committed as `e17d6c8`; do not rerun this batch. The later collision-realism proposal is included as documentation only.
The final car pass has 41/41 targeted checks. Full regression: 184/186 initially; both unchanged timing checks passed separately at their original limits. Review evidence is in `docs/review/p8/`. Kamil commits; no Git writes,
push, tag or deployment were performed. The path array works in bash and zsh.

```bash
(phase8_paths=(js/actor-models.js js/waymo-detail.js tests/waymo-detail.test.cjs docs/vehicles/waymo.md docs/review/waymo docs/phases/phase-9-collision-realism.md docs/media tools/dev/showcase.mjs tools/dev/export-showcase.sh PLAN.md README.md css/style.css docs/ARCHITECTURE.md docs/commits.md docs/handover.md docs/perf-log.md docs/phases/phase-8-first-ride.md docs/review/p8 index.html js/controllers.js js/main.js js/ride-audio.js js/ride-ui.js js/ride.js js/sf-map.js js/traffic.js tests/boot.test.cjs tests/helpers/landmarks-build.cjs tests/helpers/ride-world.cjs tests/helpers/traffic-harness.cjs tests/ride-audio.test.cjs tests/ride.test.cjs tests/teleports.test.cjs); git add -- "${phase8_paths[@]}" && git commit -m "finish the robotaxi ride with sound, a cohesive waymo and clear city previews (P8)" -- "${phase8_paths[@]}")
```


## 2026-10-23: P9.1 + responsive toolbar — committed as 2237c78

Phase 8 is committed as `e17d6c8`. This batch includes building contact and the subsequent responsive toolbar fix; trees/pedestrians are deferred under the demo-first scope.
It replaces the building-only command previously shown. Nine viewport widths checked; 5/5 boot/settings tests pass after UI changes.
198/198 tests, three zero-contact city rides, static package and browser contact/sliding review pass.
Incremental resolver p95 0.0909/0.1939 ms at 11/36 m/s; Node CPU only, maxima retained in report.
Kamil commits; no Git writes, tag, deployment or publication performed. Bash/zsh command:

```bash
(p9_paths=(docs/media/README.md css/style.css docs/review/hud-responsive PLAN.md docs/ARCHITECTURE.md docs/commits.md docs/handover.md docs/perf-log.md docs/phases/phase-9-collision-realism.md docs/review/p9-buildings docs/reports/p9-building-collisions.json index.html js/world-collision.js js/buildings.js js/controllers.js js/main.js js/ride.js js/ride-ui.js tests/world-collision.test.cjs tests/buildings-runtime.test.cjs tests/controllers.test.cjs tests/boot.test.cjs tests/ride.test.cjs tools/dev/collision-review.mjs tools/dev/bench-collisions.cjs); git add -- "${p9_paths[@]}" && git commit -m "fix invisible building collisions and keep the toolbar clear on small screens (P9.1)" -- "${p9_paths[@]}")
```


## 2026-10-23: demo README, creator credit and license — committed as b98677b

P9.1/toolbar is committed as `2237c78`. Both GIFs already exist in committed media; they need no duplication.
This documentation-only batch refreshes the README and MIT/NOTICE attribution. GitHub main was checked at
`58dfcae`, five commits behind local main; the push below also sends those earlier commits and their GIFs.
Verified local links, two 50-frame GIFs, preserved MIT grant/disclaimer text and static packaging.
User runs the command; no Git writes were performed by the session. No force push or visibility change.

```bash
git add -- README.md LICENSE NOTICE.md PLAN.md docs/handover.md docs/commits.md && git commit -m "showcase san francisco with creator credit and clear mit licensing (docs)" -- README.md LICENSE NOTICE.md PLAN.md docs/handover.md docs/commits.md && git push origin main
```


## 2026-10-23: README punctuation cleanup (committed by Kamil as 81aa46d)

Removed both em dashes from the README, as requested. Documentation only; whitespace check passes.
GitHub repository remains private at this check; an open-source launch tweet should wait until it is public.

```bash
git add -- README.md docs/commits.md && git commit -m "remove em dashes from the readme (docs)" -- README.md docs/commits.md
```


## 2026-10-23: public playable demo release

The user's explicit request to make the repository public and host the demo authorizes this session to
commit/push the release, superseding the usual user-commit-only workflow for this publication task.
Kamil committed the punctuation cleanup separately as `81aa46d` while release preparation was running.
This release adds the live demo link, contribution guide, clean static packaging,
artifact verification and a pinned official GitHub Pages workflow. No history rewrite or force push.
This batch is executed by the release session; do not rerun older pending commands.


Public-demo release committed and pushed as `1472125`; GitHub Pages run `40042304299` passed.
The follow-up release evidence commit records the successful hosted smoke check. Both commits are executed
under Kamil's explicit publication authorization; no additional user commit command is required.
