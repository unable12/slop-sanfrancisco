[out:json][timeout:180];
(
  way["building"]["name"]({{bbox}});
  relation["building"]["name"]({{bbox}});
  way["man_made"~"^(tower|mast)$"]({{bbox}});
  node["man_made"~"^(tower|mast)$"]({{bbox}});
  way["leisure"="stadium"]({{bbox}});
  relation["leisure"="stadium"]({{bbox}});
  way["tourism"~"^(attraction|museum)$"]["name"]({{bbox}});
  node["tourism"="attraction"]["name"]({{bbox}});
  node["historic"]["name"]({{bbox}});
  node["place"~"^(neighbourhood|quarter)$"]["name"]({{bbox}});
);
out geom;
