# Binary data formats

All binary outputs of the pipeline use one container, written by `writeBin` and read by `readBin` in `tools/geo-terrain.mjs`
(runtime reader: `js/data-loader.js`, P1.12):

| Bytes | Content |
|---|---|
| 0–3 | ASCII magic `SFB1` |
| 4–7 | uint32 little-endian `N`: byte length of the JSON header, padded with spaces to a multiple of 4 |
| 8 … 8+N | UTF-8 JSON header |
| 8+N … end | payload (typed arrays, little-endian, 4-byte aligned) |

## `data/terrain-<box>.bin`: height field (`format: "sf-terrain"`, version 1)

**Header fields**

| Field | Meaning |
|---|---|
| `cell` | Grid spacing in metres (2) |
| `originX`, `originZ` | World position of sample (0, 0) |
| `w`, `h` | Sample counts along x and z |
| `minH`, `scale` | Height (m NAVD88) = `minH + value * scale` |
| `waterLevel` | Hydro-flattened bay surface (m) |
| `box` | Box name |
| `source` | DEM tiles |

**Payload.** Uint16, `w * h` values, row-major. Row `j` is world z = `originZ + j * cell`, column `i` is world x = `originX + i * cell`.

Samples are point values at those positions; interpolate bilinearly. Water cells hold exactly `waterLevel` (within quantisation).

## `data/buildings-<box>.bin`: building footprints (`format: "sf-buildings"`, version 3)

**Header fields:** `count`, `fields` (`base, roof, peak, ringStart, ringCount, theta, massStart, massCount, shops, type,
palette, bays, garage, era, frontW, row, storeyH, stories, facade, podium`), `tableFloats`, `vertexFloats`, `massFields`
(`cx, cz, w, d`), `massFloats`, and the code names `types`, `palettes`, `eras`, `facades`. Version 2 (P2.5) added
`theta` to `shops` and the masses; version 3 (P4.1) the class fields after `shops`. Read fields by `fields.length`, not
a fixed record size.

**Payload.** Float32:
- first `tableFloats` values: `count` records of `fields.length` floats each;
  - `base`: lowest bare-earth ground under the footprint, m NAVD88;
  - `roof`: median first-return elevation, the main roof, m NAVD88;
  - `peak`: highest first return, m NAVD88;
  - `ringStart`: index of the first vertex in the pool;
  - `ringCount`: number of vertices;
  - `theta`: the building's turn about +y (three.js rotation; its dominant edge direction is -theta in the world);
  - `massStart`, `massCount`: its rectangles in the mass pool (`massCount` 0: drawn as its outline, the rectangles cover
    under 90% of it);
  - `shops`: 1 when its land-use parcel (DataSF Land Use, by block-lot, else the parcel under its centroid) has retail floor space;
  - `type`: index into `types` (`shed, rowhouse, flats, apartment, office-low, warehouse, midrise, tower, civic,
    landmark`; rules in `tools/building-rules.json`, report in `docs/reports/building-types-<box>.md`);
  - `palette`: palette set by neighbourhood (index into `palettes`; colours in `js/sf-style.js`);
  - `bays`: bay windows on the front (row houses and flats `floor(frontW / 3.5)` up to 2; apartments `floor(frontW / 7)` up to 4);
  - `garage`: 1 for a row house or flats whose ground drops more than 0.6 m along its front;
  - `era`: index into `eras` (from the Tall Building Inventory's completion date where joined, else by type: a rule, not data);
  - `frontW`: metres of wall looking onto the road (the widest facing), 0 when no wall does within 12 m;
  - `row`: buildings in its row (joined by shared walls of 3 m or more);
  - `storeyH`, `stories`, `facade`, `podium`: Tall Building Inventory storey height (m, 0 unknown), storeys above grade,
    facade code (index into `facades`), tower/base plan area ratio (0 unknown);
- then the vertex pool of `vertexFloats` values, as `x, z` pairs in world metres. Rings have negative `ringArea()` (NYC convention);
- then the mass pool of `massFloats` values: per rectangle its centre `cx, cz` and size `w` (along local x) and `d`
  (along local z), turned by its building's `theta` (`tools/rect-cover.mjs`).

## `data/groundmask-<box>.bin`: ground classes (`format: "sf-groundmask"`, version 1)

**Header fields:** `cell` (1 m), `originX`, `originZ` (world position of the corner of cell (0, 0)), `w`, `h`, `classes`
(names by value: `asphalt, sidewalk, lawn, sand, rock, waterEdge`).

**Payload.** Uint8, `w * h` values, row-major. Cell `(i, j)` covers x in `[originX + i * cell, originX + (i + 1) * cell)` and
z likewise. Written by `tools/geo-groundmask.mjs`; sampled with nearest filtering by the terrain material (`js/terrain-mesh.js`).
