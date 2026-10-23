# P9.1 building contact review — 2026-10-23

Actual WebGPU preview, High/midday, 1280×720. Real outline building 7949 near Market and 2nd Street.
Green is the shared car body footprint; cyan is the solid building outline; red is the most recent contact
point/normal. Depth testing is disabled for the diagnostic lines so their full footprint remains readable.

| Image | What to check |
|---|---|
| [Clearance](clearance.png) | 0.250 m body-to-wall gap; no position correction. |
| [Contact](contact.png) | Six 5 cm inward moves stop at 0.002 m gap; last move corrects 0.052 m. |
| [Slide](slide.png) | Move 1 m parallel to the facade: same 0.002 m gap, 0.000 m correction. |

Open `http://127.0.0.1:8081/?quality=high&time=midday&debug=collisions` and choose **Inspect outline facade**.
Use the inward/parallel buttons for reproducible inspection; **Resume driving** releases the staged car.
The debug module is opt-in and does not run during ordinary gameplay or performance measurement.

Full suite: 198/198, no retries, 164.3 s with serial file scheduling. Three full-city assisted rides complete
with zero world contacts, traffic impacts or traffic overlaps. The focused tests reproduce the old 0.250 m
false corner push and cover concavity, exact slanted facades, height separation, boost/reverse and sliding.
Static build, syntax and whitespace checks pass. No console warnings/errors during this browser review.

[CPU measurements](../../reports/p9-building-collisions.json): resolver p95 0.0950/0.1985 ms at 11/36 m/s;
paired incremental p95 0.0909/0.1939 ms. Max 41.0674 ms retained. Node timings exclude rendering/terrain;
no new FPS, heap, startup or GPU claim. See [performance log](../../perf-log.md) for reproduction.

Known limits: the structural footprint intentionally excludes mirrors and small sensors. The debug red marker
shows the last contact, so it remains behind after sliding. Some procedural landmark ornaments still use
simplified solids. Tree trunks and pedestrian impact reactions are the next passes, not part of this delivery.
