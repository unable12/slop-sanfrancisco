# Phase 8 ride review

- [Pickup](pickup.png): stationary taxi inside the Ferry pickup ring, enabled passenger action and shared Sound control.
- [Guidance](guidance.png): Washington Street driving, next turn, remaining distance and the real route on the minimap.
- [Route map](route-map.png): the full Embarcadero → Washington → Sansome → California journey to Nob Hill.
- [Arrival](arrival.png): stopped at Nob Hill with the drop-off action enabled.
- [Completion](complete.png): passenger exit complete, 2.1 km / 7m 43s result.
- [Manual takeover](manual-takeover.png): previously verified manual/off-route recovery controls.

Screenshots use the actual preview viewport (984 × 853 for the final ride), rather than the runbook's nominal
1280 × 720: separate WebGPU renderers stalled during initialization. The working preview was retained.
The map pause check held progress at exactly 9.396158983818085% across two reads, then resumed.

## Regression evidence

[Recorded results](regression-results.json): **182/182 tests pass**. Three full-city traffic seeds finish
pickup through passenger exit in 561.0, 589.2 and 462.7 seconds with zero wall contacts, traffic impacts and
traffic overlaps. All 62,650 static colliders and the original 720-second completion limit remain active.
Maximum route-center deviation is 4.590 m at junctions. Mean assisted-control CPU time is 0.611–0.661 ms/update.
These simulation timings do not measure GPU frame cost.

## Audio and visual limits

All four modes have optional procedural sound: helicopter rotor/wind including hover, walking footsteps,
bicycle chain/tire and robotaxi motor/road, plus ride cues. Functional tests cover activation, output gains,
stationary walking silence, mute/pause and unavailable Web Audio. The browser sound control/helicopter-mode
check passed; subjective listening quality is for user review.

Passenger presentation is a simple walking figure and door cue, without an animated vehicle door.

## Browser acceptance complete

[Console evidence](browser-ride.json): the assisted ride finished in **463.494 seconds** with zero world
contacts, traffic impacts and traffic overlaps. Maximum route-center deviation was 4.859 m. No movement
keys, manual takeover or recovery were used; the deliberate full-map pause resumed correctly. Pickup,
boarding, stopped drop-off and passenger exit all worked. Settings showed Normal traffic and High quality.
No console warnings/errors were observed. Sampled HUD readings were 85–120 fps at High/midday; these are
observations during the ride, not a percentile benchmark or a GPU-cost measurement. Phase 8 is complete.

