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
