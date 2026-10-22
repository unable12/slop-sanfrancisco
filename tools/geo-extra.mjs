// tools/geo-extra.mjs — land, piers, parks, water bodies and landmark footprints for the box:
// - land: everything the baked terrain holds above the hydro-flattened bay (tools/geo-terrain.mjs), traced as polygons
// - piers: OSM man_made=pier areas reaching out over the water (as NYC's: oriented box + outline)
// - parks: DataSF Recreation and Parks Properties (gtr9-ntp6)
// - water: OSM natural=water polygons on land (ponds, fountains are skipped below 200 m^2)
// - landmarks: OSM named buildings & towers with their footprints and height tags (phase 5 builds on these), and
//   named attractions, monuments and neighbourhoods as points (teleports, labels)
// - rail: OSM surface tram & light rail centrelines (rail paint and rail medians, P3.4)
// - trolley: OSM streets tagged trolley_wire=yes (overhead wires, P4.4), with their oneway tag
// - muniStops: DataSF Muni Stops (i28k-bkz6) points and whether the stop has a shelter (`shelter` 1)
// - bikeways: DataSF Bike Network (ygmz-vaxd) painted lanes: class II (lanes) and IV (separated), `buffered`, the
//   travel direction of one-way ones (`dir`: compass) against the drawing direction
// - transit: OSM Muni route relations (streetcar F, the cable cars, Muni Metro): each route's track ways chained in
//   the relation's order, cut to the box and to the surface (no tunnel ways), and its stop nodes as distances along
//   the run (P4.6)
// - trees: DataSF Street Tree Inventory (tkzw-k3nq) standing trees: position, visual class (tools/tree-classes.json) and
//   trunk diameter at breast height in inches (`mapdbh`, else the middle of its `dbhrange`: 1 = 3-10, 2 = 11-20,
//   3 = 21+ in, as the inventory's own mapdbh values fall in the core)
// Every ring follows NYC's orientation (negative ringArea()).
import fs from 'node:fs';
import path from 'node:path';
import { osm, datasf, worldPolygons, worldLines, toWorld, rdp, rdpRing, ringArea, bbox, boxWorld, log, ROOT, BOX } from './geo-base.mjs';
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
    // a named point (an attraction, a monument, a neighbourhood's label): where it is, no footprint; a footprint of the
    // same name wins
    if (e.type === 'node') {
      if (landmarks[t.name]) continue;
      const [x, z] = toWorld(e.lon, e.lat);
      landmarks[t.name] = { x, z, w: 0, d: 0, h: null, levels: null, area: 0, ring: [], kind: t.tourism || t.historic || t.place || t.man_made || '' };
      continue;
    }
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

  // --- surface rail (OSM tram & light rail: the Embarcadero's and Market St's F & E lines, the N and T on King St & 3rd
  //     St; their tunnels left out): centrelines for the rail paint & the rail medians (P3.4; trams come in P4) -------
  const rail = [];
  for (const e of osm('rail', box)) {
    const t = e.tags || {};
    if (e.type !== 'way' || !e.geometry || !/^(tram|light_rail)$/.test(t.railway || '') || (t.tunnel && t.tunnel !== 'no')) continue;
    rail.push({ kind: t.railway, pts: rdp(e.geometry.map((g) => toWorld(g.lon, g.lat)), 0.2) });
  }

  // --- overhead trolleybus wires: OSM highways tagged trolley_wire=yes (1: one-way along the drawing, -1 against) ---
  const inBox = ([x, z]) => x >= B.x0 && x <= B.x1 && z >= B.z0 && z <= B.z1;
  const trolley = [];
  for (const e of osm('roads-tags', box)) {
    const t = e.tags || {};
    if (e.type !== 'way' || !e.geometry || t.trolley_wire !== 'yes' || (t.tunnel && t.tunnel !== 'no')) continue;
    const pts = rdp(e.geometry.map((g) => toWorld(g.lon, g.lat)), 0.3);
    if (!pts.some(inBox)) continue;
    trolley.push({ oneway: t.oneway === 'yes' ? 1 : t.oneway === '-1' ? -1 : 0, pts });
  }
  // --- Muni stops: position and shelter ---
  const muniStops = [];
  for (const f of datasf('muni-stops', box)) {
    const p = f.properties;
    const xz = toWorld(Number(p.longitude), Number(p.latitude));
    if (!xz.every(Number.isFinite) || !inBox(xz)) continue;
    muniStops.push([...xz, String(p.shelter) === '1' ? 1 : 0]);
  }
  // --- bike lanes: class II & IV; side 0 both curbs, 1 the right of the drawing direction, -1 its left ---
  const COMPASS = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
  const bikeways = [];
  for (const f of datasf('bikeways', box)) {
    const p = f.properties;
    const cls = p.facility_t === 'CLASS II' ? 2 : p.facility_t === 'CLASS IV' ? 4 : 0;
    if (!cls) continue;
    for (const line of worldLines(f.geometry)) {
      const pts = rdp(line, 0.3);
      if (pts.length < 2 || !pts.some(inBox)) continue;
      let side = 0;
      if (p.direct === '1W' && COMPASS[p.dir]) {
        const [a, b] = [pts[0], pts[pts.length - 1]];
        side = (b[0] - a[0]) * COMPASS[p.dir][0] + (b[1] - a[1]) * COMPASS[p.dir][1] >= 0 ? 1 : -1;
      }
      bikeways.push({ cls, buffered: p.buffered === 'YES' ? 1 : 0, side, pts });
    }
  }
  // --- transit routes (OSM route relations: full members since the rail query ends `out geom`) ---
  const railEls = osm('rail', box);
  const wayById = new Map(railEls.filter((e) => e.type === 'way').map((e) => [e.id, e]));
  const transit = [];
  for (const r of railEls) {
    if (r.type !== 'relation' || !/^(tram|light_rail)$/.test(r.tags?.route || '') || !r.members) continue;
    const name = r.tags.name || '';
    const kind = /Cable Car/i.test(name) ? 'cablecar' : r.tags.route === 'tram' ? 'streetcar' : 'lightrail';
    // the track ways in order, each turned to start where the last one ended; a tunnel way breaks the run
    const runs = [];
    let run = [];
    for (const m of r.members) {
      if (m.type !== 'way' || m.role !== '' || !m.geometry) continue;
      const w = wayById.get(m.ref);
      let pts = m.geometry.map((g) => toWorld(g.lon, g.lat));
      if ((w?.tags?.tunnel && w.tags.tunnel !== 'no') || w?.tags?.railway === 'subway') { if (run.length) runs.push(run); run = []; continue; }
      if (run.length) {
        const end = run[run.length - 1];
        const d0 = Math.hypot(pts[0][0] - end[0], pts[0][1] - end[1]), d1 = Math.hypot(pts[pts.length - 1][0] - end[0], pts[pts.length - 1][1] - end[1]);
        if (d1 < d0) pts = pts.reverse();
        if (Math.min(d0, d1) > 30) { runs.push(run); run = []; }
      } else if (runs.length === 0) {
        // the first way: turn it to run into the second
        const next = r.members.find((n) => n !== m && n.type === 'way' && n.role === '' && n.geometry);
        if (next) {
          const q = next.geometry.map((g) => toWorld(g.lon, g.lat));
          const near = (a) => Math.min(Math.hypot(a[0] - q[0][0], a[1] - q[0][1]), Math.hypot(a[0] - q[q.length - 1][0], a[1] - q[q.length - 1][1]));
          if (near(pts[0]) < near(pts[pts.length - 1])) pts = pts.reverse();
        }
      }
      for (const pt of pts) {
        const last = run[run.length - 1];
        if (!last || Math.hypot(pt[0] - last[0], pt[1] - last[1]) > 0.05) run.push(pt);
      }
    }
    if (run.length) runs.push(run);
    const stopPts = r.members.filter((m) => m.type === 'node' && /^stop/.test(m.role) && Number.isFinite(m.lat)).map((m) => toWorld(m.lon, m.lat));
    for (const full of runs) {
      // the stretches inside the box
      let piece = [];
      const pieces = [];
      for (const pt of full) {
        if (inBox(pt)) piece.push(pt);
        else if (piece.length) { pieces.push(piece); piece = []; }
      }
      if (piece.length) pieces.push(piece);
      for (const raw of pieces) {
        const pts = rdp(raw, 0.15);
        const cum = [0];
        for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
        const len = cum[cum.length - 1];
        if (len < 300) continue;
        // stops within 12 m of the run, as distances along it
        const stops = [];
        for (const [sx, sz] of stopPts) {
          let best = null;
          for (let i = 1; i < pts.length; i++) {
            const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
            const L = cum[i] - cum[i - 1] || 1e-9;
            const t = Math.max(0, Math.min(1, ((sx - ax) * (bx - ax) + (sz - az) * (bz - az)) / (L * L)));
            const d = Math.hypot(ax + (bx - ax) * t - sx, az + (bz - az) * t - sz);
            if (d < 12 && (!best || d < best.d)) best = { d, s: cum[i - 1] + t * L };
          }
          if (best) stops.push(Math.round(best.s * 10) / 10);
        }
        transit.push({ name, kind, colour: r.tags.colour || '', pts, len, stops: [...new Set(stops)].sort((a, b) => a - b) });
      }
    }
  }
  log(`extra ${box}: ${transit.length} transit runs (${transit.map((t) => `${t.name.replace(/^Muni /, '').split(':')[0]} ${Math.round(t.len)} m, ${t.stops.length} stops`).join('; ')})`);

  // --- street trees ---
  const TC = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/tree-classes.json'), 'utf8'));
  const drop = new RegExp(TC.drop);
  const classes = TC.classes.map(([c, re]) => [c, new RegExp(re)]);
  const trees = [];
  const treeStats = { dropped: 0, noPoint: 0, outside: 0, byClass: [0, 0, 0, 0, 0, 0] };
  for (const f of datasf('trees', box)) {
    const p = f.properties;
    const name = String(p.species || '').split(' :: ')[0].trim();
    if (drop.test(name)) { treeStats.dropped++; continue; }
    const c = f.geometry?.coordinates;
    if (!c || !c.every(Number.isFinite)) { treeStats.noPoint++; continue; }
    const xz = toWorld(c[0], c[1]);
    if (!inBox(xz)) { treeStats.outside++; continue; }
    const cls = classes.find(([, re]) => re.test(name))?.[0] ?? TC.default;
    const dbh = Number(p.mapdbh) > 0 ? Number(p.mapdbh) : [6, 6, 15, 28][Number(p.dbhrange) || 0];
    treeStats.byClass[cls]++;
    trees.push([...xz, cls, Math.round(Math.min(dbh, 99))]);
  }
  log(`extra ${box}: ${trees.length} street trees (plane ${treeStats.byClass[0]}, ficus ${treeStats.byClass[1]}, palm ${treeStats.byClass[2]}, broadleaf ${treeStats.byClass[3]}, conifer ${treeStats.byClass[4]}, fine ${treeStats.byClass[5]}); dropped ${treeStats.dropped} non-trees, ${treeStats.noPoint} without a point, ${treeStats.outside} outside the box`);
  log(`extra ${box}: ${land.length} land polygons, ${pierOut.length} piers, ${parks.length} parks, ${water.length} water bodies, ${Object.keys(landmarks).length} landmark footprints, ${rail.length} rail lines, ${trolley.length} trolley-wire ways, ${muniStops.length} Muni stops (${muniStops.filter((m) => m[2]).length} sheltered), ${bikeways.length} bike lanes`);
  void B;
  return { land, piers: pierOut, parks, water, landmarks, rail, trolley, muniStops, bikeways, trees, transit };
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
