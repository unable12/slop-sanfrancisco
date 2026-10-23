# Landmarks index (phase 5)

One line per landmark: its notes, its shots (`docs/review/p5/`, from `tools/dev/shots.json`, rendered by
`node tools/dev/probe.mjs --shots tools/dev/shots.json --out shots/p5 --only p5-…`) and the verdict after comparing
the silhouette with photographs (reference only, nothing copied). Model notes: each file's "Model (P5)" section.

## Tier 1
| Landmark | Notes | Shots | Verdict |
|---|---|---|---|
| Golden Gate Bridge | [golden-gate-bridge.md](golden-gate-bridge.md) | `p5-gg-crissy`, `p5-gg-heli`, `p5-gg-from-marina` | Reads at once: OSM's towers with their portal struts, the cable sag, the suspenders. No Fort Point arch; the Marin end has no ground yet (P6). From Twin Peaks (7.5 km) the default haze hides it |
| Bay Bridge | [bay-bridge.md](bay-bridge.md) | `p5-baybridge-embarcadero`, `p5-baybridge-heli`, `p5-baybridge-deck` | Two suspension spans, X-braced towers, centre anchorage, Yerba Buena Island; traffic on the upper deck. The anchorage is a bare block; the east span is simple |
| Transamerica Pyramid | [transamerica-pyramid.md](transamerica-pyramid.md) | `p5-transamerica-street`, `-mid`, `-heli` | Strong: the taper, the spire, the wings |
| Salesforce Tower | [salesforce-tower.md](salesforce-tower.md) | `p5-salesforce-street`, `-mid`, `-heli` | Strong: rounded obelisk, soft taper, finned crown |
| Ferry Building | [ferry-building.md](ferry-building.md) | `p5-ferry-street`, `-mid`, `-heli` | Good: the clock tower over the long hall, dials, arcade |
| Coit Tower | [coit-tower.md](coit-tower.md) | `p5-coit-street`, `-mid`, `-heli` | Good: the white fluted column on Telegraph Hill |
| City Hall | [city-hall.md](city-hall.md) | `p5-cityhall-street`, `-mid`, `-heli` | Strong: OSM's dome and lantern; the dome takes OSM's teal colour |
| Sutro Tower | [sutro-tower.md](sutro-tower.md) | `p5-sutro-near`, `-mid`, `-from-core` | Strong close up (OSM's bands and crossarms); a thin mark from the core, as in life |
| Palace of Fine Arts | [palace-of-fine-arts.md](palace-of-fine-arts.md) | `p5-pfa-near`, `-mid`, `-heli` | Good: rotunda and the curved colonnade; no lagoon, the rotunda is solid (no open piers) |
| Oracle Park | [oracle-park.md](oracle-park.md) | `p5-oracle-street`, `-mid`, `-heli` | Fair: field from OSM, grandstand, brick, bottle and glove read; the stands are coarse |

## Tier 2
| Landmark | Notes | Shots | Status |
|---|---|---|---|
| Grace Cathedral | [grace-cathedral.md](grace-cathedral.md) | `p5-grace-cathedral` | Done (OSM parts; roof and spire estimated) |
| Painted Ladies | [painted-ladies.md](painted-ladies.md) | `p5-painted-ladies` | Done (OSM houses and colours; Alamo Square park not modelled) |
| Lombard Street | [lombard-street.md](lombard-street.md) | `p5-lombard-top`, `p5-lombard-air` | Done (paving, beds, stairs; estimates) |
| Alcatraz | [alcatraz.md](alcatraz.md) | `p5-alcatraz` | Done (4 m DEM island, OSM buildings, lighthouse, water tower) |
| Fort Point | [fort-point.md](fort-point.md) | `p5-fort-point` | Done (OSM outline, brick) |
| Chase Center | [chase-center.md](chase-center.md) | `p5-chase-center` | Done (OSM drum, tiers estimated) |
| Pier 39 | [pier-39.md](pier-39.md) | — | Skipped: no heights in OSM or the sources (the pier is in the core's piers) |
| Ghirardelli Square sign | [ghirardelli-square.md](ghirardelli-square.md) | `p5-ghirardelli` | Done (the sign; the buildings stay generated) |
| Conservatory of Flowers | [conservatory-of-flowers.md](conservatory-of-flowers.md) | `p5-conservatory` | Done |
| de Young Museum tower | [de-young-museum.md](de-young-museum.md) | `p5-de-young` | Done (OSM slices; reads blocky) |
| Salesforce Park | [salesforce-park.md](salesforce-park.md) | `p5-salesforce-park` | Done (on the Transit Center from OSM) |
| Embarcadero Center, 555 California | — | — | Generated towers (P4 rules), not modelled |
| Mission Dolores | [mission-dolores.md](mission-dolores.md) | `p5-mission-dolores` | Done (mission and basilica; the basilica's towers not modelled) |
| Painted staircases, Filbert Steps | — | — | Skipped (phase file: only if time remains) |

## Tier 3 / set pieces
| Item | Notes | Shots | Status |
|---|---|---|---|
| Powell & Market turntable | [cable-car-turntable.md](cable-car-turntable.md) | `p5-turntable` | Static platform; cars turning on it not done |
