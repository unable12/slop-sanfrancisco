# Phase 7: UI, map, tests, polish and release prep

**Objective.** Everything a person sees around the 3D world is SF: HUD, map, teleports, labels, loading screen, README and attribution.
All tests green, performance verified, repo clean. The user accepts the build.

**Prerequisites.** P6 gate.

---------------------------------------------------------------------------------------------------------------------

## Tasks

### P7.1 Map and minimap (`js/sf-map.js`, from `nyc-map.js`, 1292 lines)
1. NYC draws everything from `GEO`: coast, blocks with building footprints, parks, Central Park details, shore highways, street labels along centrelines, boroughs,
   bridges. Adapt: remove Central Park features, borough polygons; add SF coastline, terrain **hillshade** layer (precomputed 2D shade from the height field at load, 4 m
   or 8 m cells, drawn as a cached canvas), contour lines every 20 m (optional), neighbourhood labels, bridge lines, parks, piers.
2. "Grid north up" comments and any 29-degree compass logic in NYC: north is straight up in SF; remove the rotation compensation and keep a simple compass.
3. Click-to-teleport already exists (`onTeleport`); make it use `Terrain.groundAt`.
4. Performance: draw the static map layer once to an offscreen canvas per zoom level; keep the NYC approach if it already does this (check first).

**Acceptance:** `tests/sf-map.test.cjs` (ported from `nyc-map.test.cjs`): projections round-trip; markers are inside bounds; labels don't throw for missing names.

### P7.2 HUD, labels and teleports
1. `getLocationLabel(x,z)`: nearest street name + neighbourhood. P1.12 uses `analysis_neighborhood` from the streets data. Upgrade it to point-in-polygon if the Analysis Neighborhoods polygons are on DataSF (search the DataSF API).
2. `TELEPORT_LOCATIONS`: Ferry Building, Transamerica, Salesforce Tower, Coit Tower, Lombard Street, Fisherman's Wharf/Pier 39, Painted Ladies, City Hall, Union Square,
   Twin Peaks, Golden Gate Bridge viewpoint, Oracle Park. Each defined by name + street + heading (computed so it faces the landmark), verified on a road.
3. `index.html`: new title, description, brand block, teleport buttons (the NYC `data-teleport` list must equal the config keys: the existing test enforces this), loading text,
   HUD footer with attribution (OSM, DataSF, USGS as required), GitHub link only if the user wants one.
4. Remove NYC wording from **user-visible** text: `index.html`, CSS content strings, HUD/loading/map labels, README. Internal identifiers (`window.NYC`, `__NYC_APP`) stay (decision D2).
   - Add `tests/no-nyc-text.test.cjs`: scan `index.html` text nodes and string literals passed to `textContent`/`innerHTML` in `js/` for `new york|manhattan|brooklyn|queens|bronx|hudson|east river|central park|times square|nyc` (case-insensitive) and fail on hits.
   - Comments that describe NYC behaviour that no longer exists must be updated where the code was changed.

### P7.3 Controls and accessibility
1. Keep NYC controls and touch controls. Add slope-aware indicators? (optional: grade % in the HUD while driving).
2. Keyboard/pointer focus, `prefers-reduced-motion` (disable camera shake if present), readable contrast of HUD text over fog.
3. A pause menu with fog setting, time of day, traffic density, quality preset (draw distance for region buildings, shadows on/off).

### P7.4 Quality presets and fallback
1. Presets: Low (no SSR, no region buildings beyond 3 km, sun shadows disabled; see decision P7-1), Medium, High. Auto-select by measured frame time at startup (3 s sample), allow override.
2. If WebGPU is unavailable: show a clear message and instructions (browser support), do not crash. (NYC likely requires WebGPU; verify behaviour and keep a graceful screen.)

### P7.5 Tests, lint, cleanliness
1. `node --test tests/*.test.cjs tests/*.test.mjs` green; add the missing categories from `PLAN.md` section 6.2. Add a fast `tests/smoke-sf.test.cjs` that boots geodata + config + terrain in `vm` and runs 50 sanity assertions.
2. Remove dead NYC code paths flagged `FEATURES` as always-off; delete unused materials/functions only if no file references them (use grep, then run tests and the shot suite).
3. Keep generated files deterministic: CI-style check script `tools/check-generated.sh` re-runs the pipeline for the core box and compares hashes (optional if raw data is not present: skip with message).

### P7.6 Performance and memory final pass
Run all benches on the same machine as the baseline. Update `docs/perf-log.md`. Fix any item above budget or document the cost and reason for the exception. Measure startup phases (`[init]` logs), peak memory, GPU memory estimate (textures and buffers count from `stats()`).

### P7.7 README, NOTICE, licenses
1. `README.md`: what it is, live-demo placeholder (no URL unless the user gives one), controls, how to run (static server), how to regenerate data (fetch + build commands), data sources and licenses, credits to mrdoob/slop-newyork, limitations (signal rules approximated, style from neighbourhood tables, etc).
2. `NOTICE.md` finalised; `LICENSE` retained; attribution text in the HUD matches `docs/data-sources.md`.
3. `docs/ARCHITECTURE.md`: a one-page map of modules for future contributors (derive from `PLAN.md` section 2 updated for SF).

### P7.8 Release prep (no publishing)
1. Repo size audit; ensure `data/raw` is ignored; derived data sizes recorded. Ask (🛑) if hosting limits require splitting or compression.
2. Optional static build script `tools/build-static.mjs`: copies `index.html`, `css`, `js`, `data` to `dist/` and (if safe) gzips `.bin` files. No deploy.
3. Kamil tags `v0.1.0` locally after accepting and committing (no push; RUNBOOK §8 prohibits agent Git writes).

### P7.9 Acceptance run
Execute the success criteria from `PLAN.md` section 1 as a checklist with evidence (screenshots, bench numbers, test output). Present to the user. 🛑 wait for acceptance.

---------------------------------------------------------------------------------------------------------------------

## Deliverables
Final UI, map, README, notices, tests, perf log, acceptance report `docs/acceptance.md`.

## Risks
| Risk | Mitigation |
|---|---|
| Leftover NYC strings/assumptions | The grep in P7.2 plus a test that scans `index.html` and `js/` for banned words |
| Map hillshade cost at load | Compute in a worker or lazily after first frame; cache per zoom |
| Presets cause regressions | Test each preset with the bench harness |

## Handoff checklist
- [x] `docs/acceptance.md` written with evidence and explicit open acceptance items
- [x] Logs updated; `PLAN.md` records implementation ready and P7 acceptance still open
- [ ] Kamil accepts the build and creates the local tag after committing; nothing pushed

## Implementation notes (2026-10-23)

P7.1–P7.5 and P7.7–P7.8 implementation is present. Final performance evidence and review are recorded in
`docs/acceptance.md`. P7.9 remains open until Kamil accepts the visual build and driving behavior.
The optional full-pipeline hash checker was not added: existing generated-data integration tests cover the core pipeline;
the new neighborhood generator was independently rerun and compared byte-for-byte. The optional static build is provided.
`PLAN.md` no longer has a numbered §6.2 list; its current test requirements are covered by existing terrain, drape,
facade, building, grade separation, traffic, region and fog suites, plus the new UI/map/neighborhood smoke coverage.
