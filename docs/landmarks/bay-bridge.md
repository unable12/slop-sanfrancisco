# San Francisco-Oakland Bay Bridge

## Facts
- Opened Nov 12, 1936. Total length excluding approaches: 4.46 mi (7.18 km); West crossing 10,304 ft (3,141 m), East crossing (original) 10,176 ft (3,102 m) (Wikipedia). Caltrans fact sheet (archived): 23,000 ft (4.5 mi) structure, 8.4 mi with approaches.
- WEST SPAN (SF to Yerba Buena Island), officially the Willie L. Brown Jr. Bridge: two complete double-deck suspension bridges joined at a central anchorage; four suspension towers (two per bridge); Rincon Hill is the west anchorage, reached by three shorter truss spans.
  - Main spans: 2 x 2,310 ft (704 m).
  - West bay suspension length: 9,260 ft (2,822 m) (Caltrans fact sheet).
  - Side spans: UNKNOWN in opened sources (not stated).
  - Tower height above water: 526 ft (160 m) (Caltrans fact sheet and Wikipedia infobox; another source seen in search says 519 ft / 158 m). OSM models the towers as 160 m.
  - Central anchorage height: UNKNOWN in text sources. OSM way 236374789 "Center Anchorage" has height=67 m, at 37.79819,-122.37786. It rests on a caisson to bedrock 220 ft below water at low tide (Caltrans).
  - Main cable diameter 28.75 in; 17,464 wires of 0.195 in per cable (Caltrans fact sheet).
  - Clearance below (navigation): 220 ft (67 m) (Wikipedia, Caltrans).
  - Decks: double deck. Today the upper deck carries 5 lanes westbound (to SF), the lower deck 5 lanes eastbound. Until 1958-63 the upper deck carried 3 lanes each way for cars and the lower deck carried trucks plus two rail tracks. Upper deck 58 ft (18 m) between curbs in the original layout.
  - Vertical clearance for traffic: westbound 14 ft (4.3 m), eastbound 14.67 ft (4.47 m) (Wikipedia infobox); tunnel decks 16 ft (4.9 m) after the 1960s rebuild.
  - OSM tower positions (pylon, building=tower, height 160): 37.790753,-122.385823; 37.795588,-122.380648; 37.800787,-122.37508; 37.805622,-122.3699.
- YERBA BUENA TUNNEL: 540 ft (160 m) long, bore 76 ft (23 m) wide x 58 ft (18 m) high, interior 66 ft x 53 ft; double-deck; described as the largest-diameter bore tunnel. 321 ft (98 m) concrete viaduct on the west side, 790.8 ft (241.0 m) concrete viaduct on the east side, then a 1,169.7 ft (356.5 m) curved high-level steel truss viaduct to the old cantilever.
- EAST SPAN today: a self-anchored suspension (SAS) span with a single tower, opened Sept 2, 2013 (traffic moved Aug 28 to Sept 2/3, 2013). Total new east span 2.2 mi (3.5 km); width 258.33 ft (10 lanes + bike path) (Wikipedia infobox).
  - Tower height: 525 ft (160 m) (Wikipedia infobox "height (SAS)"). OSM tower way 237735191 height 160 m at 37.815265,-122.358506. Tower is four pentagonal columns joined by sacrificial shear links.
  - Main span: 1,400 ft (430 m) in the Bay Bridge article infobox; 1,263 ft in the replacement-project article infobox. Sources disagree. A search snippet also cites 2,047 ft for the full self-anchored section.
  - Single main cable loop (not a pair); two side-by-side roadway decks about 50 ft apart in the middle, not touching the tower.
  - Skyway viaduct (precast segmental, east of the SAS): about 1.2 mi long per a search snippet (tylin.com, page blocked); Wikipedia gives no figure. Treat as approximate.
- OLD EAST SPAN (cantilever + truss causeway, 10,176 ft, 1,400 ft cantilever main span): closed Aug 28, 2013. Dismantling: began Jan 2014; cantilever main span removed by June 12, 2015; pier E3 foundation imploded Nov 14, 2015; whole project completed Nov 11, 2017 (replacement-project article). The Bay Bridge article says "dismantled between January 2014 and November 2017" and elsewhere "completed September 8, 2018" (conflict; the later date probably refers to final seabed or foundation work). The old cantilever no longer exists.

## Sources
- https://en.wikipedia.org/wiki/San_Francisco%E2%80%93Oakland_Bay_Bridge (opened)
- https://en.wikipedia.org/wiki/Eastern_span_replacement_of_the_San_Francisco%E2%80%93Oakland_Bay_Bridge (opened)
- http://web.archive.org/web/2010/http://www.dot.ca.gov/hq/esc/tollbridge/SFOBB/Sfobbfacts.html (Caltrans facts, opened)
- OpenStreetMap via Overpass (ways 236374789, 237735191, 432712476-432712479)

## Model (P5)
Built in `js/sf-bridges.js`: the four OSM west-span towers (160 m) as cross-braced legs, the OSM centre anchorage (67 m), two double-deck suspension spans with their cables, the Yerba Buena Island portal, the east span's single OSM tower (160 m) with a cable loop and the decks along the OSM deck ways to Oakland. The I-80 freeway deck (grade-separation.js) runs on the bridge: westbound on the upper deck, eastbound on the lower, highway traffic included. **Estimates:** the truss width (20 m), lower deck 2 m over the truss bottom (67 m clearance is sourced), upper deck 9.5 m over the lower, 4 m camber, shore 58 m and portal 70 m heights, the 4.5% approach climb, legs and bracing sizes, east span deck heights (48 m at the tower to 8 m at Oakland), deck width 31 m each (derived from 258 ft total less a 50 ft gap). **Simplified:** the old cantilever is not modelled (demolished 2014-2017); east span decks as box girders on round piers every 160 m.
