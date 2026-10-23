// tools/build-geodata.mjs — the SF data pipeline: raw inputs in data/raw/ (tools/fetch-geodata.mjs) -> the game's data:
//   js/sf-geodata.js        vector data as window.NYC.GEO (frame, land, road graph, curb islands, parks, piers, landmarks)
//   data/terrain-<box>.bin  height field (tools/geo-terrain.mjs)
//   data/buildings-<box>.bin footprints & heights (tools/geo-buildings.mjs)
//   data/groundmask-<box>.bin what the ground is made of, 1 m cells (tools/geo-groundmask.mjs)
//   data/terrain-region.bin interim 16 m ground round the core (tools/geo-landmarks.mjs, P5-1)
// plus reports in docs/reports/. Order: terrain -> curb islands -> road graph -> extra (needs terrain) -> buildings ->
// ground mask (needs terrain, curb islands & parks).
//
// usage: node tools/build-geodata.mjs [box] [out.js]      (box from tools/boxes.json, default "slice")
import fs from 'node:fs';
import path from 'node:path';
import { boxWorld, geo, log, ROOT, ringArea } from './geo-base.mjs';
import { bakeTerrain } from './geo-terrain.mjs';
import { buildCurbIslands } from './geo-curbs.mjs';
import { buildRoadGraph } from './geo-roadgraph.mjs';
import { buildExtra } from './geo-extra.mjs';
import { buildBuildings } from './geo-buildings.mjs';
import { buildLandmarkSites, bakeRegionGround } from './geo-landmarks.mjs';
import { buildGroundMask } from './geo-groundmask.mjs';

const box = process.argv[2] || process.env.GEO_BOX || 'slice';
if (process.env.GEO_BOX && process.env.GEO_BOX !== box) throw new Error('GEO_BOX and the box argument disagree');
process.env.GEO_BOX = box;
const OUT = process.argv[3] || path.join(ROOT, 'js/sf-geodata.js');
const q = (v) => Math.round(v * 10) / 10;
const flat = (pts) => pts.flatMap(([x, z]) => [q(x), q(z)]);

const terrain = await bakeTerrain(box);
const curbs = buildCurbIslands(box);
const roadGraph = buildRoadGraph(box, curbs);
const extra = buildExtra(box);
// P5.1: the modelled landmarks' sites (base, height, aprons outside the core) and the bridges' structure
const lm = await buildLandmarkSites(box, extra.landmarks, terrain.waterLevel);
Object.assign(extra.landmarks, lm.sites);
const region = await bakeRegionGround(terrain.waterLevel);
const buildings = buildBuildings(box, curbs.blocks.map((b) => b.ring), extra.landmarks);
const groundMask = buildGroundMask(box, { blocks: curbs.blocks.map((b) => b.ring), parks: extra.parks });

const B = boxWorld(box);
const GEO = {
  version: 2,
  city: 'San Francisco',
  frame: { ...geo.frame, units: 'm', bearingDeg: 0, up: 'NAVD88 m' },
  box: { name: box, x0: q(B.x0), x1: q(B.x1), z0: q(B.z0), z1: q(B.z1) },
  data: {
    terrain: { url: `data/terrain-${box}.bin`, waterLevel: terrain.waterLevel, minH: terrain.minH, maxH: terrain.maxH },
    buildings: { url: `data/buildings-${box}.bin`, count: buildings.count },
    groundMask: { url: groundMask.url },
    region // interim ground outside the core (P5-1, until phase 6)
  },
  land: extra.land.filter((r) => Math.abs(ringArea(r)) > 2000).map(flat),
  // [outline, lot rects (none), park share, park name, rectangular, frames, kind]
  blocks: curbs.blocks.map((b) => [flat(b.ring), [], b.park, b.parkName, b.rect ? 1 : 0, b.frames.map(([th, px, pz, rs]) => [Math.round(th * 1e4) / 1e4, q(px), q(pz), rs]), b.kind]),
  roadGraph,
  parks: extra.parks.map((p) => ({ ...p, rings: p.rings.map(flat) })),
  piers: extra.piers.map((p) => ({ name: p.name, cx: q(p.cx), cz: q(p.cz), len: q(p.len), wid: q(p.wid), ang: Math.round(p.ang * 1e4) / 1e4, ring: flat(p.ring) })),
  water: extra.water.map((w) => ({ name: w.name, ring: flat(w.ring) })),
  rail: extra.rail.map((r) => ({ kind: r.kind, pts: flat(r.pts) })),
  trolley: extra.trolley.map((r) => ({ oneway: r.oneway, pts: flat(r.pts) })),
  muniStops: extra.muniStops.flatMap(([x, z, s]) => [q(x), q(z), s]),
  bikeways: extra.bikeways.map((b) => ({ cls: b.cls, buffered: b.buffered, side: b.side, pts: flat(b.pts) })),
  trees: extra.trees.flatMap(([x, z, c, d]) => [q(x), q(z), c, d]),
  transit: extra.transit.map((t) => ({ name: t.name, kind: t.kind, colour: t.colour, pts: flat(t.pts), stops: t.stops })),
  landmarks: Object.fromEntries(Object.entries(extra.landmarks).map(([k, v]) => [k, {
    ...v, x: q(v.x), z: q(v.z), w: q(v.w), d: q(v.d), ring: flat(v.ring), ...(v.field && { field: flat(v.field) }), ...(v.buildings && { buildings: v.buildings.map((b) => ({ ...b, ring: flat(b.ring) })) }), ...(v.parts && { parts: v.parts.map((p) => ({ ...p, rings: p.rings.map(flat) })) })
  }])),
  // P5.1: [x, z] centres, flat rings; heights (min, h) in m above the water (OSM min_height / height)
  bridges: Object.fromEntries(Object.entries(lm.bridges).map(([k, b]) => [k, {
    towers: b.towers.map((t) => ({ c: t.c.map(q), top: t.top, parts: t.parts.map((p) => ({ ring: flat(p.ring), min: p.min, h: p.h, name: p.name, support: p.support, material: p.material })) })),
    supports: b.supports.map((p) => ({ c: p.c.map(q), ring: flat(p.ring), min: p.min, h: p.h, name: p.name, support: p.support })),
    decks: b.decks.map((d) => ({ layer: d.layer, pts: flat(d.pts) }))
  }]))
};

const header = `// js/sf-geodata.js — GENERATED by tools/build-geodata.mjs (box "${box}"), do not edit by hand.
// Real San Francisco geography in the simulation's world frame: 1 unit = 1 m, x = east, z = south (north = -z),
// y = NAVD88 elevation; origin at the Market St & Montgomery St centreline node. Polygons & polylines are flat
// [x0, z0, x1, z1, ...] arrays. Large typed data (terrain, buildings) lives in data/*.bin (docs/formats.md).
// Sources: DataSF (PDDL / CC0): streets, curbs & islands, sidewalk widths, signals, stop signs, parks, building footprints,
// Muni stops, bike network, street trees;
// USGS 3DEP 1 m DEM; © OpenStreetMap contributors (ODbL): piers, water, landmark footprints, bridges, lanes.
`;
fs.writeFileSync(OUT, `${header}(function () {\nwindow.NYC = window.NYC || {};\nwindow.NYC.GEO = ${JSON.stringify(GEO)};\n})();\n`);
log(`wrote ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
for (const [k, v] of Object.entries(GEO)) log(`  ${k}: ${(JSON.stringify(v).length / 1024).toFixed(0)} KB`);
