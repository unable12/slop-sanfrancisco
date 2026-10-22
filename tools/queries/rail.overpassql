[out:json][timeout:180];
(
  way["railway"~"^(tram|light_rail|funicular|rail|subway|narrow_gauge)$"]({{bbox}});
  way["trolley_wire"="yes"]({{bbox}});
  relation["route"~"^(tram|light_rail|trolleybus|funicular)$"]({{bbox}});
);
out geom tags;
