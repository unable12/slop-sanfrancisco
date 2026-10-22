[out:json][timeout:180];
(
  way["natural"="coastline"]({{bbox}});
  way["place"="island"]({{bbox}});
  relation["place"="island"]({{bbox}});
);
out geom tags;
