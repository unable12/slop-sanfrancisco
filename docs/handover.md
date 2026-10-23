# Handover — 2026-10-23, demo README and licensing ready

## Next action

Kamil committed Phase 8/showcase/car work as `e17d6c8` and building/toolbar fixes as `2237c78`.
The README/license documentation batch is now pending in `docs/commits.md`. No Git writes performed. Kamil now prioritizes finishing a polished demo. Defer tree trunks, pedestrian reactions and further impact
feedback; do not start them automatically. The Phase 9 plan remains an optional backlog, not a demo release
requirement. Next: commit the pending batch; if an interactive public demo is wanted, publish and check the
hosted URL. Road holes are also explicitly deferred.

## What changed

- `js/world-collision.js`: one tapered car footprint, full convex SAT, exact concave boundary contact and true
  circular corner contact. Broad bounds only gather candidates. Geometry cache assumes immutable colliders.
- `js/buildings.js`: irregular collision polygons share visible extrusion points, replacing 1.5 m strips.
  Existing landmark/grade solids and height filtering are retained.
- `js/controllers.js`: shared exact clearance for safe placement, bounded car movement/rotation substeps,
  2 mm separation, inward velocity removal and retained wall sliding. Contact point drives existing sparks
  and restrained body jolts, with cooldown. No new shared impact audio/camera system yet.
- `js/ride.js` / `js/ride-ui.js`: heading-aware route clearance uses the same car geometry with 15 cm margin.
- `tools/dev/collision-review.mjs`: opt-in `?debug=collisions` footprint/wall/contact overlay and repeatable
  5 cm approach / 1 m parallel moves. This module is absent from ordinary gameplay.

## Evidence

198/198 full-suite tests pass with serial file scheduling, no retries (164.3 s). Three full-city assisted rides
remain zero-contact/zero-overlap within existing limits. Eleven focused geometry tests cover the original
false corner, slanted/concave shapes in both windings, vertical clearance, thin-wall boosted forward/reverse
at 30/60 Hz, sustained sliding and body-profile agreement within 10 cm. Static build/syntax/whitespace pass.
Actual browser fixture: building 7949 near Market/2nd; 25 cm clear approach, six 5 cm inward steps, then 1 m
parallel move. Final gap 2 mm, slide correction zero. Gallery: `docs/review/p9-buildings/`. No console errors.
Normal High/midday preview restored. Server session 49391 remains running at localhost:8081; leave it.

Resolver CPU p95 at 11/36 m/s: 0.0950/0.1985 ms; paired incremental p95 0.0909/0.1939 ms against `e17d6c8`.
Meets proposed ≤1 ms p95 budget. Max 41.0674 ms retained, cause not isolated. This is Node CPU timing, not a
new browser/GPU/FPS guarantee. Reproduce via `node tools/dev/bench-collisions.cjs e17d6c8`; data in
`docs/reports/p9-building-collisions.json`, methodology in `docs/perf-log.md`.

## Remaining limits

Mirrors/small sensors are excluded from rigid body contact; decorative landmark solids may still be simplified.
Existing vertical tolerances remain. Trees still lack trunk contact and pedestrians still lack physical impact
reactions: do not mark those complete. Shared material-aware audio/camera feedback and full P9 media/performance
gate remain future work. Phase 7 user acceptance/tag is separate. No deployment or publication performed.
Earlier P8 ride/showcase/car evidence remains under `docs/review/p8/`, `docs/review/waymo/` and `docs/media/`.


## Follow-up: compact toolbar — complete

User reported the top toolbar overlapping the title and the fog select looking disconnected. `index.html`
now groups brand and toolbar in one wrapping container; CSS compacts the brand and styles native fog selection
consistently beside time controls. A ResizeObserver in `main.js` reserves the actual toolbar height for the
ride card and touch camera cluster. No atmosphere rendering or road-hole changes. Nine desktop viewport widths
320–1440 px checked with no top-control overlap/offscreen bounds. Settings/fog sync and clean view verified;
ride card gap 12 px at 390 width. Five existing boot/settings tests, build/syntax/whitespace pass. Evidence in
`docs/review/hud-responsive/`. Physical touch hardware and the rest of the mobile HUD were not audited.
P9.1 remains uncommitted, so the latest batch in `docs/commits.md` now includes these shared-file UI changes.


## Demo finish scope — latest user direction

Use the existing Desktop `Slop SF Showcase - 2026-10-23` exports: `slop-sf-waymo-market-cohesive.mp4`
and `slop-sf-helicopter-salesforce.mp4`. Earlier Waymo variants are superseded. README GIFs and showcase
code were committed in `e17d6c8`; full MP4s are intentionally outside Git. Clips are silent staged engine
captures. User wants a nice demo soon, not completion of all realism backlog items. No publication performed.


## README / GitHub request — 2026-10-23

README now starts with @unable0_ credit and both existing animated GIFs, describes a playable demo rather
than the obsolete Phase 5 WIP, explains the data/rendering/ride architecture, and includes setup, package,
controls, tests and honest limits. MIT body unchanged; original Mr.doob notice retained and Kamil's SF
contribution notice added. NOTICE separates code/dependency licenses from geographic data terms.
Both GIFs verified as 50-frame, 576×324, five-second animations. Relative doc/image links checked.
Remote GitHub main was verified through the API at `58dfcae` (five commits behind local `2237c78`); its README
still described Phase 5 and had no showcase GIFs. Repository is private and homepage is unset. User owns
commit/push; latest docs command includes a normal push to update the old remote and existing media together.
No public demo deployment or repository visibility change is part of this task.
