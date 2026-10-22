[out:json][timeout:120];
(
  node["natural"~"^(peak|hill)$"]["ele"]({{bbox}});
);
out tags;
