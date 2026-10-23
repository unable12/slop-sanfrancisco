# Phase 6 region data

Generated from citywide DataSF, OSM and USGS snapshots.

- Buildings: {"input":177023,"core":16658,"landmark":116,"missingHeight":0,"small":5437,"buildings":154870,"boxes":161645,"split":6716}
- Trees: {"inventory":109192,"forest":2443,"park":1839}
- Terrain: 182 city tiles at 8 m, 93 horizon tiles at 32 m.
- Assets: 366; 18.16 MB; largest 2.48 MB.

- OSM directed coastlines classify sea and islands; USGS tidal surfaces are normalized to the core water datum without deleting low land.
- Region road widths are measured between citywide curb segments; unmatched segments use core street-name medians, then class-based estimates.
- Region buildings and trees are scenery; traffic remains in the detailed core.
