// tools/geo-buildings.mjs — building footprints & heights from DataSF Building Footprints (ynuv-fyni): lidar zonal
// statistics on 50 cm cells per footprint. Per building: base = gnd_min_m (lowest bare-earth ground under it, NAVD88 m),
// roof = median_1st_m (median first-return elevation: the main roof, robust to antennas), peak = peak_1st_m.
// Output: data/buildings-<box>.bin (format: docs/formats.md, "sf-buildings").
import path from 'node:path';
import { datasf, worldPolygons, rdpRing, ringArea, boxWorld, log, ROOT, BOX } from './geo-base.mjs';
import { writeBin } from './geo-terrain.mjs';

const MIN_AREA = 6; // m^2
const MIN_HEIGHT = 2.5; // m above the base
const MARGIN = 60; // metres around the box

export function buildBuildings(box = BOX) {
  const B = boxWorld(box);
  const recs = [];
  const verts = [];
  const stats = { in: 0, small: 0, low: 0, outside: 0, bad: 0 };
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
      recs.push([base, roof, Math.max(peak, roof), verts.length / 2, ring.length]);
      for (const [x, z] of ring) verts.push(x, z);
    }
  }
  const table = recs.flat();
  const data = new Float32Array(table.length + verts.length);
  data.set(table, 0);
  data.set(verts, table.length);
  const header = { format: 'sf-buildings', version: 1, box, count: recs.length, fields: ['base', 'roof', 'peak', 'ringStart', 'ringCount'], tableFloats: table.length, vertexFloats: verts.length, datum: 'NAVD88 m', source: 'DataSF ynuv-fyni' };
  writeBin(path.join(ROOT, `data/buildings-${box}.bin`), header, data);
  log(`buildings ${box}: ${recs.length} kept of ${stats.in} (small ${stats.small}, low ${stats.low}, outside ${stats.outside}, bad ${stats.bad}); ${(data.byteLength / 1e6).toFixed(2)} MB`);
  return header;
}

if (import.meta.url === `file://${process.argv[1]}`) buildBuildings(process.argv[2] || BOX);
