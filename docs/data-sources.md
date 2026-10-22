# Data sources

**Status: resolved during planning (2026-10-22).** Dataset IDs, fields, row counts, licenses and sample statistics are in
`docs/research.md` §4–6. This file is the operational checklist for `tools/fetch-geodata.mjs` (P1.5).

## Endpoints
| Source | How | Notes |
|---|---|---|
| DataSF | `https://data.sf.gov/resource/<id>.geojson` with `$where=within_box(<geom>, latN, lonW, latS, lonE)`, `$order=:id`, `$limit=50000`, `$offset` | The old host `data.sfgov.org` redirects (`curl -L`). Metadata: `/api/views/<id>.json`. Search: `/api/search/views.json?q=` |
| USGS DEM | TNM API `https://tnmaccess.nationalmap.gov/api/v1/products?datasets=Digital%20Elevation%20Model%20(DEM)%201%20meter&bbox=lonW,latS,lonE,latN` → `items[].downloadURL` | Prefer project `CA_SanFrancisco_B23` |
| OSM | Overpass via `tools/overpass.sh` (3 endpoints, retries, validation; from NYC) | Set a descriptive User-Agent |

## Datasets and the geometry column used in `within_box`
| Dataset | ID | Geometry column | Filter |
|---|---|---|---|
| Building Footprints | `ynuv-fyni` | `shape` | none |
| Streets – Active and Retired | `3psu-pn9h` | `line` | `active=true` |
| Curbs and Islands | `emxt-b6yg` | `the_geom` | none |
| Sidewalk Widths (2014) | `4g86-grxu` | `shape` | none |
| Traffic Signals | `ybh5-27n2` | `shape` | keep all; the engine uses `type='SIGNAL'` |
| Stop Signs | `4542-gpa3` | `shape` | none |
| Street Tree Inventory | `tkzw-k3nq` | `point` | none |
| Muni Stops | `i28k-bkz6` | `shape` | none |
| Muni Simple Routes | `9exe-acju` | `shape` | none |
| MTA Bike Network Linear Features | `ygmz-vaxd` | `shape` | none |
| San Francisco Land Use | `c5ge-t6pj` | `the_geom` | none |
| Recreation and Parks Properties | `gtr9-ntp6` | `shape` | none |
| Tall Building Inventory | `5kya-mfst` | `polygon` | none |

Check each geometry column name against `/api/views/<id>.json` once in P1.5. The names above come from the column lists; one wrong name returns an HTTP 400, so it fails loudly.

## OSM queries (in `tools/queries/`)
- `coast.overpassql`: `natural=coastline` in the box (plus `place=island` polygons for Alcatraz, Treasure Island, Yerba Buena, Angel Island).
- `piers.overpassql`: `man_made=pier` ways and relations.
- `landuse.overpassql`: `leisure=park|golf_course`, `landuse=forest|grass|cemetery|industrial`, `natural=wood|scrub|beach|cliff|water`.
- `landmarks.overpassql`: names in the phase 5 tiers (`building`, `man_made`, `leisure=stadium`, `tourism`), with `out geom tags`.
- `rail.overpassql`: `railway=tram|light_rail|funicular|rail` ways, plus `route=tram|light_rail|trolleybus` relations; `trolley_wire=yes` ways.
- `roads-tags.overpassql`: `highway=*` ways with `lanes|width|bridge|tunnel|layer|oneway` tags, used to enrich DataSF links.
- `peaks.overpassql`: `natural=peak` with `ele`, used for terrain checks.

## Manifest fields (`data/raw/MANIFEST.json`)
`{ file, source, url, queryHash, retrievedAt, bytes, sha256, rows, license, box }`

## Licenses
| Source | License | Attribution text |
|---|---|---|
| DataSF datasets above | PDDL (Land Use: CC0) | "City and County of San Francisco / DataSF" (courtesy, not required) |
| USGS 3DEP | Public domain as US government work: **confirm on the product page in P1.5 and record it here** | "USGS 3D Elevation Program" |
| OpenStreetMap | ODbL 1.0 | "© OpenStreetMap contributors"; the generated `sf-geodata.js` is an ODbL derived database (state this in `NOTICE.md`) |
