[out:json][timeout:180];
(
  way["highway"]["highway"!~"^(footway|path|steps|cycleway|track|bridleway|corridor|proposed|construction)$"]({{bbox}});
);
out geom tags;
