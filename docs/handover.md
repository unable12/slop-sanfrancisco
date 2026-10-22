# Handover (2026-10-22, end of phase 2)

## State

**Phase 2 is complete; the gate passed** (`docs/phases/phase-2-vertical-slice.md`, Gate).
- Tests: 126/126 (`node --test tests/*.test.cjs tests/*.test.mjs`).
- Probe benches: street 435, car 370, heli 357, hill 323 fps; heap ≤ 283 MB; ready ≤ 3.7 s; 0 console errors.
- Gallery: `docs/review/p2/index.md`. Perf: `docs/perf-log.md`. Ground audit: `docs/ground-audit.md` (every A/S item
  fixed or deferred with an owner).

**Commits.** Kamil commits (decision K1, `docs/RUNBOOK.md` §8). P2.0–P2.6 are in `git log` (P2.4–P2.6 were committed by
this session before it read K1, in its old `P2.n:` style; regroup or reword them if you like). **P2.7–P2.12 and this
handover are uncommitted**: one ready-to-run command at the end of `docs/commits.md` (the P2.7–P2.8 and P2.7–P2.11
batches above it are superseded).

## What the slice now has

- `js/terrain.js` (height API), `js/terrain-mesh.js` (64 m LOD chunks drawn per 512 m tile, seawall = terrain dropped
  under the bay, back-face 8 m shadow stand-in), ground mask `data/groundmask-slice.bin` (`tools/geo-groundmask.mjs`).
- `js/drape.js`: curb island tops CURB_H (0.15 m) over the terrain, curb faces, lawns; merged per 512 m cell.
- Buildings v1 (`buildings.js` `buildSFMasses`): rectangle covers baked into `data/buildings-slice.bin` v2
  (`tools/rect-cover.mjs`, clipped out of the road corridor by `tools/road-corridor.mjs`); facades count floors from
  each mass's ground (`boxBase` attribute, plinth); per-mass `minY` colliders.
- Player, cameras, lighting, map radar on the terrain (`controllers.js`, `cameras.js`).
- `road-network.js`: centreline graph only, height profiles (`edgeY`, `edgeGrade`, `curveY`), signals and stop signs
  from DataSF, U-turns at dead ends, `?debug=roads` overlay.
- `traffic.js`: vehicles posed on the road (axle heights, grade pitch, camber roll), grade-aware IDM, stop-sign protocol,
  per-junction signal offsets, crosswalks at every signal and stop junction at any angle, slope-aware pedestrians;
  `opts.headless` for the vm sim (`tests/helpers/traffic-harness.cjs`).
- `js/sf-street-details.js`: signal masts (lens phase per junction), stop signs, lamps, hydrants.
- `road-paint.js`: ribbons draped every metre; crosswalks and stop bars at signals and stops only.
- `js/city-grid.js` deleted (its readers fall back without it).

## Next session: start phase 3 (`docs/phases/phase-3-core-scale.md`)

1. Read `docs/commits.md`: if the P2.7–P2.12 command is still pending, leave it; don't redo the work.
2. Start the dev server in the background (`node tools/serve.mjs 8080`); probe with `node tools/dev/probe.mjs`.
   `--eval '<expr>'` (new) prints a value from the page once it is ready.
3. The core box is a data rebuild (`tools/build-geodata.mjs core`); everything downstream is box-agnostic, but check:
   - the drape takes 0.36 s for the slice in Chrome (`cityGrid` in `[init]`); the core is ~3× the area;
   - curb gaps in SoMa/Transbay (P1-3): the road corridor (P2-6) leaves 46 slice footprints unclipped there;
   - `tests/road-network.test.cjs` measures connectivity away from the box border; the core's border moves.

## Open questions / risks

- **Freeways, ramps and tunnels are out of the road network** (P2-10). The core has the Bay Bridge approaches, the
  Embarcadero ramps, the Broadway and Stockton tunnels: they need decks/bores (elevated profiles) before they can come in.
- **Market St near Montgomery** loses a few edges (junction curves graze the Market/Post/Montgomery curb islands). Look
  with `?debug=roads&cam=20,160,60,0,-70`.
- **Three-group junctions** (five-way) run on the two-phase cycle; the box logic keeps them collision-free but the
  phasing is not realistic (P4 or later).
- **Rooftop bulkheads are oversized** and every building gets one (P4 SF look).
- **Hill shadows:** wired (shadow stand-in on layer 3) but rarely visible at the golden-hour sun angle (~20°) on the
  slice's slopes; steeper ground (Telegraph and Russian Hill in the core) should show them.
- `docs/data-sources.md` still has the USGS 3DEP license row as "confirm on the product page" (from P1).

## Decisions made this phase

P2-1 … P2-11 in `PLAN.md` §10: terrain tiles, seawall from terrain, back-face hill shadows, no road conforming (D5),
512 m merge cells, road-corridor clipping of masses, floors from each mass's ground, 3 m `minY` margin for colliders,
player feel (brake hold, ground stick), the road network's SF rules and its connectivity measure, and traffic on hills
(body at the road under its middle, uphill crawl floor, curve speed floor, flat U-turns).
