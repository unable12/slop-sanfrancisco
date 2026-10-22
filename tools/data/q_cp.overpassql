[out:json][timeout:120];
(
  way["natural"="water"](40.763,-73.983,40.801,-73.948);
  relation["natural"="water"](40.763,-73.983,40.801,-73.948);
  way["highway"]["name"~"Drive|Transverse|Terrace"](40.763,-73.983,40.801,-73.948);
  way["leisure"]["name"](40.763,-73.983,40.801,-73.948);
  way["landuse"="grass"]["name"](40.763,-73.983,40.801,-73.948);
  way["natural"="bare_rock"](40.763,-73.983,40.801,-73.948);
  way["bridge"]["name"](40.763,-73.983,40.801,-73.948);
  way["building"]["name"](40.763,-73.983,40.801,-73.948);
  way["tourism"]["name"](40.763,-73.983,40.801,-73.948);
);
out geom;
