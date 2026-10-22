# Phase 1 gallery: flat San Francisco slice

Nob Hill → Chinatown → Financial District → Ferry Building, built from real data on **flat ground**: terrain arrives in
phase 2, and traffic, street furniture and landmark models come later. Captured with
`node tools/dev/probe.mjs --shots tools/dev/shots.json --out shots/p1` (headless Chrome, WebGPU, 1280×720), then converted to JPEG.

| Shot | What to look at |
|---|---|
| [heli-slice](heli-slice.jpg) | Downtown towers on the right (Financial District), mid-rise blocks westward, the waterfront at the lower edge. Every building is a real DataSF footprint extruded to its lidar roof height |
| [market-street](market-street.jpg) | Car mode at Market & Montgomery: real curbs and sidewalks from DataSF curb lines |
| [california-at-powell](california-at-powell.jpg) | California St looking east from Powell (flat until P2; it is steep in reality) |
| [nob-hill-top](nob-hill-top.jpg) | Huntington Park lawn (park blocks get lawns) next to Grace Cathedral's site |
| [chinatown-grant](chinatown-grant.jpg) | Person mode on Grant Ave |
| [transamerica](transamerica.jpg) | Montgomery St canyon. The pyramid is still a plain extrusion (landmark models: phase 5) |
| [ferry-building](ferry-building.jpg) | The Embarcadero, the plaza lawn, the Ferry Building and piers as extruded footprints |
| [curbs-slice.svg](curbs-slice.svg) | Curb islands (grey), parks (green), road centrelines (amber), closed gaps (red rings), dropped curb chains (magenta) |

## Numbers (probe benches, `docs/perf-log.md`)

| Bench | Median frame time | p95 | FPS | Heap | Ready |
|---|---|---|---|---|---|
| street | 2.4 ms | 3.1 ms | 417 | 97 MB | 2.5 s |
| car | 2.7 ms | 3.4 ms | 370 | 108 MB | 2.6 s |
| heli | 2.0 ms | 2.7 ms | 500 | 120 MB | 2.5 s |
| hill | 2.6 ms | 3.5 ms | 385 | 108 MB | 2.5 s |

Zero console errors on every shot and bench.

## Known issues (owners in parentheses)

- **The world is flat:** buildings stand on y = 0 with their real heights above their own ground (P2 terrain).
- **No traffic, pedestrians, signals or street furniture yet** (P2).
- **Buildings are plain extrusions** with one masonry and one curtain-wall shader (P2.5 masses, P4 SF look). Roofs use the facade texture.
- **The data box edge is a hard cut** of land (P3 core, P6 region).
- **Landmarks are extrusions:** Transamerica is a box, the Ferry Building has no clock tower (P5).
- **About 2.2% of curb length did not close into blocks,** mostly complex SoMa / Transbay blocks and the Embarcadero north of Washington St. 1.4% of footprint centroids sit outside any curb island (`docs/reports/curbs-slice.md`).
