# Phase 5 gallery: landmarks and bridges

San Francisco's landmarks on their real sites: the Golden Gate and Bay bridges, the eight Tier 1 buildings, most of
Tier 2, Lombard Street's crooked block. Where OpenStreetMap draws a landmark in 3D (Sutro Tower, the Golden Gate's
towers, City Hall, the Ferry Building's tower, Coit Tower, the Palace of Fine Arts), the model is OSM's parts as drawn;
elsewhere it is built from published dimensions (`docs/landmarks/*.md`, with sources and every estimate named).
Outside the core the landmarks stand on interim 16 m DEM ground (PLAN P5-1) until phase 6 brings the region.

Captured with `node tools/dev/probe.mjs --shots tools/dev/shots.json --out <dir> --only p5-…` (headless Chrome, WebGPU,
1280×720, midday, `freeze=1`), converted to JPEG. Landmark index and verdicts: `docs/landmarks/INDEX.md`.

## Tier 1 (three shots each)

| Shot | What to look at |
|---|---|
| [gg-crissy](p5-gg-crissy.jpg) · [gg-heli](p5-gg-heli.jpg) · [gg-from-marina](p5-gg-from-marina.jpg) | The Golden Gate: OSM's towers (legs in stages, four portal struts above the deck), cables over the leg tops, suspenders; Fort Point under the south end. The Marin side ends on the little ground the SF DEM has there |
| [baybridge-embarcadero](p5-baybridge-embarcadero.jpg) · [baybridge-heli](p5-baybridge-heli.jpg) · [baybridge-deck](p5-baybridge-deck.jpg) | The Bay Bridge's west span: X-braced towers, the centre anchorage, Yerba Buena Island; the deck shot has a car on the upper deck (the I-80 freeway runs on the bridge) |
| [transamerica-street](p5-transamerica-street.jpg) · [-mid](p5-transamerica-mid.jpg) · [-heli](p5-transamerica-heli.jpg) | The pyramid up Montgomery St, from the west, and over the Financial District |
| [salesforce-street](p5-salesforce-street.jpg) · [-mid](p5-salesforce-mid.jpg) · [-heli](p5-salesforce-heli.jpg) | The rounded obelisk, its taper and the finned crown |
| [ferry-street](p5-ferry-street.jpg) · [-mid](p5-ferry-mid.jpg) · [-heli](p5-ferry-heli.jpg) | The clock tower at the foot of the street, along the Embarcadero with the Bay Bridge, from the air |
| [coit-street](p5-coit-street.jpg) · [-mid](p5-coit-mid.jpg) · [-heli](p5-coit-heli.jpg) | Coit Tower on Telegraph Hill (the street shot is the `coit` teleport's arrival) |
| [cityhall-street](p5-cityhall-street.jpg) · [-mid](p5-cityhall-mid.jpg) · [-heli](p5-cityhall-heli.jpg) | City Hall across Civic Center Plaza: OSM's dome, drum colonnade, gilded lantern |
| [sutro-near](p5-sutro-near.jpg) · [-mid](p5-sutro-mid.jpg) · [-from-core](p5-sutro-from-core.jpg) | Sutro Tower: OSM's red and white bands and crossarms; on the region ground's hills; a thin mark on the horizon from Russian Hill |
| [pfa-near](p5-pfa-near.jpg) · [-mid](p5-pfa-mid.jpg) · [-heli](p5-pfa-heli.jpg) | The Palace of Fine Arts: rotunda and the curved colonnade |
| [oracle-street](p5-oracle-street.jpg) · [-mid](p5-oracle-mid.jpg) · [-heli](p5-oracle-heli.jpg) | Oracle Park from McCovey Cove: brick, the right-field wall, the Coca-Cola bottle and glove, light towers; the field from OSM |

## Tier 2 and set pieces

| Shot | What to look at |
|---|---|
| [lombard-top](p5-lombard-top.jpg) · [lombard-air](p5-lombard-air.jpg) | Lombard Street from the top teleport: brick paving, flower beds, steps |
| [grace-cathedral](p5-grace-cathedral.jpg) | Grace Cathedral: towers, nave roof, flèche |
| [painted-ladies](p5-painted-ladies.jpg) | The Painted Ladies on Steiner St (OSM's houses and colours) |
| [alcatraz](p5-alcatraz.jpg) | Alcatraz on a 4 m DEM patch: cellhouse, lighthouse, water tower |
| [fort-point](p5-fort-point.jpg) | Fort Point under the Golden Gate |
| [chase-center](p5-chase-center.jpg) · [conservatory](p5-conservatory.jpg) · [de-young](p5-de-young.jpg) · [mission-dolores](p5-mission-dolores.jpg) | Chase Center, the Conservatory of Flowers, de Young's Hamon Tower, Mission Dolores |
| [salesforce-park](p5-salesforce-park.jpg) · [ghirardelli](p5-ghirardelli.jpg) · [turntable](p5-turntable.jpg) | The park on the Transit Center, the GHIRARDELLI sign, the Powell & Market turntable |

## Numbers (probe benches, two runs each; `docs/perf-log.md`)

| Bench | FPS | p95 | Live heap | Ready |
|---|---|---|---|---|
| street | 172, 172 | 6.4–6.6 ms | 689 MB | 5.1–6.0 s |
| car | 154, 147 | 9.6–9.8 ms | 690–691 MB | 6.2–6.3 s |
| heli | 145, 137 | 23.0–23.4 ms | 688 MB | 6.3–6.5 s |
| hill | 125, 127 | 8.9–9.6 ms | 686–687 MB | 6.5–7.0 s |
| russian-hill-view | 116, 127 | 9.8–10.3 ms | 687–691 MB | 6.2–6.6 s |

P4 for comparison: street 161–169, car 152, heli 137–139, hill 123–127, russian-hill-view 127 fps. Budgets: street ≥ 75,
heli/hill ≥ 60, heap ≤ 1.2 GB, ready ≤ 25 s. Zero console errors on every shot and bench. The landmarks add about 48k
triangles in 65 draws, the bridges about 90k in 12, the region ground about 1M (2 km chunks).

## Self-review: known visual issues

- The interim region ground is bare: no buildings, streets or parks outside the core until phase 6. The far
  landmarks (Sutro Tower, the Palace, Golden Gate Park's buildings, the Painted Ladies) stand on empty hills.
- The Golden Gate's Marin end and the Bay Bridge's Oakland end reach ground only where the SF DEM tiles have it.
- Oracle Park's stands are coarse ring segments; the light towers and clock towers are placed by estimate.
- The Palace's rotunda is a solid drum (no open piers), and its lagoon is missing.
- De Young's tower reads as stacked slabs (OSM's slices).
- City Hall's dome takes OSM's teal (#61c1c3), brighter than the real copper.
- From Twin Peaks (7.5 km) the default haze hides the Golden Gate (phase 6 fog work).
