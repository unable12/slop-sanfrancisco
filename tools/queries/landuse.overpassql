[out:json][timeout:180];
(
  way["leisure"~"^(park|garden|playground|pitch|golf_course)$"]({{bbox}});
  relation["leisure"~"^(park|garden|golf_course)$"]({{bbox}});
  way["landuse"~"^(forest|grass|cemetery|industrial|railway)$"]({{bbox}});
  way["natural"~"^(wood|scrub|beach|cliff|water|sand)$"]({{bbox}});
  relation["natural"~"^(wood|water|beach)$"]({{bbox}});
  way["water"]({{bbox}});
);
out geom tags;
