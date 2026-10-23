// tools/geo-landmarks.mjs — the P5 landmark sites and the bridges' structure, from OpenStreetMap and the USGS 1 m DEM:
// - sites: every modelled landmark (SITES below) as GEO.landmarks[name] in NYC's shape ({ x, z, w, d, h, area, ring })
//   plus `base` (the lowest DEM ground under the outline, or under the point; m NAVD88), `groundTop` (the highest),
//   `topH` (the OSM `height` tag: top above the ground, m), `ele` (OSM `ele`), `kind`, `slug`, `tier` and, where OSM
//   draws the structure in 3D, its `parts`: a `type=building` relation's (Sutro Tower), else the building:part ways inside
//   the outline (or within the site's `partsReach`). Sites in the
//   core box come from its landmarks file (osm/landmarks-core.json, already in GEO.landmarks), the rest from the named
//   query over the "landmarks" box (osm/landmarks-named-landmarks.json, tools/queries/landmarks-named.overpassql)
// - region ground: outside the core there is no terrain yet (phase 6), so the landmarks there would stand on the bay.
//   bakeRegionGround() writes the DEM at 16 m over the "landmarks" box (data/terrain-region.bin, the terrain format) as
//   interim ground (PLAN P5-1), until phase 6's region terrain replaces it
// - bridges: the Golden Gate's towers as OSM draws them (building parts with min_height / height: legs, portal struts),
//   its anchorages and pylons, the Bay Bridge's west-span towers, centre anchorage and supports, the east span's tower,
//   and each bridge's deck centreline (the motorway ways tagged bridge with the bridge's name)
// Unresolved names are reported (docs/reports/landmarks.md) and left out; nothing is invented here.
import fs from 'node:fs';
import path from 'node:path';
import { fromFile } from 'geotiff';
import proj4 from 'proj4';
import { osm, toWorld, fromWorld, ringArea, bbox, pointInRing, boxWorld, log, RAW, ROOT } from './geo-base.mjs';
import { writeBin } from './geo-terrain.mjs';

proj4.defs('EPSG:26910', '+proj=utm +zone=10 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
const toUTM = proj4('WGS84', 'EPSG:26910');

// The modelled landmarks: OSM name -> slug (js/landmarks.js, docs/landmarks/<slug>.md) and tier (phase 5 file)
export const SITES = {
  'Transamerica Pyramid': { slug: 'transamerica', tier: 1 },
  'Salesforce Tower': { slug: 'salesforce-tower', tier: 1 },
  'San Francisco Ferry Building': { slug: 'ferry-building', tier: 1 },
  'Coit Tower': { slug: 'coit-tower', tier: 1 },
  'San Francisco City Hall': { slug: 'city-hall', tier: 1 },
  'Sutro Tower': { slug: 'sutro-tower', tier: 1 },
  'Palace of Fine Arts': { slug: 'palace-of-fine-arts', tier: 1, partsReach: 220 }, // its colonnade stands round the lagoon
  'Oracle Park': { slug: 'oracle-park', tier: 1, field: true },
  'Grace Cathedral': { slug: 'grace-cathedral', tier: 2 },
  'Chase Center': { slug: 'chase-center', tier: 2 },
  'Ghirardelli Square': { slug: 'ghirardelli-square', tier: 2 },
  'Conservatory of Flowers': { slug: 'conservatory-of-flowers', tier: 2 },
  'Old Mission Dolores': { slug: 'mission-dolores', tier: 2 },
  'Mission Dolores Basilica': { slug: 'mission-dolores', tier: 2 },
  'Alcatraz Island': { slug: 'alcatraz', tier: 2, buildings: true, detail: 4 }, // a 4 m patch of the DEM: its cliffs
  'Painted Ladies': { slug: 'painted-ladies', tier: 2, point: 45, buildings: true }, // a point: 45 m round it
  'Fort Point': { slug: 'fort-point', tier: 2 },
  'de Young Museum': { slug: 'de-young', tier: 2 },
  'Salesforce Transit Center': { slug: 'salesforce-park', tier: 2 }, // the park's roof
  'Salesforce Park': { slug: 'salesforce-park', tier: 2 },
  'Cable Car Turntable (Powell & Market)': { slug: 'cable-car-turntable', tier: 3, point: 6 }, // the phase file's set piece
  'Yerba Buena Island': { slug: 'bay-bridge', tier: 1 } // the Bay Bridge's landfall and tunnel
};
const REGION_CELL = 16;
// The DEM's hydro-flattened bay is not one level everywhere (-1.07 m in the core, -0.4 m round Alcatraz): outside the
// core, ground at or under 0 m NAVD88 counts as water (PLAN P5-1)
const SEA_FLAT = 0;
const NODATA_MIN = -1000;

const ELE = (t) => (t.ele ? parseFloat(t.ele) : null);
const H = (t) => (t.height ? parseFloat(t.height) : null);
const neg = (r) => (ringArea(r) > 0 ? r.slice().reverse() : r);
const wpts = (geom) => geom.map((g) => toWorld(g.lon, g.lat));
const closed = (e) => e.geometry && e.geometry.length > 3 && e.geometry[0].lat === e.geometry.at(-1).lat && e.geometry[0].lon === e.geometry.at(-1).lon;
// outer rings of a way or a multipolygon / building relation (members chained end to end)
function outerRings(e) {
  if (e.type === 'way') return closed(e) ? [neg(wpts(e.geometry).slice(0, -1))] : [];
  if (e.type !== 'relation') return [];
  const segs = (e.members || []).filter((m) => m.type === 'way' && m.geometry && (m.role === 'outer' || m.role === '')).map((m) => wpts(m.geometry));
  const rings = [];
  const key = ([x, z]) => `${x.toFixed(2)},${z.toFixed(2)}`;
  while (segs.length) {
    let ring = segs.shift();
    for (let guard = 0; guard < 500 && key(ring[0]) !== key(ring.at(-1)); guard++) {
      const k = segs.findIndex((s) => key(s[0]) === key(ring.at(-1)) || key(s.at(-1)) === key(ring.at(-1)));
      if (k < 0) break;
      const s = segs.splice(k, 1)[0];
      ring = ring.concat((key(s[0]) === key(ring.at(-1)) ? s : s.slice().reverse()).slice(1));
    }
    if (ring.length > 3 && key(ring[0]) === key(ring.at(-1))) rings.push(neg(ring.slice(0, -1)));
  }
  return rings;
}

// ---------------------------------------------------------------------------------------------------------------------
// DEM sampling (data/raw/dem/*CA_SanFrancisco_B23*.tif, NAD83 / UTM 10N, NAVD88 m): bilinear on the 1 m pixel centres,
// NaN off the tiles or on nodata
// ---------------------------------------------------------------------------------------------------------------------
let TILES = null;
async function tiles() {
  if (TILES) return TILES;
  TILES = [];
  for (const f of fs.readdirSync(path.join(RAW, 'dem')).filter((f) => /SanFrancisco_B23.*\.tif$/i.test(f)).sort()) {
    const img = await (await fromFile(path.join(RAW, 'dem', f))).getImage();
    TILES.push({ f, img, origin: img.getOrigin(), res: img.getResolution(), W: img.getWidth(), H: img.getHeight(), nodata: Number(img.getGDALNoData()) });
  }
  return TILES;
}
async function sampleDEM(world) {
  const out = new Float32Array(world.length).fill(NaN);
  const utm = world.map(([x, z]) => toUTM.forward(fromWorld(x, z)));
  for (const t of await tiles()) {
    const [ox, oy] = t.origin, [rx, ry] = t.res;
    const idx = [];
    let c0 = Infinity, c1 = -Infinity, r0 = Infinity, r1 = -Infinity;
    utm.forEach(([e, n], k) => {
      if (!Number.isNaN(out[k])) return;
      const fc = (e - ox) / rx - 0.5, fr = (n - oy) / ry - 0.5;
      if (fc < 0 || fr < 0 || fc + 1 >= t.W || fr + 1 >= t.H) return;
      idx.push(k);
      c0 = Math.min(c0, Math.floor(fc)); c1 = Math.max(c1, Math.floor(fc) + 2);
      r0 = Math.min(r0, Math.floor(fr)); r1 = Math.max(r1, Math.floor(fr) + 2);
    });
    if (!idx.length) continue;
    const [data] = await t.img.readRasters({ window: [c0, r0, c1, r1] });
    const ww = c1 - c0;
    const at = (c, r) => {
      const v = data[(r - r0) * ww + (c - c0)];
      return v === t.nodata || v < NODATA_MIN ? NaN : v;
    };
    for (const k of idx) {
      const [e, n] = utm[k];
      const fc = (e - ox) / rx - 0.5, fr = (n - oy) / ry - 0.5;
      const c = Math.floor(fc), r = Math.floor(fr), tx = fc - c, ty = fr - r;
      out[k] = (at(c, r) * (1 - tx) + at(c + 1, r) * tx) * (1 - ty) + (at(c, r + 1) * (1 - tx) + at(c + 1, r + 1) * tx) * ty;
    }
  }
  return out;
}
// the ground under an outline: DEM samples on a 2 m grid inside it (coarser over islands: about 20k samples at most) and
// on its vertices
async function groundUnder(ring, waterLevel) {
  const b = bbox(ring);
  const step = Math.max(2, Math.sqrt(((b.x1 - b.x0) * (b.z1 - b.z0)) / 20000));
  const pts = ring.slice();
  for (let x = b.x0 + step / 2; x < b.x1; x += step) for (let z = b.z0 + step / 2; z < b.z1; z += step) if (pointInRing(x, z, ring)) pts.push([x, z]);
  let lo = Infinity, hi = -Infinity;
  for (const v of await sampleDEM(pts)) {
    const g = Number.isNaN(v) ? waterLevel : Math.max(v, waterLevel);
    lo = Math.min(lo, g); hi = Math.max(hi, g);
  }
  return { lo, hi, n: pts.length };
}

export async function buildLandmarkSites(box, coreLandmarks, waterLevel) {
  const B = boxWorld(box);
  const inCore = (x, z) => x >= B.x0 && x <= B.x1 && z >= B.z0 && z <= B.z1;
  const named = osm('landmarks-named', 'landmarks');
  const report = [];
  const sites = {};

  // --- sites ---
  for (const [name, spec] of Object.entries(SITES)) {
    let s = coreLandmarks[name] && coreLandmarks[name].ring.length > 2 ? { ...coreLandmarks[name], src: 'core' } : null;
    if (!s) {
      // the largest outline of that name in the named query (a building relation over its parts' ways counts once)
      let best = null;
      for (const e of named) {
        const t = e.tags || {};
        if (t.name !== name) continue;
        for (const ring of outerRings(e)) {
          const area = Math.abs(ringArea(ring));
          if (!best || area > best.area) best = { ring, area, t };
        }
      }
      if (best) {
        const b = bbox(best.ring);
        const t = best.t;
        s = {
          x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2, w: b.x1 - b.x0, d: b.z1 - b.z0, h: H(t), levels: t['building:levels'] ? Number(t['building:levels']) : null,
          area: Math.round(best.area), ring: best.ring, kind: t.man_made || t.building || t.place || t.leisure || '', src: 'named'
        };
        if (ELE(t) != null) s.ele = ELE(t);
      }
    }
    // a named point (an attraction without an outline): a square `point` m round it
    if (!s && spec.point) {
      const e = named.find((q) => q.type === 'node' && q.tags?.name === name);
      if (e) {
        const [x, z] = toWorld(e.lon, e.lat), r = spec.point;
        s = { x, z, w: 2 * r, d: 2 * r, h: null, levels: null, area: 0, ring: [[x - r, z + r], [x + r, z + r], [x + r, z - r], [x - r, z - r]], kind: e.tags.tourism || '', src: 'named point' };
      }
    }
    if (!s) { report.push(`| ${name} | ${spec.slug} | **unresolved** | | | |`); continue; }
    const g = await groundUnder(s.ring, waterLevel);
    s.base = Math.round(g.lo * 100) / 100;
    s.groundTop = Math.round(g.hi * 100) / 100;
    s.topH = s.h;
    s.slug = spec.slug;
    s.tier = spec.tier;
    s.inCore = inCore(s.x, s.z);
    const parts = buildingParts(named, name);
    if (!parts.length) parts.push(...partsWithin(named, s.ring, spec.partsReach || 0));
    if (parts.length) s.parts = parts;
    // a finer patch of the DEM over the site (+ 24 m) than the region ground's 16 m: heights in decimetres
    if (spec.detail) s.detail = await demPatch(s.ring, 24, spec.detail, waterLevel);
    // OSM buildings standing on the site (outside DataSF's core footprints: Alcatraz, the Painted Ladies)
    if (spec.buildings) {
      s.buildings = [];
      for (const e of named) {
        const t = e.tags || {};
        if (e.type !== 'way' || !t.building || t['building:part'] || !closed(e)) continue;
        const r = outerRings(e)[0];
        const b = bbox(r);
        if (!pointInRing((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, s.ring)) continue;
        const h = H(t) ?? (t['building:levels'] ? Number(t['building:levels']) * 3.5 : null);
        s.buildings.push({ ring: r, h, estimated: H(t) == null, name: t.name || '', kind: t.building, colour: t['building:colour'] || '', roof: t['roof:shape'] || '', roofH: t['roof:height'] ? parseFloat(t['roof:height']) : null, roofColour: t['roof:colour'] || '', min: t.min_height ? parseFloat(t.min_height) : 0 });
      }
    }
    // a ballpark's field: the largest OSM baseball pitch inside the outline
    if (spec.field) {
      let best = null;
      for (const e of named) {
        if (e.tags?.leisure !== 'pitch' || e.tags.sport !== 'baseball') continue;
        const r = outerRings(e)[0];
        if (!r) continue;
        const b = bbox(r);
        if (!pointInRing((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, s.ring)) continue;
        if (!best || Math.abs(ringArea(r)) > Math.abs(ringArea(best))) best = r;
      }
      if (best) s.field = best;
    }
    sites[name] = s;
    report.push(`| ${name} | ${spec.slug} | ${s.src} | ${s.x.toFixed(0)}, ${s.z.toFixed(0)} | ${s.base.toFixed(1)} – ${s.groundTop.toFixed(1)} m (${g.n} samples) | ${s.h ?? 'no height tag'}${s.ele != null ? `, ele ${s.ele}` : ''} |`);
  }

  // --- bridges ---
  const bridges = { goldenGate: bridgeParts(named, 'Golden Gate'), bayBridge: bridgeParts(named, 'Bay Bridge') };
  for (const [k, br] of Object.entries(bridges)) log(`landmarks: ${k}: ${br.towers.length} towers (${br.towers.map((t) => t.parts.length).join('/')} parts), ${br.supports.length} supports, ${br.decks.length} deck ways`);

  fs.writeFileSync(path.join(ROOT, 'docs/reports/landmarks.md'), [
    '# Landmark sites (generated by tools/geo-landmarks.mjs, P5.1)',
    '',
    'Base and ground range: the USGS 1 m DEM under the outline (2 m samples, coarser on islands), clamped to the water level. Height: the OSM',
    '`height` tag (top above the ground). `core`: the core box\'s landmarks file; `named`: the named query over the',
    '"landmarks" box.',
    '',
    '| OSM name | Slug | Source | x, z (m) | Ground | Height (OSM) |',
    '|---|---|---|---|---|---|',
    ...report,
    '',
    `Golden Gate Bridge: ${bridges.goldenGate.towers.length} towers, ${bridges.goldenGate.supports.length} supports, ${bridges.goldenGate.decks.length} deck ways.`,
    `Bay Bridge: ${bridges.bayBridge.towers.length} towers, ${bridges.bayBridge.supports.length} supports, ${bridges.bayBridge.decks.length} deck ways.`,
    ''
  ].join('\n'));
  log(`landmarks: ${Object.keys(sites).length}/${Object.keys(SITES).length} sites resolved`);
  return { sites, bridges };
}

// The building parts of a `type=building` relation of that name (Sutro Tower's legs, masts and crossarm levels): rings
// ([outer, ...holes]), min_height and height above the ground, colour and OSM description
function buildingParts(els, name) {
  const byId = new Map(els.map((e) => [`${e.type}${e.id}`, e]));
  const rel = els.find((e) => e.type === 'relation' && e.tags?.type === 'building' && e.tags.name === name);
  if (!rel) return [];
  const out = [];
  for (const m of rel.members || []) {
    if (m.role !== 'part') continue;
    const e = byId.get(`${m.type}${m.ref}`);
    const t = e?.tags || {};
    if (!e || t.height == null) continue;
    let rings = [];
    if (e.type === 'way') rings = outerRings(e);
    else {
      rings = outerRings(e);
      for (const im of e.members || []) if (im.role === 'inner' && im.geometry) rings.push(neg(wpts(im.geometry).slice(0, -1)).reverse());
    }
    if (!rings.length) continue;
    out.push({ rings, min: t.min_height ? parseFloat(t.min_height) : 0, h: parseFloat(t.height), colour: t['building:colour'] || t.colour || '', desc: t.description || '' });
  }
  return out;
}

// OSM building:part ways and multipolygons whose centroid lies inside the outline (or within `reach` m of its box)
function partsWithin(els, ring, reach) {
  const b = bbox(ring);
  const out = [];
  for (const e of els) {
    const t = e.tags || {};
    if (!t['building:part'] || t['building:part'] === 'no' || t.height == null || t['tower:type'] === 'bridge' || t['bridge:support']) continue;
    const rings = outerRings(e);
    if (!rings.length) continue;
    if (e.type === 'relation') for (const im of e.members || []) if (im.role === 'inner' && im.geometry) rings.push(neg(wpts(im.geometry).slice(0, -1)).reverse());
    const pb = bbox(rings[0]);
    const c = [(pb.x0 + pb.x1) / 2, (pb.z0 + pb.z1) / 2];
    const inside = reach ? c[0] > b.x0 - reach && c[0] < b.x1 + reach && c[1] > b.z0 - reach && c[1] < b.z1 + reach : pointInRing(c[0], c[1], ring);
    if (!inside) continue;
    out.push({
      rings, min: t.min_height ? parseFloat(t.min_height) : 0, h: parseFloat(t.height), colour: t['building:colour'] || t.colour || '', desc: t.description || '',
      roof: t['roof:shape'] || '', roofH: t['roof:height'] ? parseFloat(t['roof:height']) : null, roofDir: t['roof:direction'] ?? null, roofColour: t['roof:colour'] || '', material: t['building:material'] || ''
    });
  }
  return out;
}

// A step-m grid of DEM heights over the outline's box plus `reach` (decimetres; off the DEM: the water level)
async function demPatch(ring, reach, step, waterLevel) {
  const b = bbox(ring);
  const x0 = Math.floor((b.x0 - reach) / step) * step, z0 = Math.floor((b.z0 - reach) / step) * step;
  const nx = Math.ceil((b.x1 + reach - x0) / step) + 1, nz = Math.ceil((b.z1 + reach - z0) / step) + 1;
  const pts = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) pts.push([x0 + i * step, z0 + j * step]);
  const h = await sampleDEM(pts);
  return { x0, z0, step, nx, nz, h: [...h].map((v) => Math.round((Number.isNaN(v) || v <= SEA_FLAT ? waterLevel : v) * 10)) };
}

// A bridge's structure from the named query: towers (OSM tower:type=bridge parts, or building=tower supports, grouped
// within 40 m), the other supports (anchorages, pylons, piers) with their height tags, and the deck ways
function bridgeParts(els, which) {
  const re = new RegExp(which);
  const decks = els.filter((e) => e.type === 'way' && e.tags?.highway === 'motorway' && e.tags.bridge && re.test(`${e.tags.name || ''} ${e.tags['bridge:name'] || ''}`))
    .map((e) => ({ id: e.id, layer: Number(e.tags.layer || 0), pts: wpts(e.geometry) }));
  if (!decks.length) return { towers: [], supports: [], decks: [] };
  // the bridge's reach: its deck ways' box plus 150 m
  const all = decks.flatMap((d) => d.pts);
  const xb = bbox(all);
  const near = ([x, z]) => x > xb.x0 - 150 && x < xb.x1 + 150 && z > xb.z0 - 150 && z < xb.z1 + 150;
  const parts = [];
  const supports = [];
  for (const e of els) {
    const t = e.tags || {};
    if (e.type !== 'way' || !closed(e) || !(t['bridge:support'] || t['tower:type'] === 'bridge')) continue;
    const ring = outerRings(e)[0];
    if (!ring) continue;
    const b = bbox(ring);
    const c = [(b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2];
    if (!near(c)) continue;
    const item = { c, ring, min: t.min_height ? parseFloat(t.min_height) : 0, h: H(t), name: t.name || '', support: t['bridge:support'] || '', material: t['building:material'] || t.material || '' };
    if (t['tower:type'] === 'bridge' || t.building === 'tower') parts.push(item);
    else supports.push(item);
  }
  const towers = [];
  for (const p of parts) {
    let tw = towers.find((t) => Math.hypot(t.c[0] - p.c[0], t.c[1] - p.c[1]) < 40);
    if (!tw) towers.push((tw = { c: p.c, parts: [] }));
    tw.parts.push(p);
  }
  // a tower drawn with building parts has a concrete base under its legs (bridge:support=pylon at the same spot)
  for (const tw of towers) {
    tw.top = Math.max(...tw.parts.map((p) => p.h || 0));
    const n = tw.parts.length;
    tw.c = [tw.parts.reduce((s, p) => s + p.c[0], 0) / n, tw.parts.reduce((s, p) => s + p.c[1], 0) / n];
  }
  for (let i = supports.length - 1; i >= 0; i--) {
    const s = supports[i];
    const tw = towers.find((t) => Math.hypot(t.c[0] - s.c[0], t.c[1] - s.c[1]) < 40 && t.parts.length > 1);
    if (tw) { tw.parts.push(s); supports.splice(i, 1); }
  }
  return { towers, supports, decks };
}

// Interim region ground (PLAN P5-1): the DEM's 8 m overview (image 3 of each SanFrancisco_B23 tile) sampled bilinearly
// at 16 m over the "landmarks" box; off the tiles or nodata: the water level (the East Bay and Marin are not in these
// tiles). Written in the terrain format (docs/formats.md) as data/terrain-region.bin
export async function bakeRegionGround(waterLevel) {
  const B = boxWorld('landmarks');
  const x0 = Math.floor(B.x0 / REGION_CELL) * REGION_CELL, z0 = Math.floor(B.z0 / REGION_CELL) * REGION_CELL;
  const w = Math.ceil((B.x1 - x0) / REGION_CELL) + 1, h = Math.ceil((B.z1 - z0) / REGION_CELL) + 1;
  const heights = new Float32Array(w * h).fill(NaN);
  const utm = new Float64Array(w * h * 2);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const [e, n] = toUTM.forward(fromWorld(x0 + i * REGION_CELL, z0 + j * REGION_CELL));
      utm[(j * w + i) * 2] = e; utm[(j * w + i) * 2 + 1] = n;
    }
  }
  const used = [];
  for (const t of await tiles()) {
    const tiff = await fromFile(path.join(RAW, 'dem', t.f));
    const img = await tiff.getImage(3);
    const W = img.getWidth(), Hh = img.getHeight();
    const rx = t.res[0] * (t.W / W), ry = t.res[1] * (t.H / Hh);
    const [ox, oy] = t.origin;
    const [data] = await img.readRasters();
    const nodata = Number(t.nodata);
    const at = (c, r) => { const v = data[r * W + c]; return v === nodata || v < NODATA_MIN ? NaN : v; };
    let n = 0;
    for (let k = 0; k < w * h; k++) {
      if (!Number.isNaN(heights[k])) continue;
      const fc = (utm[2 * k] - ox) / rx - 0.5, fr = (utm[2 * k + 1] - oy) / ry - 0.5;
      const c = Math.floor(fc), r = Math.floor(fr);
      if (c < 0 || r < 0 || c + 1 >= W || r + 1 >= Hh) continue;
      const tx = fc - c, ty = fr - r;
      const v = (at(c, r) * (1 - tx) + at(c + 1, r) * tx) * (1 - ty) + (at(c, r + 1) * (1 - tx) + at(c + 1, r + 1) * tx) * ty;
      if (!Number.isNaN(v)) { heights[k] = v; n++; }
    }
    if (n) used.push(t.f);
  }
  let minH = Infinity, maxH = -Infinity, land = 0;
  for (let k = 0; k < heights.length; k++) {
    if (Number.isNaN(heights[k]) || heights[k] <= SEA_FLAT) heights[k] = waterLevel;
    if (heights[k] > waterLevel + 0.05) land++;
    minH = Math.min(minH, heights[k]); maxH = Math.max(maxH, heights[k]);
  }
  minH = Math.floor(minH) - 1;
  maxH = Math.ceil(maxH) + 1;
  const scale = (maxH - minH) / 65535;
  const q = new Uint16Array(w * h);
  for (let k = 0; k < q.length; k++) q[k] = Math.round((heights[k] - minH) / scale);
  const header = { format: 'sf-terrain', version: 1, box: 'landmarks', cell: REGION_CELL, originX: x0, originZ: z0, w, h, minH, maxH, scale, waterLevel, datum: 'NAVD88 m', source: used.map((f) => `${f} (overview 3, 8 m)`) };
  writeBin(path.join(ROOT, 'data/terrain-region.bin'), header, q);
  log(`landmarks: region ground ${w} x ${h} @ ${REGION_CELL} m, ${(100 * land / (w * h)).toFixed(1)}% land, ${minH} - ${maxH} m, from ${used.length} tiles`);
  return { url: 'data/terrain-region.bin', cell: REGION_CELL };
}
