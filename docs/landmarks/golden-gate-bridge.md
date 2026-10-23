# Golden Gate Bridge

## Facts
- Total length, abutment to abutment: 8,981 ft (2,737 m). Wikipedia infobox rounds to 8,980 ft.
- Suspension span (main + both side spans): 6,450 ft (1,966 m).
- Main span (tower to tower): 4,200 ft (1,280 m).
- One side span: 1,125 ft (343 m) (two side spans, 2 x 1,125 = 2,250; 2,250 + 4,200 = 6,450 consistent).
- Tower height above water: 746 ft (227 m). Tower height above roadway: 500 ft (152 m).
- Tower leg base: 33 ft x 54 ft (10 m x 16 m) each. Leg centre-to-centre spacing: about 27 m per OSM (matches the 90 ft cable spacing below).
- Clearance above mean higher high water at mid span: 220 ft (67 m). Wikipedia: average 220 ft (67 m).
- Overall bridge width: 90 ft (27 m). Roadway between curbs: 62 ft (19 m). Each sidewalk: 10 ft (3 m). Six traffic lanes (movable median barrier).
- Original concrete deck replaced 1982-86 with orthotropic steel deck; roadway widened by 2 ft (Wikipedia).
- Main cable diameter: 36 3/8 in (0.92 m), two cables, 27,572 wires each, 61 strands per cable; 250 pairs of vertical suspender ropes (Wikipedia).
- Cable spacing (two cables apart): 90 ft (27 m) per a 1935 US Naval Institute Proceedings table and a CIA reading-room document seen in search results (search snippet only; page text of the USNI article did not render the table). Treat as 90 ft = same as bridge width.
- Tower portal struts above deck: count UNKNOWN from any text source. OSM models the tower with six strut parts between the legs at these heights (m, min..max of each part): 24-26, 50-52, 111-121, 151-161, 185-193, 215-223. Heights are probably above water; deck is about 67 m, so the 24-26 and 50-52 ones are below deck level (lower struts) and four are above the deck. Verify against photos before relying on this.
- Colour: International Orange (officially an orange vermilion), chosen by consulting architect Irving Morrow. OSM tower parts use #bf4e3b.
- Opened to traffic 1937 (pedestrians May 27, 1937; vehicles May 28/29 per sources). Construction began Jan 5, 1933.
- Tower base coordinates: Wikipedia gives the bridge point 37.81972 N, 122.47861 W (37 49 11 N, 122 28 43 W). OSM tower parts: south tower legs about 37.814003,-122.478046 and 37.814026,-122.477736 (strut centre lon -122.477891). North tower legs about 37.825491,-122.479389 and 37.825514,-122.479078 (strut centre lon -122.479233). North-south towers are therefore about 1,280 m apart (0.011488 deg lat x 111,200 m = 1,277 m). Bridge axis runs slightly east of north.
- OSM bridge way: ways 537838948 / 595194543, bridge:structure=suspension, lanes=3 each way, start_date 1937-05-27.

## Sources
- https://www.goldengate.org/bridge/history-research/statistics-data/design-construction-stats/ (official stats, opened)
- https://www.goldengate.org/exhibits/facts-and-figures-about-the-bridge/ (official, opened)
- https://en.wikipedia.org/wiki/Golden_Gate_Bridge (opened)
- https://www.usni.org/magazines/proceedings/1935/april/golden-gate-and-san-francisco-bay-bridges (found via search; table not extractable)
- OpenStreetMap via Overpass API (https://overpass-api.de/api/interpreter), tower ways 1329545860, 1329761876, 1330049620, 1330832664 and siblings

## Model (P5)
Built in `js/sf-bridges.js` from OSM: both towers extruded from their building parts as drawn (legs in tapering stages, the six struts, the concrete base), anchorages and pylons from their outlines, the deck along the line through the towers between the deck ways' ends. Roadway 75 m over the water (227 m towers, 152 m above the roadway), 27 m wide, cables over the OSM leg tops. **Estimates:** an 8 m deep deck (assumes a level roadway), the cables' sag in the side spans, saddles 4 m under the tower tops, the cable 3 m over the roadway at mid span, suspenders every 15.24 m, pylons 12 m above the deck. **Simplified:** no Fort Point arch, no tower recesses or lamps on the towers. The Marin end has no ground yet (phase 6).
