# Phase 9 — believable collisions

Status: P9.1 implemented and verified on 2026-10-23. P9.2–P9.5 remain open.
Requested by Kamil after the Phase 8 showcase; Phase 8 is committed as `e17d6c8`.
Goal: contact occurs where the visible objects touch, and its consequences match the object and impact speed.

## Original findings (before P9.1)

- `js/controllers.js`, `resolveHorizontalCollision`: the car's projected bounding extents are used as the final
  contact test for axis-aligned walls. For oriented walls only the wall axes are tested, rather than both bodies'
  axes. This can report contact in empty corners around a rotated car.
- Reproduced with the production resolver: car center (100,100), heading 45°, half-width .86 m, half-length
  2.18 m; obstacle x=[101.9,102.1], z=[97.9,98.1]. The obstacle is separated from the car along its lateral
  axis, yet the resolver moves the car 0.2496046 m. Turn this case into a regression test.
- `js/buildings.js`, `outlineStrips`: irregular rendered footprints have collision approximations made from
  1.5 m strips. The union of sample spans can protrude past a slanted wall. Landmark/podium colliders also
  need visual comparison; the corner reproduction does not prove every early hit has the same cause.
- Building impacts already produce reverse bounce, suspension impulses and sparks. Contact locations are
  estimated and there is no impact sound/camera-shake system. A hard hit reverses 25% of forward speed,
  which is too springy for the intended heavier feel.
- `js/sf-street-details.js` generates snapped tree sites; `js/trees.js` adds species-specific scaling, yaw,
  lean and procedural geometry. It returns rendering/LOD objects, not trunk colliders. Trees are absent
  from the static collider list passed to the player controller.
- `js/traffic.js` handles player-to-vehicle contact, but pedestrians only walk/render. There is no
  player-to-pedestrian physical contact or reaction state. Assisted yielding is separate from physical impact.

## Implementation order and scope

### P9.1 — accurate building contact

- Add an opt-in debug overlay showing actual player body, candidate colliders, contact point and normal.
  Keep this out of the normal HUD. Reproduce angled corner, slanted facade, concave footprint and landmark cases.
- Define player body dimensions once, measured against the visible models. Reuse them for collisions, safe
  spawns/resets and ride clearance checks instead of duplicating dimensions and arbitrary margins.
- Retain the spatial index for nearby candidates; use full oriented-box SAT for box-shaped surfaces and
  exact circle/segment or convex-polygon tests for other shapes. Broad bounds only select candidates.
- Use the same footprint geometry as rendering for irregular buildings, preserving concavities and openings.
  Decompose where needed; avoid collision normals from internal decomposition seams.
- Preserve height/grade separation so walls above tunnels and streets below the Transit Center stay passable.
- Add swept contact or bounded substeps so fast movement cannot skip a thin obstacle. Resolve earliest contact,
  remove inward velocity and retain tangential motion; use a small explicit contact tolerance.

Acceptance: the reproduced false hit no longer moves the car; actual overlaps still resolve. Parallel wall
scrapes slide without repeated kicks. No meter-scale stand-off at oblique corners or slanted facades.
Visual contact target: within 10 cm of the visible structural surface in the named review fixtures.

### P9.2 — solid tree trunks

- Export trunk collision metadata from the same species geometry and final transforms used to draw trees,
  including sidewalk snapping, per-instance scale and lean. Do not use the canopy bounds as a solid obstacle.
- Use tapered trunk segments/capsules (or conservative short segments), indexed alongside static geometry.
  Register the downtown trees first; regional scenery/flight-only collisions are a separate follow-up.
- Cars stop or deflect on the trunk; walkers and cyclists cannot pass through it. Foliage stays soft.
- Trunks are fixed obstacles for this pass. Small crown movement/leaf particles may support a hit; tree
  felling, trunk breakage and persistent destruction are outside this first pass.

Acceptance: direct, glancing and boosted hits on thin/thick trunks at 30 and 60 Hz; no tunneling, invisible
canopy wall or collider drift when tree LOD changes. Verify snapped trees and different species/scales.

### P9.3 — pedestrian physical contact and reactions

- Give placed pedestrians a body capsule; detect swept vehicle/capsule contacts with height filtering.
  Keep pedestrians yielding to approaching traffic independently of impact handling.
- Add states: walking → stumble or knockdown → recovery → walking. Reaction uses relative contact speed
  and direction. A pedestrian is much lighter than a vehicle, not a wall that reverses the whole car.
- Show a visible step-back/stumble for slow contact and a short non-graphic fall for stronger contact.
  Start with controlled animation and bounded displacement, not a full physics-engine ragdoll integration.
- Impact overrides path following until recovery; stop the next walk update snapping the person back.
  Do not respawn a struck person while visible. Rejoin a valid sidewalk/crosswalk without popping.
- Separate persistent overlaps and new impacts so a resting car cannot repeatedly launch the same pedestrian.
  Pedestrians must not be pushed through buildings or trunks during the reaction.

Acceptance: front/side/reverse hits and a parked overlap; visible reaction on real contact, no reaction on
near misses, no per-frame impact spam, safe recovery on hills/curbs and no visible respawn.

### P9.4 — impact feel and materials

- Emit one shared contact event containing point, normal, relative speed, object type and participants.
  Physics, sound, camera and particles consume the same event.
- Walls: brief body jolt, low rebound, concrete/metal scrape or thud at the actual contact point.
  Trunks: dull wood impact with restrained leaf/bark effects. Pedestrians: muted contact/stumble cue, no sparks.
- Scale feedback by normal impact speed; sliding contact should not sound like a repeated crash.
  Brief camera shake only for meaningful vehicle impacts, respecting reduced-motion and sound preferences.
- Reuse the existing Web Audio context, mute/pause rules and bounded particle pooling. No new downloaded assets required.

Acceptance: low-speed contact remains subtle; strong impact is obvious; glancing scrape differs from a head-on
hit; sound mute and reduced-motion settings work; callbacks/particles do not accumulate during sustained contact.

### P9.5 — regression and visual gate

- Unit fixtures for exact geometry, concavity, grade separation, sweep/tunneling and contact-event cooldowns.
- Integration tests for trunk placement/LOD, pedestrian reaction/recovery and consistent reset/ride clearance.
- Rerun the full suite, including the three zero-contact Ferry-to-Nob Hill rides and existing traffic simulations.
  Extend ride metrics to distinguish pedestrian/trunk contacts; do not hide new collisions or relax existing gates.
- Capture short before/after clips: close wall pass, frontal wall hit, tree hit, pedestrian stumble/knockdown.
- Compare the same street/car benchmarks before/after. Proposed incremental nearby collision/reaction CPU budget:
  p95 ≤ 1 ms on the current test machine, while retaining the existing frame-rate floors. Measure it; do not
  substitute total FPS for a collision-cost measurement. Keep simulation colliders independent of render LOD.

## Delivery recommendation

Deliver P9.1 + P9.2 first so the solid world is trustworthy, then P9.3 + P9.4, then the complete gate.
A general-purpose physics-engine migration, vehicle deformation, breakable buildings and full ragdolls are
larger follow-ups; they are not prerequisites for fixing the reported problems.

P9.1 is complete. Tree trunks, pedestrian reactions, shared material/audio feedback and the full Phase 9 gate remain open.


## P9.1 delivery and evidence — 2026-10-23

- `js/world-collision.js` defines the tapered player body once. Full convex SAT handles boxes and convex
  outlines; concave contact exits the union of the original polygon and its swept boundary, avoiding internal
  decomposition seams. Irregular colliders share the exact points used by the building extrusion.
- Production driving, reset placement and route screening use the same body geometry. Circle modes now use
  actual distance to wall corners. Height filtering and existing Transit Center openings are retained.
- Car movement bounds translation plus bumper rotation to 15 cm per substep. Contacts remove inward velocity,
  preserve sliding velocity and separate by 2 mm; stronger impacts keep a restrained body jolt and sparks at
  the computed wall point. Shared impact audio/camera feedback is still P9.4 work.
- 198/198 full-suite tests pass with serial scheduling and no retries. Eleven focused geometry/controller
  tests cover the original false corner, oblique and concave walls, both windings, vertical clearance,
  thin-wall boost/reverse at 30/60 Hz and sustained sliding. Three full-city rides remain contact-free.
- Actual browser fixture: outline building 7949 near Market/2nd. A 25 cm clear approach, six 5 cm inward
  steps, and a 1 m parallel move confirm a 2 mm contact gap with zero correction during the parallel move.
  [Review gallery](../review/p9-buildings/index.md) includes the production geometry overlay.
- Resolver CPU p95: 0.0950 ms at 11 m/s, 0.1985 ms at 36 m/s. Paired incremental p95 is 0.0909/0.1939 ms,
  within the proposed 1 ms nearby-collision budget. Rare measured maxima reach 41.0674 ms; this is a Node
  CPU benchmark, not a hard per-frame guarantee or a browser/GPU performance claim.

Limits: no claim that every decorative landmark projection matches a solid mesh. Existing landmark solids,
vertical tolerances and model simplifications remain. Mirrors and small sensor projections are excluded from
rigid car contact. The body-profile regression is within 10 cm; further user-reported facade mismatches should
be checked with `?debug=collisions`. Trees/pedestrians still require their planned physical-contact passes.
