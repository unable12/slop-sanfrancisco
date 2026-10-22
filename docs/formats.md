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
