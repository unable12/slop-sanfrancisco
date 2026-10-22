# Phase 2 gallery: the slice on real hills, with traffic

Nob Hill → Chinatown → Financial District → Ferry Building on the USGS terrain: draped curbs and sidewalks, buildings
standing on their own ground, traffic and pedestrians at the real signals and stop signs. The look is still New York's
(San Francisco's: phase 4). Captured with `node tools/dev/probe.mjs --shots tools/dev/shots.json --out docs/review/p2`
(headless Chrome, WebGPU, 1280×720), converted to JPEG.

| Shot | What to look at |
|---|---|
| [heli-slice](heli-slice.jpg) | The whole slice from the south: Nob Hill rising to the west (left), the buildings stepping up it, Union Square's lawn in the middle, downtown towers on the right |
| [market-street](market-street.jpg) | Car mode at Market & Montgomery: crosswalks and road paint draped on the ground, a cyclist and traffic around the player's robotaxi |
| [california-at-powell](california-at-powell.jpg) | California St at Powell looking east, down Nob Hill to downtown: sidewalks and curbs follow the grade, floors level per building |
| [nob-hill-top](nob-hill-top.jpg) | The top of Nob Hill by Huntington Park's lawn |
| [chinatown-grant](chinatown-grant.jpg) | Person mode on Grant Ave; a cobra-head lamp on the curb island |
| [ferry-building](ferry-building.jpg) | The Ferry Building (a plain extrusion until phase 5) across the Embarcadero and its plaza, traffic on the roadway |
| [golden-hour-hill-shadow](golden-hour-hill-shadow.jpg) | Golden hour over Chinatown towards Nob Hill: buildings shade the streets. The hills cast shadows too (an 8 m stand-in on the shadow layer), but the golden-hour sun stands about 20° up and the slice's slopes are gentler (≤ 17°), so here it is the buildings' shadows that fall across the streets |
| [all-way-stop](all-way-stop.jpg) | Sacramento & Mason (all-way stop): stop sign, crosswalks, stop bar and centre line on the hill, a lamp and a hydrant on the corners |

## Numbers (probe benches, `docs/perf-log.md`)

| Bench | Median frame time | p95 | FPS | Heap | Ready |
|---|---|---|---|---|---|
| street | 2.3 ms | 2.8 ms | 435 | 205 MB | 3.3 s |
| car | 2.7 ms | 3.4 ms | 370 | 234 MB | 3.4 s |
| heli | 2.8 ms | 3.6 ms | 357 | 243 MB | 3.6 s |
| hill | 3.1 ms | 3.9 ms | 323 | 283 MB | 3.7 s |

Budgets (PLAN §1): street ≥ 75 fps, heli/hill ≥ 60, heap ≤ 1.2 GB, ready ≤ 25 s. Zero console errors on every shot and
bench. Traffic: 60 cars, 6 buses and 340 pedestrians around the camera.

## Known issues (owners in parentheses)

- **The data box edge is a hard cut** (seen in heli-slice): land ends in a seawall at the box's south and west edges, and
  south of the curb data (z > 229) the ground has no curb islands, just asphalt with speckles of the steep-slope "rock"
  class from the lidar ground (P3 core, P6 region).
- **Market St near Montgomery** loses a few edges in the road network (junction curves graze curb islands at the
  Market / Post / Montgomery complex), so traffic there is thinner than it should be (P3, with the core's network).
- **Freeways, ramps and tunnels are left out** of the road network (the Broadway Tunnel, the Bay Bridge approaches):
  they don't follow the terrain (P3+, decks and bores).
- **Look is New York's:** NYPD-style livery, brick and limestone facades, oversized rooftop bulkheads on every building,
  no street trees (P4).
- **Landmarks are extrusions** (P5).
- **Signals have no pedestrian heads or street-name blades yet**, and all-way junctions with three road groups share
  the two-phase cycle (P4 street furniture).
- **Traffic stops are approximate at oblique junctions:** a few junction curves are kinked; vehicles take them at a
  floor of 2.5 m/s (decision P2-11).
