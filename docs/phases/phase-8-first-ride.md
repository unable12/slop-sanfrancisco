# Phase 8 — the first robotaxi ride

Scope authorized by Kamil: Ferry Building → Nob Hill with reliable driving, route guidance, pickup/drop-off and
sound. Follow-up includes helicopter, walking and cycling audio and shared junction right-of-way.

- [x] P8.1: legal directed lane route, actual connector curves, real heights and full-world collision screening.
- [x] P8.2: production car physics, signals/stop signs, shared crossing reservations and curved-path clearance;
  zero impacts, zero overlaps and zero wall contacts in three full-city traffic seeds.
- [x] P8.3: pickup, boarding, driving, drop-off, alighting and completion; distance/speed gating and passenger marker.
- [x] P8.4: next-turn guidance, progress, real route on both maps, manual takeover/resume and off-route recovery.
- [x] P8.5: optional sound for all four modes, ride cues, shared mute, pause/map/hidden-tab handling.
- [x] P8.6: final regression suite, uninterrupted browser completion, UI/performance evidence and final handover.

## Final design

The 2.146 km route uses Embarcadero → Washington → Sansome → California, ending on the road near Grace Cathedral.
Drumm receives a route-cost penalty because its narrow downtown queue made the earlier journey unnecessarily slow.
Every sampled lane/connector clears the production collision set at radius 1.55 m, exceeding the car's 1.35 m radius.
Assistance feeds speed and steering targets into the same car physics used for manual driving. No collision bypass,
traffic removal or autonomous teleportation is used.

Junctions less than 30 m apart form crossing groups. AI traffic and the ride share one reservation for each group.
Vehicles already crossing, vehicles unable to stop comfortably, and queued leaders ahead drain first. A leader
following the identical lane/connector may be followed normally; conflicting vehicles clear before the ride enters.
Held approaches retain their physical footprint but relinquish merge/wait-time priority. Spawning avoids reserved
edges. Reservations release after the taxi's tail clears or on takeover, cancellation, off-route recovery or completion.
Signals, stop signs and pedestrian yielding remain active.

Obstacle checks intersect the curved route corridor with oriented traffic footprints. The old straight-ahead test
incorrectly stopped beside opposing California Street traffic during a turn. A focused regression recreates that
case and also verifies that a vehicle placed in the actual route still stops the taxi. Original manual steering is retained.

The map pauses the whole city, avoiding a taxi drifting through a turn while the AI keeps moving. Settings likewise
pause the simulation. Audio uses one click-activated context and bounded looping sources, with short-lived cue nodes
cleaned up after playback. No external audio assets, voice service or autoplay.

## Measured driving evidence

All three normal-density simulations include live cars, buses, pedestrians, real hills/signals and the 62,650 static
colliders. They use the production controller at 30 Hz, preserve the existing 720 s completion limit, and finish
pickup through passenger exit without recovery. Zero world contacts, traffic impacts and traffic overlaps in each:

| Traffic seed | Driving time | Maximum route-center deviation |
|---|---:|---:|
| 3 | 561.0 s | 4.268 m |
| 8 | 589.2 s | 4.549 m |
| 21 | 462.7 s | 4.590 m |

The large deviations are within junction curves; the full collision set remains active. These checks establish the
featured ride's regression coverage, not unrestricted autonomous driving on every city street. UI allows 5–12 minutes
because traffic density and signal timing vary. Subjective sound character remains a matter for user review.

## Investigation history

The checkpoint completed with three low-speed contacts. Independent crossing prediction and broad yielding caused
mutual waits. Single-node reservations trapped cars between the Embarcadero's closely spaced nodes; grouped
reservations fixed that. Held cars still winning priority votes caused another queue; shared priority filtering fixed it.
A steering change was tested and rejected because it did not fix the opposing-lane false stop. Curved-path footprint
checks resolved that case while preserving manual physics. No test threshold was relaxed to obtain a pass.

## Browser acceptance

The actual High-quality WebGPU preview completed the assisted journey in **463.494 driving seconds**
(7m 43s), with maximum route-center deviation 4.859 m and **zero world contacts, traffic impacts and
traffic overlaps**. No manual driving or recovery occurred. One deliberate map inspection paused the city
and held progress unchanged; closing it resumed the trip. Pickup, boarding, guidance, stopped arrival,
passenger exit and completion were verified through the UI. Settings opened with Normal traffic/High
quality and resumed correctly. No console warnings/errors were recorded.

Observed HUD readings were 85–120 fps at the actual 984 × 853 viewport, High/midday; these are sampled
readings, not a fixed-path percentile benchmark or GPU-cost measurement. See `../review/p8/` for screenshots,
console diagnostics and regression results. Phase 8 is complete and waiting for Kamil to commit.
