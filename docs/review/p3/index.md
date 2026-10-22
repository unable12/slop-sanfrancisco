# Phase 3 gallery: the north-east quadrant core

The core box (4.03 × 5.35 km: Russian Hill, Nob Hill, Chinatown, North Beach and Telegraph Hill, Fisherman's Wharf, the
Financial District, Union Square, the Tenderloin and Civic Center, SoMa to the ballpark, and the edges of Mission Bay)
on the USGS terrain with everything the slice had, plus tunnels, the Mission Creek bridges, the freeway decks and their
traffic, the light-rail medians and the landmark teleports. The look is still New York's (San Francisco's: phase 4;
landmarks: phase 5). Captured with `node tools/dev/probe.mjs --shots tools/dev/shots.json --out <dir> --only p3-…`
(headless Chrome, WebGPU, 1280×720), converted to JPEG.

| Shot | What to look at |
|---|---|
| [heli-core](heli-core.jpg) | The whole core from over the bay south of the ballpark: downtown's towers, Nob and Russian Hill behind, SoMa and Mission Bay in front, the I-80 and US-101 decks crossing SoMa. Mission Bay's big asphalt fields are the curb data's gap (known issues) |
| [soma-freeway](soma-freeway.jpg) | The I-80 viaduct over SoMa: decks with parapets on columns every 30 m, highway traffic on them, the streets running underneath |
| [stockton-tunnel](stockton-tunnel.jpg) | Stockton St at Bush St, the Stockton Tunnel's south portal: masonry portal, lit bore, a robotaxi driving in; the hill is not cut, the terrain mesh only dips where it would come into the bore |
| [mission-creek-bridge](mission-creek-bridge.jpg) | The 4th St bridge over Mission Creek (the bare-earth DEM has none): deck between banks 8 m back from the water, piers, traffic on it |
| [embarcadero](embarcadero.jpg) | The Embarcadero south of the Ferry Building: the F-line's track bed and rails on the median, traffic, the piers |
| [lombard](lombard.jpg) | Russian Hill from above Lombard St (the crooked block's hairpins are in the road network, at 8 km/h; their flower beds and stairs are P4/P5) |
| [telegraph-hill](telegraph-hill.jpg) | Telegraph Hill from the east, over the waterfront: the park's lawn on top, the steep faces in the "rock" ground class |
| [union-square](union-square.jpg) | Union Square from the south, high up: the square (still a lawn: P4) with a column in its middle, hotels around |
| [civic-center](civic-center.jpg) | Civic Center from the east, looking towards City Hall (a plain mass until phase 5): Civic Center Plaza's lawn, traffic at its signals |

## Numbers (probe benches, `docs/perf-log.md`)

| Bench | Median frame time | p95 | FPS | Heap | Ready |
|---|---|---|---|---|---|
| street | 4.1 ms | 4.7 ms | 244 | 561 MB | 5.2 s |
| car | 4.2 ms | 5.2 ms | 238 | 809 MB | 5.2 s |
| heli | 4.9 ms | 7.2 ms | 204 | 566 MB | 5.3 s |
| hill | 4.8 ms | 5.8 ms | 208 | 552 MB | 5.2 s |
| russian-hill-view (new) | 4.8 ms | 6.0 ms | 208 | 561 MB | 5.2 s |

Budgets (PLAN §1): street ≥ 75 fps, heli/hill ≥ 60, heap ≤ 1.2 GB, ready ≤ 25 s. Zero console errors on every shot and
bench. Everything loads eagerly; no streaming was needed (decision P3-2).

## Known issues (owners in parentheses)

- **Curb gaps in SoMa and Mission Bay:** the 2016 curb data has no blocks for much of Mission Bay and parts of SoMa, so
  those buildings stand on bare asphalt (heli-core). 94.0% of footprints lie in a curb island (slice: 98.6%); 9.8% of
  curb length is dropped as unclosed chains (P4: a fallback from the footprints and the road corridor).
- **Freeway heights are estimates:** OSM tags which stretches are bridges and their layer, not their height; decks stand
  8 / 15 / 22 m over the ground by layer, eased at 5% (decision P3-3). The Bay Bridge approach ends at the box's
  waterfront (the bridge itself: P5). Highway cars dip out of sight at the ends of the main lines.
- **Piers:** some pier decks show as flat white slabs on the water off the Embarcadero (embarcadero; cause not looked into yet) (P5).
- **Lombard's crooked block, Union Square and the landmarks look generic** (P4, P5).
- **Steep "streets" that are stairs** (Kearny, Greenwich and Montgomery on Telegraph Hill, Macondray Ln) are drawn as
  asphalt; traffic skips them (over 40%), the player can drive them (P4: stairs).
- **Heap in `--shots` mode** climbs across navigations in one tab (up to 1.8 GB by the ninth shot); a fresh page stays
  at 560–900 MB. Budgets are read from the benches (one page each), as since P1.4.
