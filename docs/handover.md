# Handover — 2026-10-23, Phase 8 complete; commit pending

## Next action

P8.1–P8.6 are complete, including the uninterrupted assisted browser ride and passenger exit.
Kamil runs the single final batch in `docs/commits.md`;
it replaces the uncommitted checkpoint. No Git writes, tags, deployment or publication performed.

## Implementation

- `js/ride.js`: legal directed lanes and connector curves, real heights and static collision screening.
  Final 2.146 km route: Embarcadero → Washington → Sansome → California, near Grace Cathedral.
- `js/traffic.js`: shared grouped-junction reservations drain existing/committed traffic; held approaches
  relinquish priority votes. Same-path leaders can be followed. Reservations release on clearing, takeover,
  cancellation, recovery or completion. Physical collisions, signals and pedestrian yielding remain active.
- Curved-path footprint checks fix false stops beside opposing traffic. Existing manual steering is preserved.
  No collision bypass, traffic removal or autonomous teleportation.
- `js/ride-ui.js`: pickup/boarding/drop-off/exit, passenger and ring, next-turn card, takeover/resume/recovery,
  actual route on both maps, cancellation on mode changes/teleports. Map and Settings pause the whole city.
- `js/ride-audio.js`: one lazy Web Audio context. Helicopter rotor/wind including hover; walking footfalls
  silent at rest/in air; bicycle chain/tire; EV motor/road; door, turn and completion cues. Shared Sound toggle
  works in free roam. Off after reload; a ride enables it unless explicitly muted. Pause/map/hidden suspend it.
- Toolbar wraps at narrow widths and the ride card scrolls on short screens.

## Automated evidence

Full serial regression suite: **182/182 pass**, no retries, 207.0 s. Three production-controller traffic seeds
include live cars, buses, pedestrians, hills/signals and all 62,650 static colliders. Each completes pickup
through passenger exit without recovery and with zero world contacts, traffic impacts or traffic overlaps.
Seed 3: 561.0 s; seed 8: 589.2 s; seed 21: 462.7 s, all below the original 720 s limit. Maximum route-center
deviations 4.268 / 4.549 / 4.590 m occur at junctions. Mean assist CPU cost 0.661 / 0.649 / 0.611 ms.
Normal traffic's existing ten-minute regression also passes. Static package and whitespace checks pass.
No thresholds were relaxed. See `docs/perf-log.md` and `docs/phases/phase-8-first-ride.md`.

## Browser evidence

The High/midday preview with Normal traffic completed in 463.494 driving seconds (7m 43s), with zero
world contacts, traffic impacts or overlaps; maximum deviation 4.859 m. No manual driving or recovery.
A deliberate full-map pause held progress unchanged and resumed; Settings opened/resumed correctly.
No console warnings/errors. Observed HUD samples 85–120 fps at 984 × 853, not a percentile benchmark.
The preview is left at Nob Hill after passenger exit. Evidence and screenshots: `docs/review/p8/`.

## Limits and review

These checks cover the featured route, not unrestricted autonomy on all streets or every traffic seed.
Passenger animation is a simple walking figure and door cue, without an animated vehicle door. Audio is
synthesized; functional mode/mute tests pass, but no subjective listening claim is made.
Phase 7's broader user visual/driving acceptance and optional tag remain separate. Regional scenery is still
primarily for flying. Possible next scope: richer passenger/arrival presentation, more curated rides and
traffic-aware transit interactions; agree that scope with Kamil before starting another phase.

The localhost:8081 preview server (session 49391) remains running for Kamil. Leave other servers untouched.

## Subsequent showcase request — complete

Created two silent 14-second 1280×720 / 30 fps H.264 videos: Waymo on Market Street and helicopter beside
Salesforce Tower. Delivered with short GIF loops and suggested post text in
`/Users/Kamil/Desktop/Slop SF Showcase - 2026-10-23/`. Nothing was posted.
README now opens with the two GIFs and verified 15,735 core / 154,870 regional building counts, explicitly
distinguishing scenery from the driving core. Capture provenance/reproduction: `docs/media/README.md`.
Opt-in `tools/dev/showcase.mjs` stages camera/vehicle paths only when `?showcase=car|heli` is present;
normal gameplay does not load it. Full-resolution raw/MP4 files stay in ignored `shots/showcase/`.
Both encoded clips were inspected at multiple points, output codec/dimensions checked; 7 boot/teleport tests
pass after the opt-in main.js integration. No full regression rerun was needed for this isolated capture path.
The pending Phase 8 command in `docs/commits.md` now includes the showcase files because Phase 8 is still
uncommitted; do not run an older batch that omits them.

## Next requested improvement — collision realism plan

Kamil requested investigation and a plan for early building contacts, driving through trees and pedestrians
without reactions. See `docs/phases/phase-9-collision-realism.md`. Confirmed missing trunk colliders and
pedestrian impact handling; reproduced a 0.2496 m false corner push in the production building resolver.
Recommended order: exact building contact, tree trunks, pedestrian reactions, material-aware impact feedback.
No P9 gameplay code has been changed. Preserve the pending Phase 8/showcase work.

## Player Waymo detail pass

Dedicated player-only I-PACE-inspired body and sensor/wheel detail layer in `js/waymo-detail.js`;
traffic remains instanced with the old lightweight geometry. Roof tray/lidar/lenses/display, fender pods,
grille/projectors/DRLs, split-spoke wheels, handles, wipers, spoiler and lettering are modeled.
Physical clearcoat is limited to the hero car. Horizontal gameplay envelope/wheel centers are unchanged.
Do not copy cached `_body`/`_layout` closures from traffic specs: the regression test covers that bug.
39 targeted model/boot/controller/light tests pass, static build and syntax/whitespace checks pass.
Review geometry: 40,804 triangles / 27 meshes, no GPU timing claim. Gallery: `docs/review/waymo/`;
reference and limits: `docs/vehicles/waymo.md`. This is procedural artwork, not manufacturer CAD.
Glazing remains opaque/tinted and the interior is only simple forms. Collision realism remains a plan.
The README Waymo GIF was refreshed; the latest Desktop video has the `-detailed` suffix, preserving
the original export. All changes are folded into the final pending Phase 8 batch in `docs/commits.md`.

## Waymo cinematic angle revision

User reported tree occlusion in the Market Street recording. Replaced sidewalk-side orbit in
`tools/dev/showcase.mjs` with a fixed road-facing offset (-1.5 m lateral, 9 m trailing, 3 m height),
looking 3 m ahead. Trees remain in scene. Re-recorded and inspected 28 frames at 0.5 s intervals: no
foreground tree obstruction of the car. H.264 output 1280×720, 30 fps, 13.933 s; README GIF refreshed.
Latest Desktop files use `-clear-view` suffix; prior clips retained. Syntax/whitespace checks pass;
no runtime driving changes or extra regression suite needed. Existing pending commit paths cover this.

## Car-only cohesion revision — complete

Kamil rejected the stacked/fragmented appearance. Reviewed official Waymo I-PACE imagery and all
vehicle angles. Replaced separate roof trays/rails with one rounded fairing whose lower ring follows
the production roof surface (8 mm overlap); the lidar collar/display now share that roof-relative
height. Lower hood, fuller glasshouse, sculpted doors/hood, smoother wheel openings, closer rear pods
and spoiler, matched paint and reduced bright trim make the body more coherent. No city, collision,
traffic or handling changes in this revision.

Ten final views in `docs/review/waymo/`: front/rear, four corners, both profiles, overhead and wheel.
The right-side review camera moves closer to avoid a foreground tree. Geometry 46,370 triangles /
28 meshes. The first custom fairing lacked UVs required for material batching; corrected and browser
verified after reload. Targeted tests 41/41, static build/syntax/whitespace pass. Full suite 184/186
on first parallel run: unchanged drape (39.827 s > 10 s) and road build (24.465 s > 2 s) timing checks
failed under load. Both passed separately with original limits: drape test 9.248 s total; road build
test 1.466 s total (4/4 road tests passed). All three traffic seeds remained contact-free.

README GIF refreshed with this model and the unobstructed camera. New Desktop export uses
`slop-sf-waymo-market-cohesive.mp4` / `waymo-market-cohesive.gif`; 14.000 s, H.264, 720p30.
Inspected 28 half-second frame samples. Previous versions retained. Final pending P8 command updated
in `docs/commits.md`; user commits. P9 collision implementation is still not started.
