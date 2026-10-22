# Handover (2026-10-22, end of phase 1)

## State

**Phase 1 is complete; the gate passed.**
- Tests: 107/107.
- Probe: 0 errors.
- Gallery: `docs/review/p1/index.md`.
- Perf: `docs/perf-log.md`.

The engine boots on the flat San Francisco slice:
- curb islands come from DataSF curbs;
- buildings are extruded from the real footprints and lidar heights;
- teleports cover the Ferry Building, Market, Transamerica, Chinatown, Powell and Nob Hill.

## Next session: start phase 2 (`docs/phases/phase-2-vertical-slice.md`)

1. **Start the dev server in the background:** `node tools/serve.mjs 8080`. Probe with `node tools/dev/probe.mjs ...`.
2. **P2.0 ground audit first.** The research list (`docs/research.md` §3) is accurate. New modules exist since then:
   - `js/sf-ground.js`: the flat ground, curb islands, piers;
   - `js/sf-buildings.js`: v0 extrusions;
   - `js/data-loader.js`: `window.NYC.DATA.terrain` and `.buildings` are already loaded at startup.

   These are the places to put terrain first. `city-grid.js` is no longer used (`FEATURES.ground = 'sf-flat'`).
3. **`window.NYC.DATA.terrain` = `{ header, q }`.** Heights are in NAVD88 metres, in the format of `docs/formats.md`.
   - `js/terrain.js` (P2.1) should wrap it.
   - Water level: −1.07 m.
   - The flat P1 world uses y = 0 for land and `ISLAND_BOUNDS.waterLevel = −2.2` for water. In P2 world y becomes NAVD88: make `waterLevel` = `GEO.data.terrain.waterLevel`.
4. **Bench paths in `js/main.js` (`BENCH_PATHS`)** have fixed y. In P2 make y relative to the ground (`heightAt(x, z) + y`), or the street bench will run underground.
5. **Shots** in `tools/dev/shots.json` use `cam=` with absolute y. They need the same treatment (P1.4 harness: add `camGround=1`, meaning y above ground).

## Half-done or deferred

- `docs/data-sources.md` license row for USGS 3DEP still says "confirm on the product page". Not confirmed in P1.
- OSM cable car lines are not identified yet (P4.6).
- Curb gaps: about 2.2% of curb length is dropped, in SoMa / Transbay and the north Embarcadero. Revisit when the core is built (P3), where more such blocks appear.
- The NYC `buildings.js`, `street-details.js`, `landmarks.js` and traffic modules still load (they define functions only), but nothing calls them. The NYC `boroughs.js` is not loaded.

## Risks noticed

- **Context:** this session reached about 64% of a 1M-token context in planning plus P1. Phase 2 is bigger: start it in a fresh session (this handover plus PLAN are enough).
- **Headless Chrome:** caps at the display rate unless the probe's flags (`--disable-gpu-vsync --disable-frame-rate-limit`) are kept.
- **Heap in shots mode** accumulates across navigations; take heap numbers from bench or single-page mode only.
