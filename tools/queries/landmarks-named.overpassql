[out:json][timeout:180][bbox:{{bbox}}];
// P5.1: the landmark set pieces citywide (fetched for the "landmarks" box only: node tools/fetch-geodata.mjs --box
// landmarks --only osm --osm landmarks-named). Footprints by exact name, the bridges' supports, towers and decks,
// Sutro Tower's relations (the tower and its building parts), every building:part in the box (OSM's 3D drawings of the
// landmarks). out geom: relations keep their members' geometry.
(
  nwr["name"~"^(Palace of Fine Arts|Conservatory of Flowers|Old Mission Dolores|Mission Dolores Basilica|de Young Museum|Hamon Tower|Painted Ladies|Fort Point|Alcatraz Island|Salesforce Park|Salesforce Transit Center|Pier 39|Ghirardelli Square|Chase Center|Grace Cathedral|Yerba Buena Island)$"];
  nwr["name"="Alcatraz Island Lighthouse"];
  node["name"="Cable Car Turntable (Powell & Market)"];
  relation["name"="Sutro Tower"];
  way["building:part"];
  way["leisure"="pitch"]["sport"="baseball"];
  way["building"](37.8240,-122.4260,37.8290,-122.4190); // Alcatraz's buildings
  way["building"](37.7755,-122.4335,37.7770,-122.4320); // the Painted Ladies on Steiner St
  relation["building:part"];
  way["bridge:support"];
  way["tower:type"="bridge"];
  way["man_made"="bridge"]["name"~"Golden Gate|Bay Bridge"];
  way["highway"="motorway"]["bridge"]["bridge:name"~"Golden Gate|Bay Bridge"];
  way["highway"="motorway"]["bridge"]["name"~"Golden Gate|Bay Bridge"];
);
(._; >>;);
out geom;
