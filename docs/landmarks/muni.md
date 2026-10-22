# Muni vehicles and the street fleet (P4.6)

What the game paints, where it comes from, and what is a guess.

## Facts with sources

- **Muni's current livery is silver with red striping.** It was first used on the Breda light-rail vehicles from 1995
  and phased in over about two decades in three variations by vehicle type. Every bus and rail car except the historic
  vehicles now wears it. Sources:
  [SFMTA, "History in Motion"](https://www.sfmta.com/blog/muni-color-schemes-through-years) and
  [Railway Age, "Muni Through the Years: Livery Styles"](https://www.railwayage.com/news/muni-through-the-years-livery-styles/).
- **Earlier Muni schemes:** maroon and gold (1969–1975), whose maroon came from the California Street cable cars; and
  the "Sunset" livery (1975–1995), white with orange-red stripes. Same sources.
- **Cable cars:** the California Street cars were deep maroon with sky-blue accents. In the 1982–84 rebuild the Powell
  cars, which had been green and cream, were repainted maroon and light blue, with car 3 kept in green and cream. More
  than a dozen cars wear schemes from earlier eras. Sources:
  [Market Street Railway, car 55](https://www.streetcar.org/cablecars/55-no-55-cable-car/) and
  [car 3](https://www.streetcar.org/cablecars/3-No-3-Muni-greencream).
- **Routes and stops** come from OSM route relations (© OpenStreetMap contributors, ODbL). These are the F streetcar,
  the Powell/Hyde, Powell/Mason and California cable cars and the Muni Metro N, T, J and S lines on the surface. The
  pipeline step is `tools/geo-extra.mjs`, which writes `GEO.transit`.

## What the model simplifies (style, not data)

- **Buses:** silver body, a red stripe under the windows and a thin red pinstripe below it, dark skirt. The sources
  give no stripe placement or widths, so these are the model's own.
- **Muni Metro cars:** a two-section car, silver with a red band under the windows. Proportions are approximate
  (23 m overall).
- **F-line streetcars:** the line runs historic cars in many liveries. The game uses five generic two-tone schemes
  (green, orange, maroon, yellow or blue under cream) rather than any particular car's.
- **Cable cars:** maroon body with cream panels, and on one car in four light-blue panels. Hand-modelled from
  primitives: an enclosed middle cabin, open ends with outward benches, one roof and a clerestory, a grip lever. The
  cars move at a constant 15 km/h between stops (PLAN.md phase 4 spec). The Powell & Market turntable is phase 5.
- **Police cruisers:** a generic US black-and-white (black body, white doors with dark lettering). A web search
  (2026-10-22) found no authoritative source on SFPD's current patrol livery, so this scheme is **not verified**.
- **Plates:** white California-style plates. The player's car carries a made-up number.
- **The rest of the fleet:** robotaxis with a roof sensor dome (1 in 7), vans (mostly white), SUVs and sedans in
  rideshare-heavy white, silver, grey and black. This is a mix chosen for the look, not traffic counts.
