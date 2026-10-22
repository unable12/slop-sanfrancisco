[out:json][timeout:180];
(
  way["man_made"="pier"]({{bbox}});
  relation["man_made"="pier"]({{bbox}});
);
out geom tags;
