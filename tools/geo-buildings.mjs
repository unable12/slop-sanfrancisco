// tools/geo-buildings.mjs — building footprints & heights from DataSF Building Footprints (ynuv-fyni): lidar zonal
// statistics on 50 cm cells per footprint. Per building: base = gnd_min_m (lowest bare-earth ground under it, NAVD88 m),
// roof = median_1st_m (median first-return elevation: the main roof, robust to antennas), peak = peak_1st_m.
// Per building also: its rectangle cover (tools/rect-cover.mjs: the oriented masses buildings.js builds; footprints the
// rectangles cover less than POLY_COVER of are drawn as their outline instead) and whether its land-use parcel (DataSF
// Land Use, ludb) has retail floor space (shop fronts).
// Output: data/buildings-<box>.bin (format: docs/formats.md, "sf-buildings").
import path from 'node:path';
import { datasf, worldPolygons, rdpRing, ringArea, boxWorld, log, ROOT, BOX } from './geo-base.mjs';
import { writeBin } from './geo-terrain.mjs';
import { rectCover } from './rect-cover.mjs';
import { roadCorridor } from './road-corridor.mjs';

const MIN_AREA = 6; // m^2
const MIN_HEIGHT = 2.5; // m above the base
const MARGIN = 60; // metres around the box
const POLY_COVER = 0.9; // below this rectangle coverage a footprint is drawn as its outline (P2.5)
const MAX_INTRUSION = 0.25; // metres a mass may reach into the road corridor (tools/road-corridor.mjs; the test allows 0.3 against
// the curb outlines as js/sf-geodata.js rounds them, to 0.1 m)

// Pulls the sides of a mass [cx, cz, w, d] (turned by theta) back out of the road corridor: the footprints and the 2016
// curbs disagree by a metre or two in places (PLAN.md P2-6). Returns the clipped rect, or null when under 1 m is left.
function clipToCorridor(rect, theta, roadDepth, stats) {
  let [cx, cz, w, d] = rect;
  const cs = Math.cos(theta), sn = Math.sin(theta);
  const world = (lx, lz) => [cx + lx * cs + lz * sn, cz - lx * sn + lz * cs];
  let clipped = false;
  for (let pass = 0; pass < 8; pass++) {
    let moved = false;
    for (const [ax, az] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const len = ax ? d : w;
      let p = 0;
      for (let t = -0.5; t <= 0.5001; t += 0.5 / Math.max(1, Math.ceil(len))) {
        const lx = ax ? (ax * w) / 2 : t * w, lz = az ? (az * d) / 2 : t * d;
        const depth = roadDepth(...world(lx, lz));
        if (Number.isFinite(depth)) p = Math.max(p, depth);
      }
      if (p <= MAX_INTRUSION) continue;
      const cut = p - MAX_INTRUSION + 0.1;
      // move this side in by `cut`: the size shrinks, the centre follows half way
      if (ax) { w -= cut; cx -= (ax * cut * cs) / 2; cz += (ax * cut * sn) / 2; } else { d -= cut; cx -= (az * cut * sn) / 2; cz -= (az * cut * cs) / 2; }
      moved = clipped = true;
      if (w < 1 || d < 1) { stats.dropped++; return null; }
    }
    if (!moved) break;
  }
  if (clipped) stats.clipped++;
  return [cx, cz, w, d];
}

// Land-use parcels with retail floor space, for a point-in-parcel test: [{ bbox, rings }]
function retailParcels(box) {
  const out = [];
  for (const f of datasf('landuse', box)) {
    if (!(Number(f.properties.retail) > 0)) continue;
    for (const rings of worldPolygons(f.geometry)) {
      const ring = rings[0];
      const xs = ring.map((p) => p[0]), zs = ring.map((p) => p[1]);
      out.push({ x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs), ring });
    }
  }
  return out;
}
const inRing = (ring, x, z) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[j];
    if ((az > z) !== (bz > z) && x < ((bx - ax) * (z - az)) / (bz - az) + ax) c = !c;
  }
  return c;
};

// blockRings: the curb islands' outlines [[x, z], ...] (tools/geo-curbs.mjs), which keep the masses off the roadway
export function buildBuildings(box = BOX, blockRings = []) {
  const B = boxWorld(box);
  const recs = [];
  const verts = [];
  const masses = [];
  const retail = retailParcels(box);
  const roadDepth = roadCorridor(blockRings);
  const stats = { in: 0, small: 0, low: 0, outside: 0, bad: 0, poly: 0, retail: 0, rects: 0, clipped: 0, dropped: 0 };
  for (const f of datasf('buildings', box)) {
    stats.in++;
    const p = f.properties;
    const base = Number(p.gnd_min_m), roof = Number(p.median_1st_m), peak = Number(p.peak_1st_m);
    if (![base, roof, peak].every(Number.isFinite)) { stats.bad++; continue; }
    for (const rings of worldPolygons(f.geometry)) {
      let ring = rdpRing(rings[0], 0.3);
      if (ring.length < 3) continue;
      const area = Math.abs(ringArea(ring));
      if (area < MIN_AREA) { stats.small++; continue; }
      if (roof - base < MIN_HEIGHT) { stats.low++; continue; }
      const cx = ring.reduce((s, r) => s + r[0], 0) / ring.length, cz = ring.reduce((s, r) => s + r[1], 0) / ring.length;
      if (cx < B.x0 - MARGIN || cx > B.x1 + MARGIN || cz < B.z0 - MARGIN || cz > B.z1 + MARGIN) { stats.outside++; continue; }
      if (ringArea(ring) > 0) ring = ring.slice().reverse();
      const cover = rectCover(ring);
      cover.rects = cover.rects.map((r) => clipToCorridor(r, cover.theta, roadDepth, stats)).filter(Boolean);
      const poly = cover.coverage < POLY_COVER || !cover.rects.length;
      const shops = retail.some((r) => cx >= r.x0 && cx <= r.x1 && cz >= r.z0 && cz <= r.z1 && inRing(r.ring, cx, cz));
      stats.poly += poly;
      stats.retail += shops;
      stats.rects += poly ? 0 : cover.rects.length;
      recs.push([base, roof, Math.max(peak, roof), verts.length / 2, ring.length, cover.theta, masses.length / 4, poly ? 0 : cover.rects.length, shops ? 1 : 0]);
      if (!poly) for (const r of cover.rects) masses.push(...r);
      for (const [x, z] of ring) verts.push(x, z);
    }
  }
  const table = recs.flat();
  const data = new Float32Array(table.length + verts.length + masses.length);
  data.set(table, 0);
  data.set(verts, table.length);
  data.set(masses, table.length + verts.length);
  const header = {
    format: 'sf-buildings', version: 2, box, count: recs.length,
    fields: ['base', 'roof', 'peak', 'ringStart', 'ringCount', 'theta', 'massStart', 'massCount', 'shops'],
    tableFloats: table.length, vertexFloats: verts.length, massFields: ['cx', 'cz', 'w', 'd'], massFloats: masses.length,
    datum: 'NAVD88 m', source: 'DataSF ynuv-fyni; shops: DataSF Land Use retail > 0'
  };
  writeBin(path.join(ROOT, `data/buildings-${box}.bin`), header, data);
  log(`buildings ${box}: ${recs.length} kept of ${stats.in} (small ${stats.small}, low ${stats.low}, outside ${stats.outside}, bad ${stats.bad}); ${stats.rects} masses, ${stats.poly} outlines (< ${POLY_COVER * 100}% covered), ${stats.clipped} masses clipped to the road corridor (${stats.dropped} dropped), ${stats.retail} with retail; ${(data.byteLength / 1e6).toFixed(2)} MB`);
  return header;
}

if (import.meta.url === `file://${process.argv[1]}`) buildBuildings(process.argv[2] || BOX);
