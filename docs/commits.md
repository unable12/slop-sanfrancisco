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
