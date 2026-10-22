# Handover (2026-10-22, end of phase 3)

## State

**Phase 3 is complete; the gate passed** (`docs/phases/phase-3-core-scale.md`, Gate and Results).
- Tests: 130/130 (`node --test tests/*.test.cjs tests/*.test.mjs`), all on the core data.
- Probe benches: street 244, car 238, heli 204, hill 208, russian-hill-view 208 fps; heap ≤ 809 MB; ready ≤ 5.3 s;
  0 console errors.
- Gallery: `docs/review/p3/index.md`. Perf: `docs/perf-log.md`. Decisions P3-1 … P3-7 in `PLAN.md` §10.

**Commits.** Kamil commits (K1). Nothing of phase 3 is committed yet: **one ready-to-run command** at the end of
`docs/commits.md` (the earlier P3.1–P3.5 batch above it is superseded). It also removes the slice's three binaries from
git (`git rm --cached`; they are already deleted on disk).

## What the core now has

- Data for the core box (`tools/boxes.json` `core`, 4.03 × 5.35 km); `js/sf-geodata.js` and `data/*-core.bin` are the
  game's data. Tests follow the box the geodata was built for (`tests/helpers/geo-box.cjs`).
- `js/grade-separation.js`: tunnel bores and portals, bridge decks, freeway decks on columns, `floorAt` / `roofAt` /
  `carveAt` for the player, cameras and the terrain mesh; highway traffic on the freeway main lines (`FEATURES.highway`).
- `road-network.js`: `spans()` (tunnels and bridges), edges' `bore`, `speedCap`, `noWalk`; the P3-4 network rules; the
  40% grade cut (P3-5).
- `GEO.roadGraph.decks` (OSM deck layers), `GEO.rail` (surface rail), point landmarks; flag 64 `crooked`.
- `city-config.js`: rail medians (`block.rail`), landmark teleports (`TELEPORT_LOCATIONS[*].landmark`), labels.
- `stats().gpuMB`; bench `russian-hill-view`.

## Next session: start phase 4 (`docs/phases/phase-4-sf-look.md`)

1. Read `docs/commits.md`: if the phase 3 command is still pending, leave it; don't redo the work.
2. Start the dev server in the background (`node tools/serve.mjs 8080`); probe with `node tools/dev/probe.mjs`.
3. P4 owns several things this phase left visible (gallery known issues): curb gaps in Mission Bay and SoMa (94.0% of
   footprints in a curb island; buildings there stand on asphalt), stairs drawn as streets (Kearny, Greenwich,
   Montgomery on Telegraph Hill, Macondray Ln), Lombard's flower beds, Union Square's paving, trams on `GEO.rail`
   (the cable-car lines on Powell, Hyde and California are in it too).
4. Phases 4 and 5 could run in parallel worktrees (RUNBOOK §6) only if Kamil says so.

## Open questions / risks

- **Heap is climbing:** P2 ≤ 283 MB, P3 ≤ 809 MB on the benches (budget 1.2 GB), and P4–P6 add trees, row houses and
  the region. The grade-separation build arrays were being kept alive by its lookup closures (fixed: 922 → 677 MB on
  the street bench); look for the same pattern in `sf-ground.js` (drape cells) and `buildings.js` before streaming.
- **Freeway heights are estimates** (P3-3: 8 / 15 / 22 m by OSM layer). The I-80 main lines end at the box's
  waterfront where the Bay Bridge starts (P5); highway cars dip and reappear at lane ends.
- **Broadway Tunnel** is two one-way links ~3 m apart in the data; its bore is drawn per edge pair. Look at it from
  inside (`?cam=` near (-1200, y, -880)) when the look pass touches tunnels.
- **Road network on the core:** 95.4% connected, just above the 95% bar. The rest is mostly Mission Bay's new streets
  (2016 curbs), Terry A Francois Blvd's one-way loop, and the Telegraph Hill stairs streets.
- **Some pier decks show as flat white slabs on the water** off the Embarcadero (not looked into; P5 piers).
- **`build in under 2 s`** in `tests/road-network.test.cjs` runs at 1.2–1.7 s on the core in vm: tight if the network
  grows (P6 region has no traffic, so it shouldn't).
- `docs/data-sources.md` still has the USGS 3DEP license row as "confirm on the product page" (from P1).

## Decisions made this phase

P3-1 … P3-7 in `PLAN.md` §10: the core box and the tests' recalibrated bounds, no streaming, grade separation
(tunnels, bridges, estimated freeway decks), the core's road-network rules, the 40% grade cut, Lombard's crooked
block and the rail medians, landmark teleports and the landmarks query fix.
