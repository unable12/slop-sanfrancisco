# Handover (2026-10-22, end of phase 5)

## State

**Phase 5 is complete; the gate passed** (`docs/phases/phase-5-landmarks.md`, Gate and Results).
- Tests: 144/144 (`node --test tests/*.test.cjs tests/*.test.mjs`). New: `landmarks-data` (3), `landmarks-runtime` (4,
  with the shared headless build `tests/helpers/landmarks-build.cjs`), a landmark-collider case in `controllers`; the
  boot test counts 32 scripts.
- Probe benches (two runs each): street 172/172, car 154/147, heli 145/137, hill 125/127, russian-hill-view 116/127 fps;
  live heap ≤ 691 MB; ready ≤ 7.0 s; 0 errors. Level with P4 within the noise.
- Gallery: `docs/review/p5/index.md` (43 shots, self-review). Landmark notes with sources and model notes:
  `docs/landmarks/*.md`, index `docs/landmarks/INDEX.md`. Perf: `docs/perf-log.md`. Decisions P5-1 … P5-6 in `PLAN.md` §10.

**Commits.** Kamil commits (K1). Phase 4 is committed (9cf1eda). Nothing of phase 5 is committed yet: **one
ready-to-run command** at the end of `docs/commits.md`.

## What phase 5 added

- **Data.** `tools/geo-landmarks.mjs` (sites, DEM ground, OSM 3D parts, bridges, region ground),
  `tools/queries/landmarks-named.overpassql` over a new `landmarks` box (`tools/boxes.json`), `--osm` option in
  `tools/fetch-geodata.mjs`. `GEO.landmarks` gains `base`, `groundTop`, `topH`, `slug`, `tier`, `parts`, `field`,
  `buildings`, `detail`; `GEO.bridges`; `GEO.data.region` → `data/terrain-region.bin` (`docs/formats.md`). The x54 DEM
  tiles are in `data/raw/dem` (289 MB). The core's terrain and buildings binaries are unchanged (`geo-terrain.mjs` now
  lists only the tiles a box reads).
- **Runtime.** `js/landmarks.js` (NYC content replaced: part builder, `fitToSite` without scaling, OSM part renderer with
  dome/pyramidal/gabled roofs, 22 models, Lombard); `js/sf-bridges.js` (both bridges, `bridgeDeckAt`, far detail LOD);
  `js/terrain.js` patches (`addPatch`, `patchesEnabled`); `js/sf-ground.js` region ground (and `?region=0`);
  `js/data-loader.js` loads the region; `js/buildings.js` leaves generated masses under modelled outlines;
  `js/grade-separation.js` lays the I-80 deck on the Bay Bridge; `js/main.js` builds the bridges and switches the
  patches off while the street network is built.

## Next session: start phase 6 (`docs/phases/phase-6-region-atmosphere.md`)

1. Read `docs/commits.md`: if the phase 5 command is still pending, leave it; don't redo the work.
2. P6.1 fetches the city box: the four SF DEM tiles are already in `data/raw/dem`. Replace the interim region ground
   (PLAN P5-1): `data/terrain-region.bin`, `buildRegionGround` in `sf-ground.js`, the `Terrain` patches (keep
   `patchesEnabled` off while the street network is built, or the streets past the core's terrain become land) and the
   0 m sea threshold (`SEA_FLAT` in `geo-landmarks.mjs`: the bay is flattened at -0.4 m round Alcatraz). Keep Alcatraz's
   4 m patch or fold it into the region tiers.
3. The far landmarks (Sutro Tower, the Palace, Golden Gate Park's buildings, the Painted Ladies, Mission Dolores) then
   get the region's buildings and parks round them; the Golden Gate's Marin end and the Bay Bridge's Oakland end get
   their ground (the far tier).
4. P6.3 fog: from Twin Peaks the Golden Gate is lost in the default haze (7.5 km); the marine layer should let the
   towers stand out of it.

## Open questions / risks

- **Estimates in the models**, all labelled in `docs/landmarks/*.md`: the Bay Bridge's deck heights and truss (only the
  67 m clearance and tower heights are sourced), the Golden Gate's deck depth, Salesforce Tower's taper and corner
  radius, Transamerica's base, Oracle Park's stands and light towers, the turntable's diameter, Lombard's beds and
  stairs, roofs and colours where no source gives them.
- **The Bay Bridge approach** climbs at 4.5% to the deck from up to 900 m inland: ramps meeting I-80 there are raised
  with it (junction heights). Highway traffic drives it; check it in a drive-through if anything looks off.
- **Region ground cost** is within the bench noise; it adds ~1M triangles and ~35 MB live heap. P6's full region adds
  177k buildings on top: budget it there.
- **Still open from P4:** rail vehicles invisible to traffic, curb gaps in SoMa/Mission Bay, the heli bench's p95 from
  tree uploads (23 ms), the USGS license row in `docs/data-sources.md`.
- Not done: cars turning on the turntable; Pier 39; the Palace's lagoon and exhibition hall; Alamo Square's park.

## Decisions made this phase

P5-1 … P5-6 in `PLAN.md` §10: the interim region ground; landmarks from OSM's 3D parts or sourced hand models, placed
without scaling; masses left out only under modelled outlines; the Bay Bridge driven by the highway traffic (today's
east span, not the demolished cantilever); bridge detail hidden beyond 3 km; Tier 2/3 status.
