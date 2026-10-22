// tools/geo-extra.mjs — land, piers, parks, water bodies and landmark footprints for the box:
// - land: everything the baked terrain holds above the hydro-flattened bay (tools/geo-terrain.mjs), traced as polygons
// - piers: OSM man_made=pier areas reaching out over the water (as NYC's: oriented box + outline)
// - parks: DataSF Recreation and Parks Properties (gtr9-ntp6)
// - water: OSM natural=water polygons on land (ponds, fountains are skipped below 200 m^2)
// - landmarks: OSM named buildings & towers with their footprints and height tags (phase 5 builds on these)
// Every ring follows NYC's orientation (negative ringArea()).
import path from 'node:path';
import { osm, datasf, worldPolygons, toWorld, rdpRing, ringArea, bbox, boxWorld, log, ROOT, BOX } from './geo-base.mjs';
import { readBin } from './geo-terrain.mjs';

const neg = (r) => (ringArea(r) > 0 ? r.slice().reverse() : r);

function orientedBox(ring) {
  // minimum-area rectangle over the outline's edge directions (from NYC geo-extra.mjs)
  let best = null;
  for (let i = 0; i < ring.length; i++) {
    const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % ring.length];
    const L = Math.hypot(x1 - x0, z1 - z0);
    if (L < 1) continue;
    const ux = (x1 - x0) / L, uz = (z1 - z0) / L;
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const [x, z] of ring) {
      const a = x * ux + z * uz, b = -x * uz + z * ux;
      a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b);
    }
    const area = (a1 - a0) * (b1 - b0);
    if (!best || area < best.area) best = { area, ux, uz, a0, a1, b0, b1 };
  }
  const { ux, uz, a0, a1, b0, b1 } = best;
  const ca = (a0 + a1) / 2, cb = (b0 + b1) / 2;
  let len = a1 - a0, wid = b1 - b0, ang = Math.atan2(uz, ux);
  if (wid > len) { [len, wid] = [wid, len]; ang += Math.PI / 2; }
  return { cx: ca * ux - cb * uz, cz: ca * uz + cb * ux, len, wid, ang };
}

// Closed rings of an OSM way / multipolygon relation (outer members chained)
function osmRings(e) {
  if (e.type === 'way') return e.geometry && e.geometry.length > 3 ? [e.geometry.map((g) => toWorld(g.lon, g.lat))] : [];
  const parts = (e.members || []).filter((m) => m.role === 'outer' && m.geometry).map((m) => m.geometry.map((g) => toWorld(g.lon, g.lat)));
  const close = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.5;
  const rings = [];
  while (parts.length) {
    let ring = parts.shift();
    for (let guard = 0; guard < 500 && !close(ring[0], ring[ring.length - 1]); guard++) {
      const i = parts.findIndex((p) => close(p[0], ring[ring.length - 1]) || close(p[p.length - 1], ring[ring.length - 1]));
      if (i < 0) break;
      const p = parts.splice(i, 1)[0];
      ring = ring.concat(close(p[0], ring[ring.length - 1]) ? p.slice(1) : p.reverse().slice(1));
    }
    if (ring.length > 3 && close(ring[0], ring[ring.length - 1])) rings.push(ring);
  }
  return rings;
}

export function buildExtra(box = BOX) {
  const B = boxWorld(box);

  // --- land from the terrain's water mask (4 m sampling, traced per component) -----------------------------------------
  const { header: H, payload } = readBin(path.join(ROOT, `data/terrain-${box}.bin`));
  const q = new Uint16Array(payload.buffer, payload.byteOffset, H.w * H.h);
  const waterQ = Math.round((H.waterLevel - H.minH) / H.scale);
  const STEP = 2; // terrain samples per land cell (4 m)
  const W = Math.floor(H.w / STEP), Hh = Math.floor(H.h / STEP);
  const landMask = new Uint8Array(W * Hh);
  for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) landMask[j * W + i] = Math.abs(q[j * STEP * H.w + i * STEP] - waterQ) > 3 ? 1 : 0;
  const cell = H.cell * STEP;
  const land = traceMask(landMask, W, Hh, H.originX, H.originZ, cell, 2000).map((r) => neg(rdpRing(r, 1.5)));

  // --- piers ----------------------------------------------------------------------------------------------------------
  const isLand = (x, z) => {
    const i = Math.round((x - H.originX) / cell), j = Math.round((z - H.originZ) / cell);
    return i >= 0 && j >= 0 && i < W && j < Hh && landMask[j * W + i] === 1;
  };
  const piers = [];
  for (const e of osm('piers', box)) {
    for (const ring of osmRings(e)) {
      const area = Math.abs(ringArea(ring));
      if (area < 150) continue;
      const ob = orientedBox(ring);
      // over the water: most of the outline isn't land
      const wet = ring.filter(([x, z]) => !isLand(x, z)).length / ring.length;
      if (wet < 0.4) continue;
      const r = neg(rdpRing(ring, 0.6));
      piers.push({ name: e.tags?.name || '', ...ob, area: Math.round(area), ring: r });
    }
  }
  piers.sort((a, b) => b.area - a.area);
  const pierOut = [];
  for (const p of piers) if (!pierOut.some((o) => Math.hypot(o.cx - p.cx, o.cz - p.cz) < 12)) pierOut.push(p);

  // --- parks ----------------------------------------------------------------------------------------------------------
  const parks = [];
  for (const f of datasf('parks', box)) {
    const p = f.properties;
    const rings = worldPolygons(f.geometry).map((polys) => polys[0]).filter((r) => Math.abs(ringArea(r)) > 100).map((r) => neg(rdpRing(r, 0.8)));
    if (rings.length) parks.push({ name: p.property_name || '', cat: p.propertytype || '', acres: Math.round(Number(p.acres || 0) * 10) / 10, rings });
  }

  // --- water bodies on land -----------------------------------------------------------------------------------------------
  const water = [];
  for (const e of osm('landuse', box)) {
    const t = e.tags || {};
    if (!(t.natural === 'water' || t.water)) continue;
    for (const ring of osmRings(e)) if (Math.abs(ringArea(ring)) > 200) water.push({ name: t.name || '', ring: neg(rdpRing(ring, 0.6)) });
  }

  // --- landmark footprints (named buildings, towers, stadiums) ------------------------------------------------------------
  const landmarks = {};
  for (const e of osm('landmarks', box)) {
    const t = e.tags || {};
    if (!t.name) continue;
    for (const ring of osmRings(e)) {
      const b = bbox(ring);
      const area = Math.abs(ringArea(ring));
      const prev = landmarks[t.name];
      if (prev && prev.area >= area) continue;
      landmarks[t.name] = {
        x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2, w: b.x1 - b.x0, d: b.z1 - b.z0,
        h: t.height ? parseFloat(t.height) : null, levels: t['building:levels'] ? Number(t['building:levels']) : null,
        area: Math.round(area), ring: neg(rdpRing(ring, 0.4)), kind: t.man_made || t.leisure || t.building || ''
      };
    }
  }

  log(`extra ${box}: ${land.length} land polygons, ${pierOut.length} piers, ${parks.length} parks, ${water.length} water bodies, ${Object.keys(landmarks).length} landmark footprints`);
  void B;
  return { land, piers: pierOut, parks, water, landmarks };
}

// Outer contours of the mask's 4-connected components larger than minArea (m^2): corner walk with the component on the
// right (as NYC's traceComponent); world coordinates of the cell corners
export function traceMask(mask, W, H, x0, z0, cell, minArea) {
  const lab = new Int32Array(W * H);
  const out = [];
  const stack = new Int32Array(W * H);
  let id = 0;
  for (let s0 = 0; s0 < W * H; s0++) {
    if (!mask[s0] || lab[s0]) continue;
    id++;
    let sp = 0, n = 0;
    stack[sp++] = s0;
    lab[s0] = id;
    while (sp) {
      const p = stack[--sp];
      n++;
      const i = p % W;
      if (i > 0 && mask[p - 1] && !lab[p - 1]) { lab[p - 1] = id; stack[sp++] = p - 1; }
      if (i < W - 1 && mask[p + 1] && !lab[p + 1]) { lab[p + 1] = id; stack[sp++] = p + 1; }
      if (p >= W && mask[p - W] && !lab[p - W]) { lab[p - W] = id; stack[sp++] = p - W; }
      if (p + W < W * H && mask[p + W] && !lab[p + W]) { lab[p + W] = id; stack[sp++] = p + W; }
    }
    if (n * cell * cell < minArea) continue;
    const at = (i, j) => (i >= 0 && j >= 0 && i < W && j < H && lab[j * W + i] === id ? 1 : 0);
    const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];
    let cx = s0 % W, cz = (s0 - (s0 % W)) / W, dir = 0;
    const start = `${cx},${cz},${dir}`;
    const pts = [];
    let guard = 0;
    do {
      pts.push([x0 + (cx - 0.5) * cell, z0 + (cz - 0.5) * cell]);
      cx += DX[dir];
      cz += DZ[dir];
      let left, right;
      if (dir === 0) { left = at(cx, cz - 1); right = at(cx, cz); }
      else if (dir === 1) { left = at(cx, cz); right = at(cx - 1, cz); }
      else if (dir === 2) { left = at(cx - 1, cz); right = at(cx - 1, cz - 1); }
      else { left = at(cx - 1, cz - 1); right = at(cx, cz - 1); }
      if (left && right) dir = (dir + 3) % 4;
      else if (!right) dir = (dir + 1) % 4;
      if (++guard > 4e6) break;
    } while (`${cx},${cz},${dir}` !== start);
    out.push(pts);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) buildExtra(process.argv[2] || BOX);
