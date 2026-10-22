# Handover (2026-10-22, end of phase 4)

## State

**Phase 4 is complete; the gate passed** (`docs/phases/phase-4-sf-look.md`, Gate and Results).
- Tests: 136/136 (`node --test tests/*.test.cjs tests/*.test.mjs`). New: `buildings-runtime` (4), `transit` (1), and a
  storey-height case in `facade-base`.
- Probe benches (two runs each): street 161–169, car 152, heli 137–139, hill 123–127, russian-hill-view 127 fps; live
  heap ≤ 587 MB (≤ 753 MB read without a GC); ready ≤ 5.9 s; 0 console errors.
- Gallery: `docs/review/p4/index.md` (with a self-review). Perf: `docs/perf-log.md`. Decisions P4-1 … P4-7 in
  `PLAN.md` §10.

**Commits.** Kamil commits (K1). Nothing of phase 4 is committed yet: **one ready-to-run command** at the end of
`docs/commits.md`. The P4.1–P4.3 and P4.1–P4.5 batches above it are superseded.

## What the SF look added

- **Data.** `data/buildings-core.bin` version 3 carries the P4.1 class fields (`docs/formats.md`). The rules are in
  `tools/building-rules.json`, the report in `docs/reports/building-types-core.md`.
- **`GEO`** (`js/sf-geodata.js`) adds `trolley`, `muniStops`, `bikeways`, `trees` and `transit`. The tree classes are
  in `tools/tree-classes.json`.
- **`js/sf-style.js`:** palettes and surfaces.
- **`js/sf-buildings.js`:** fronts (bays, garages, stoops, gables), warehouse doors and docks, civic colonnades, crowns
  and spires.
- **`js/sf-transit.js`:** streetcars, Muni Metro and cable cars.
- **`js/sf-street-details.js`:** Muni stops and shelters, trolley wires, parking meters, street trees.
- **`tsl-materials.js`:** the pre-war material's `paint` and `muntins` modes, and `boxBase` as vec3 (storey height).
- **Fleet (`actor-models.js`, `traffic.js`, `controllers.js`):** a van body, the black-and-white cruiser, white
  plates and Muni's silver and red.
- **Probe:** `heapLiveMB` (forced GC) and the `[details]`, `[buildings]` and `[paint]` lines.
- **Overpass:** `tools/queries/rail.overpassql` ends `out geom`, so the route relations keep their members. The rail
  ways came back unchanged.

## Next session: start phase 5 (`docs/phases/phase-5-landmarks.md`)

1. Read `docs/commits.md`: if the phase 4 command is still pending, leave it; don't redo the work.
2. Start the dev server in the background (`node tools/serve.mjs 8080`); probe with `node tools/dev/probe.mjs`. Read
   heap budgets from `heapLiveMB`.
3. The landmark footprints are already typed `landmark` (`tools/building-rules.json` `landmarks`: Transamerica,
   Salesforce Tower, Coit Tower, Grace Cathedral, City Hall, Oracle Park, the Ferry Building, Chase Center, Ghirardelli
   Square). Until P5 replaces them they get the generic crown rule: City Hall's dome and the Ferry Building's clock
   tower read as spires.
4. P5 owns the Powell & Market cable-car turntable (`GEO.transit` runs start and end there) and Lombard's flower beds.

## Open questions / risks

- **Frame time is up about 50% since P3** (street 244 → 161–169 fps, heli 204 → 137–139). Most of it is the 22,886
  street trees (A/B in `docs/perf-log.md`). The heli bench's p95 is 22.8 ms (P3: 7.2), from the tree field re-uploading
  its instance buffers as the camera flies; its JS takes about 1 ms, so the cost is on the GPU side. The re-sort step
  is now 10 m, or a fifth of the height above ground (`trees.js` `RELEVEL_STEP`), which fixed the street and car p95.
  Still inside the budgets (≥ 75 / ≥ 60), but P6 adds the whole city. Next candidates: upload only the changed
  levels' ranges, drop far tree shadows, fewer bay boxes far away.
- **Rail vehicles are invisible to the traffic**, so cars drive through streetcars on Market St and the Embarcadero.
  Registering them as obstacles in `traffic.js` (leaders on shared lanes) is the fix.
- **Curb gaps (SoMa, Mission Bay)** are still open from P3. 18% of street trees are left out there, and buildings
  stand on asphalt. Stairs drawn as streets and Union Square's lawn (the ground mask paves it; the park lawn mesh over
  it still shows) are also still open. None was a P4 task.
- **Estimates in the look, all labelled:** the podium height (4 storeys), crowns (spire vs mast), era by type, residential
  floor area (900 sq ft per unit), the SFPD livery (unverified) and the F-line liveries (generic).
- **Bench noise:** identical runs differ by up to ±20% on this machine, so compare medians of two runs or more.
- `docs/data-sources.md` still has the USGS 3DEP license row as "confirm on the product page" (from P1).

## Decisions made this phase

P4-1 … P4-7 in `PLAN.md` §10:
- the building rule table and its deviations from the phase file;
- per-instance paint and storey height;
- podium and crown estimates;
- street furniture sources and placement;
- street-tree classes and snapping;
- transit from the OSM route relations, and the fleet;
- the live-heap metric and the bench spread.
