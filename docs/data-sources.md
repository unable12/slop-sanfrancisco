# Data sources

**Status: resolved during planning (2026-10-22).** Dataset IDs, fields, row counts, licenses and sample statistics are in
`docs/research.md` §4–6. This file is the operational checklist for `tools/fetch-geodata.mjs` (P1.5).

## Endpoints
| Source | How | Notes |
|---|---|---|
| DataSF | `https://data.sf.gov/resource/<id>.geojson` with `$where=within_box(<geom>, latN, lonW, latS, lonE)`, `$order=:id`, `$limit=50000`, `$offset` | The old host `data.sfgov.org` redirects (`curl -L`). Metadata: `/api/views/<id>.json`. Search: `/api/search/views.json?q=` |
| USGS DEM (P5.1: the `landmarks` box also fetched the x54y418 and x54y419 `CA_SanFrancisco_B23` tiles, 289 MB, for the sites west of the core and the interim region ground) | TNM API `https://tnmaccess.nationalmap.gov/api/v1/products?datasets=Digital%20Elevation%20Model%20(DEM)%201%20meter&bbox=lonW,latS,lonE,latN` → `items[].downloadURL` | Prefer project `CA_SanFrancisco_B23` |
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
- `landmarks-named.overpassql` (P5.1): fetched for the `landmarks` box only (`node tools/fetch-geodata.mjs --box landmarks --only osm --osm landmarks-named`): the modelled landmarks by exact name, Sutro Tower's relations, every `building:part` (OSM's 3D drawings), the bridges' supports, towers (`tower:type=bridge`), outlines and deck ways, baseball pitches, the buildings on Alcatraz and round the Painted Ladies, the Powell & Market turntable node; `(._; >>;)` and `out geom`, so building relations keep their parts. `tools/geo-landmarks.mjs` reads it (report: `docs/reports/landmarks.md`).
- `rail.overpassql`: `railway=tram|light_rail|funicular|rail` ways, plus `route=tram|light_rail|trolleybus` relations; `trolley_wire=yes` ways. It ends `out geom` (P4.6), so the relations keep their members: the transit runs and stops are built from them.
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

## Phase 6 regional snapshot (2026-10-22)

The city box is 37.70–37.84 N, 122.53–122.35 W; horizon coverage is 37.65–37.95 N,
122.65–122.10 W. These are coverage bounds, not inferred feature locations. The existing four
`CA_SanFrancisco_B23` tiles supply 8 m city samples from their overviews.

The horizon uses USGS **1/3 Arc Second n38w123, 20250826**, published 2025-08-27, selected through
TNM's elevation catalog. The [pinned USGS GeoTIFF](https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/13/TIFF/historical/n38w123/USGS_13_n38w123_20250826.tif)
is 222,936,410 bytes: NAD83 geographic coordinates, NAVD88 elevations in metres, USGS 3DEP public-domain data.
`tools/fetch-horizon.mjs` records its SHA-256, URL, retrieval time, license and datum in
`data/raw/horizon/MANIFEST.json`. Other source hashes and retrieval dates remain in `data/raw/MANIFEST.json`.

```bash
node tools/fetch-geodata.mjs --box city --only datasf,osm,dem
node tools/fetch-horizon.mjs
node tools/fetch-geodata.mjs --box horizon --only osm --osm coast
node tools/fetch-geodata.mjs --box horizon --only osm --osm ferries
node --max-old-space-size=8192 tools/geo-region.mjs
```

The city snapshot has 177,023 footprints and 138,764 inventory tree records. Regional output excludes core
objects, tiny masses and modelled landmark sites; see `docs/reports/region.md`. Roads use citywide curb
intersections, then core street-name width medians, then explicit class estimates when unmatched.

OSM directed coastlines preserve land below sea level while flattening tidal water (the national DEM has
some bay samples at +0.6 m). Ferry way IDs 27989500, 31772645, 98771919 and 662437195 supply the Alcatraz,
Larkspur, Sausalito and Oakland paths. OSM attribution and ODbL terms in `NOTICE.md` continue to apply.
Ferry dimensions, 9 m/s speed, departures, cargo anchorage/motion, building colours and tree heights/densities
are scenery estimates, not operating schedules or surveyed measurements. Cargo candidates are derived
from the Oakland path and checked against water; currently one qualifies. Oakland building footprints
are absent from DataSF and are omitted; its real terrain is present.
