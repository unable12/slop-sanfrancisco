# Phase 4 gallery: the San Francisco look

The core with San Francisco's buildings, street furniture, street trees and transit:

- building types from the footprints, Land Use and the Tall Building Inventory (`docs/reports/building-types-core.md`,
  map [types.svg](types.svg));
- painted row houses and flats with bay windows, garages, stoops and false-front gables;
- warehouses, towers with podiums and crowns, civic colonnades;
- Muni stops and shelters, trolley wires, bike lanes and parking meters;
- the street tree inventory;
- the F-line streetcars, Muni Metro and the cable cars, and the SF fleet.

Captured with `node tools/dev/probe.mjs --shots tools/dev/shots.json --out <dir> --only p4-…` (headless Chrome, WebGPU,
1280×720, `freeze=1` so the rail vehicles stand where the shots expect them), converted to JPEG.

| Shot | What to look at |
|---|---|
| [types.svg](types.svg) | Every footprint coloured by type. Row houses and flats fill Russian Hill, North Beach and the western blocks; towers make the Financial District and Rincon Hill; warehouses line SoMa and the piers; the 12 red ones are the P5 landmarks |
| [p4-russian-hill-rowhouses](p4-russian-hill-rowhouses.jpg) | Filbert St climbing west from Leavenworth St. Painted siding and stucco, bay windows, garage doors and street-level doors where the floors stand high over the sidewalk. The inventory's trees line the north sidewalk, palms among them |
| [p4-north-beach](p4-north-beach.jpg) | Union St at Grant Ave, looking west. Warm Italianate paint, bays on the upper floors, garages and entrances, street trees, Russian Hill behind |
| [p4-north-beach-night](p4-north-beach-night.jpg) | The same street at midnight: windows lit by type (about half of the houses' windows, few in warehouses), lamps, shopfronts |
| [p4-chinatown](p4-chinatown.jpg) | Grant Ave at Clay St, looking north. Red, green and cream walls with contrasting trim, bay windows on the red block |
| [p4-downtown-canyon](p4-downtown-canyon.jpg) | Montgomery St at Sutter St, looking north up the Financial District. Concrete- and stone-panelled towers in several tones (inventory facade materials), curtain walls further on |
| [p4-fidi-towers](p4-fidi-towers.jpg) | The Financial District from the air. Tower crowns from the lidar peak (penthouses, setback blocks), podiums where the inventory's plans show one |
| [p4-soma-warehouses](p4-soma-warehouses.jpg) | Brannan St near 2nd St. Brick and concrete warehouses with multi-pane industrial windows and roll-up doors |
| [p4-folsom-bike-lanes](p4-folsom-bike-lanes.jpg) | Folsom St at 7th St. Green bike lanes from the Bike Network along both curbs, SoMa's warehouses and flats |
| [p4-muni-shelter-trolley-wires](p4-muni-shelter-trolley-wires.jpg) | A Muni stop: pole with the yellow band, a glass shelter with its lit advert panel. Trolley wires and span wires over the street |
| [p4-embarcadero-streetcar](p4-embarcadero-streetcar.jpg) | An F-line streetcar (maroon under cream) on the Embarcadero's median, the street trees of the Ferry Building plaza |
| [p4-embarcadero-palms](p4-embarcadero-palms.jpg) | The inventory's Canary Island date palms along the Embarcadero |
| [p4-california-cable-car](p4-california-cable-car.jpg) | A cable car on California St near Powell St: maroon body, cream cabin, open ends. The track bed with its rails and the cable slot between them |
| [p4-powell-cable-cars](p4-powell-cable-cars.jpg) | Powell St, looking south down the hill: two cable cars, one on each track |
| [p4-russian-hill-air](p4-russian-hill-air.jpg) | Russian Hill's blocks from above: tar-grey roofs with no bulkheads on the row houses, painted fronts, a tower's crown |

## Numbers (probe benches, two runs each; `docs/perf-log.md`)

| Bench | Median frame time | p95 | FPS | Live heap | Heap without GC | Ready |
|---|---|---|---|---|---|---|
| street | 5.9–6.2 ms | 6.6–7.4 ms | 161, 169 | 581–587 MB | 615–753 MB | 5.5–5.6 s |
| car | 6.6 ms | 8.5–8.7 ms | 152, 152 | 582–584 MB | 621–641 MB | 5.4–5.5 s |
| heli | 7.2–7.3 ms | 22.7–22.8 ms | 137, 139 | 580–582 MB | 658–720 MB | 5.5–5.9 s |
| hill | 7.9–8.1 ms | 8.9–9.0 ms | 123, 127 | 579–580 MB | 620–696 MB | 5.2–5.5 s |
| russian-hill-view | 7.9 ms | 8.9–9.6 ms | 127, 127 | 577–580 MB | 661–688 MB | 5.5–5.6 s |

P3 for comparison: street 244, car 238, heli 204, hill 208, russian-hill-view 208 fps. The street trees cost the most
(about a quarter of a street-level frame; without them the car bench runs at 208 fps, p95 5.8 ms). The heli bench's
p95 comes from the tree field re-uploading its instance buffers as the helicopter flies (PLAN P4-7, perf log).

Budgets (PLAN §1): street ≥ 75 fps, heli/hill ≥ 60, heap ≤ 1.2 GB, ready ≤ 25 s. Zero console errors on every shot and
bench. Heap is the live heap after a forced GC (`heapLiveMB`, PLAN P4-7). The heap read without one is also listed.

## Self-review

What reads as San Francisco:

- Russian Hill and North Beach. Rows of narrow painted houses with bay windows, garages under the floors on the hills,
  and stoops, trees and lamps.
- SoMa's brick warehouses with industrial windows.
- The cable cars on Powell and California over their slotted track, the F-line streetcars on the Embarcadero, the
  silver-and-red Muni buses, trolley wires over the trolleybus streets.
- The palms on the Embarcadero, the green bike lanes.

What does not read yet:

- **Every building is still a box.** No angled-bay sides on the main wall, no cornice brackets or gable detail; flats
  and apartment houses look alike apart from their paint. Party walls and backs are the front's paint.
- **Downtown towers:** the facade materials vary by inventory material only, so the concrete towers look alike;
  podiums use an estimated height (P4-3). Crowns can't tell a spire from an antenna mast.
- **The landmarks still carry generic crowns:** City Hall's dome and the Ferry Building's tower read as spires, and
  Coit Tower as a mast (P5 replaces them).
- **Trees:** the ficus and broadleaf crowns are thinner than the real dense street ficus. 18% of the inventory's trees
  are left out, mostly where the 2016 curbs have gaps.
- **Transit:** cars, cyclists and pedestrians don't see the rail vehicles, so a car can drive through a streetcar on
  Market St. The rail vehicles restart at the start of their run when they reach its end. Cable cars have no grip
  wheel or turntable (P5).
- **Hillside fronts:** a front that stands more than ~2.5 m above the sidewalk gets a street-level door and a garage
  but no visible stair. The plinth under the floors is a blank band.

## Known issues (owners in parentheses)

- **Curb gaps in SoMa and Mission Bay** are still open: buildings and trees there stand on asphalt (carried over from
  P3; not a P4 task, see the handover).
- **Stairs drawn as streets** (Kearny, Greenwich and Montgomery St on Telegraph Hill, Macondray Ln), **Lombard St's
  flower beds** and **Union Square's lawn**: carried over from P3. The ground mask paves Union Square; the park lawn
  drawn over it still shows (P5, with the landmark sites).
- **SFPD livery not verified** (`docs/landmarks/muni.md`).
