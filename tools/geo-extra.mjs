// Part 4: parks (NYC Parks properties) onto the blocks, piers (OSM), East River bridges (CSCL), New Jersey (OSM
// coastline), harbour islands, Upper Manhattan split
import { geo, toWorld, rdp, rdpRing, ringArea, bbox, load, log, centroid } from './geo-base.mjs';
import { pieces } from './geo-streets.mjs';
import { blocks, blockRaster as R, blockLabels as lab, CUT_Z } from './geo-blocks.mjs';

// ---------------------------------------------------------------------------------------------------------------------
// Parks
// ---------------------------------------------------------------------------------------------------------------------
const parksRaw = load('nycparks_manhattan.json');
const parks = [];
for (const p of parksRaw) {
  const g = p.multipolygon;
  if (!g || !g.coordinates) continue;
  const rings = g.coordinates.map((poly) => poly[0].map(([lon, lat]) => toWorld(lon, lat)));
  const acres = parseFloat(p.acres || '0');
  parks.push({ name: p.signname || p.name311 || '', cat: p.typecategory || '', acres, rings });
}
// Coverage of every block by park land: scanline-fill each park ring over the block raster
const W = R.w, H = R.h;
const parkCells = new Float64Array(blocks.length + 1);
// blocks don't carry their raster label: recover it from a point inside each block's lot rect or polygon
for (const b of blocks) {
  const r = b.rects[0];
  const [cx, cz] = r ? [(r[0] + r[1]) / 2, (r[2] + r[3]) / 2] : centroid(b.poly);
  const i = Math.floor((cx - R.x0) / R.res), j = Math.floor((cz - R.z0) / R.res);
  b._lab = i >= 0 && j >= 0 && i < W && j < H ? lab[j * W + i] : 0;
}
const byLab = new Map(blocks.map((b) => [b._lab, b]));
const parkOf = new Map(); // block -> { name, cells }
for (const pk of parks) {
  if (pk.acres < 0.25) continue;
  for (const ring of pk.rings) {
    const bb = bbox(ring);
    const j0 = Math.max(0, Math.floor((bb.z0 - R.z0) / R.res)), j1 = Math.min(H - 1, Math.ceil((bb.z1 - R.z0) / R.res));
    const counts = new Map();
    const xs = [];
    for (let j = j0; j <= j1; j++) {
      const z = R.z0 + (j + 0.5) * R.res;
      xs.length = 0;
      for (let a = 0, k = ring.length - 1; a < ring.length; k = a++) {
        const [xa, za] = ring[k], [xb, zb] = ring[a];
        if ((za > z) !== (zb > z)) xs.push(xa + ((z - za) * (xb - xa)) / (zb - za));
      }
      xs.sort((p, q) => p - q);
      for (let n = 0; n + 1 < xs.length; n += 2) {
        const i0 = Math.max(0, Math.ceil((xs[n] - R.x0) / R.res - 0.5)), i1 = Math.min(W - 1, Math.floor((xs[n + 1] - R.x0) / R.res - 0.5));
        for (let i = i0; i <= i1; i++) {
          const L = lab[j * W + i];
          if (L) counts.set(L, (counts.get(L) || 0) + 1);
        }
      }
    }
    for (const [L, n] of counts) {
      const b = byLab.get(L);
      if (!b) continue;
      b.parkCells = (b.parkCells || 0) + n;
      const prev = parkOf.get(b);
      if (!prev || n > prev.cells) parkOf.set(b, { name: pk.name, cells: n });
    }
  }
}
for (const b of blocks) {
  b.park = b.parkCells ? Math.min(1, Math.round((b.parkCells / b.area) * 100) / 100) : 0;
  const po = parkOf.get(b);
  if (po && b.park > 0.25) b.parkName = po.name;
  delete b.parkCells;
}
// Hudson River Park (a state / city trust, not a NYC Parks property): the land between Route 9A (12th Ave / West St)
// and the Hudson from 59th St down to Chambers St (Battery Park City below is built up)
{
  const r9a = pieces.filter((p) => /^(WEST ST|12 AVE|11 AVE|JOE DIMAGGIO HWY)$/.test(p.name) && ['1', '2'].includes(p.rw) && p.level === '13');
  const x9A = (z) => {
    let best = null;
    for (const p of r9a) {
      const lo = Math.min(p.z0, p.z1), hi = Math.max(p.z0, p.z1);
      if (z < lo - 1 || z > hi + 1) continue;
      const t = hi > lo ? (z - p.z0) / (p.z1 - p.z0) : 0.5;
      const x = p.x0 + t * (p.x1 - p.x0);
      if (best === null || x < best) best = x; // the westernmost carriageway
    }
    return best;
  };
  let n = 0;
  for (const b of blocks) {
    const [cx, cz] = centroid(b.poly);
    if (cz < -1370 || cz > 4840) continue;
    const x = x9A(cz);
    if (x === null || cx > x - 6) continue;
    b.park = 1;
    b.parkName = b.parkName || 'Hudson River Park';
    n++;
  }
  log(`Hudson River Park: ${n} blocks west of Route 9A`);
}
log(`blocks in parks (>60%): ${blocks.filter((b) => b.park > 0.6).length}; named parks used: ${new Set(blocks.filter((b) => b.park > 0.6).map((b) => b.parkName)).size}`);

// Park outlines worth drawing on their own (the city-grid park builder & the maps), south of the cut
const PARK_KEEP = parks.filter((p) => p.acres >= 0.6 && p.rings.some((r) => centroid(r)[1] > CUT_Z - 200) && !/Mall|Strip|Triangle|Greenstreet/i.test(p.cat));
const parkShapes = PARK_KEEP.map((p) => ({
  name: p.name, cat: p.cat, acres: Math.round(p.acres * 10) / 10,
  rings: p.rings.filter((r) => Math.abs(ringArea(r)) > 300).map((r) => { const s = rdpRing(r, 0.8); if (ringArea(s) > 0) s.reverse(); return s; })
})).filter((p) => p.rings.length);
log(`${parkShapes.length} park outlines kept`);

// ---------------------------------------------------------------------------------------------------------------------
// Piers: OSM pier polygons off Manhattan's bulkhead (outside the island, touching or near it)
// ---------------------------------------------------------------------------------------------------------------------
function orientedBox(ring) {
  // minimum-area rectangle over the hull edges' directions
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
const mnRing = geo.manhattan;
function distToRing(x, z, ring) {
  let d = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xa, za] = ring[j], [xb, zb] = ring[i];
    const dx = xb - xa, dz = zb - za, L2 = dx * dx + dz * dz || 1e-9;
    let t = ((x - xa) * dx + (z - za) * dz) / L2;
    t = Math.max(0, Math.min(1, t));
    d = Math.min(d, Math.hypot(xa + t * dx - x, za + t * dz - z));
  }
  return d;
}
const piers = [];
for (const p of geo.pierPolys) {
  const area = Math.abs(ringArea(p.ring));
  if (area < 150) continue;
  const ob = orientedBox(p.ring);
  if (ob.cz < CUT_Z - 3000 || ob.cz > 7000) continue;
  // the pier's root (the end nearest the bulkhead) must be close to Manhattan's shore
  const ex = Math.cos(ob.ang) * ob.len / 2, ez = Math.sin(ob.ang) * ob.len / 2;
  const dA = distToRing(ob.cx + ex, ob.cz + ez, mnRing), dB = distToRing(ob.cx - ex, ob.cz - ez, mnRing);
  if (Math.min(dA, dB) > 25) continue;
  const ring = rdpRing(p.ring, 0.6);
  if (ringArea(ring) > 0) ring.reverse();
  piers.push({ name: p.name, ...ob, area: Math.round(area), ring });
}
// merge duplicate outlines of the same named pier (keep the largest)
piers.sort((a, b) => b.area - a.area);
const pierOut = [];
for (const p of piers) {
  if (pierOut.some((q) => Math.hypot(q.cx - p.cx, q.cz - p.cz) < 12)) continue;
  pierOut.push(p);
}
log(`${pierOut.length} Manhattan piers (${pierOut.filter((p) => p.name).length} named)`);

// ---------------------------------------------------------------------------------------------------------------------
// East River bridges: deck centrelines from CSCL (Manhattan half), extended across to the far shore
// ---------------------------------------------------------------------------------------------------------------------
const BRIDGE_NAMES = { queensboro: 'ED KOCH QUEENSBORO BRG', williamsburg: 'WILLIAMSBURG BRG', manhattan: 'MANHATTAN BRG', brooklyn: 'BROOKLYN BRG' };
const bridges = {};
for (const [id, nm] of Object.entries(BRIDGE_NAMES)) {
  const ps = pieces.filter((p) => p.name === nm);
  if (!ps.length) continue;
  // principal direction & extent of the deck pieces
  let sx = 0, sz = 0, n = 0;
  for (const p of ps) { sx += p.x0 + p.x1; sz += p.z0 + p.z1; n += 2; }
  const mx = sx / n, mz = sz / n;
  let cxx = 0, czz = 0, cxz = 0;
  for (const p of ps) for (const [x, z] of [[p.x0, p.z0], [p.x1, p.z1]]) { cxx += (x - mx) ** 2; czz += (z - mz) ** 2; cxz += (x - mx) * (z - mz); }
  const ang = 0.5 * Math.atan2(2 * cxz, cxx - czz);
  let ux = Math.cos(ang), uz = Math.sin(ang);
  if (ux < 0) { ux = -ux; uz = -uz; } // pointing east (towards Queens / Brooklyn)
  let t0 = Infinity, t1 = -Infinity;
  for (const p of ps) for (const [x, z] of [[p.x0, p.z0], [p.x1, p.z1]]) { const t = (x - mx) * ux + (z - mz) * uz; t0 = Math.min(t0, t); t1 = Math.max(t1, t); }
  bridges[id] = { mx, mz, ux, uz, t0, t1, a: [mx + ux * t0, mz + uz * t0], mid: [mx + ux * t1, mz + uz * t1] };
}
log(`bridges: ${Object.entries(bridges).map(([k, b]) => `${k} a=(${b.a.map(Math.round)}) borough line=(${b.mid.map(Math.round)}) dir=${(Math.atan2(b.uz, b.ux) * 180 / Math.PI).toFixed(1)}°`).join('; ')}`);

// ---------------------------------------------------------------------------------------------------------------------
// New Jersey: the mainland coastline chain from the Arthur Kill up the Hudson, closed far to the west
// ---------------------------------------------------------------------------------------------------------------------
const main = geo.coastChains[0];
let cut = main.length;
for (let i = 0; i < main.length; i++) if (main[i][0] > -3000 && main[i][1] < -13000) { cut = i; break; }
let njLine = main.slice(0, cut);
njLine = rdp(njLine, 6);
const FAR = 60000;
const njStart = njLine[0], njEnd = njLine[njLine.length - 1];
const nj = [...njLine, [njEnd[0], -FAR], [-FAR, -FAR], [-FAR, FAR], [njStart[0], FAR]];
if (ringArea(nj) > 0) nj.reverse();
log(`New Jersey: ${nj.length} pts (coast from (${njStart.map(Math.round)}) to (${njEnd.map(Math.round)}))`);

// Ellis Island & U Thant Island from the OSM coastline (Ellis is mostly New Jersey's, so not in the DCP set)
const closedChains = geo.coastChains.filter((c) => c.length > 8 && Math.hypot(c[0][0] - c[c.length - 1][0], c[0][1] - c[c.length - 1][1]) < 1);
const chainNear = (x, z) => closedChains.find((c) => { const b = bbox(c); return x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1; });
const ellis = chainNear(-1460, 7780);
const islands = { ...geo.islands };
if (ellis) { islands.ellis = rdpRing(ellis.slice(0, -1), 1.2); if (ringArea(islands.ellis) > 0) islands.ellis.reverse(); }

// ---------------------------------------------------------------------------------------------------------------------
// Manhattan split at CUT_Z: the detailed island (south) and Upper Manhattan (north)
// ---------------------------------------------------------------------------------------------------------------------
function clipRingZ(ring, zc, keepSouth) {
  const out = [];
  const inside = (p) => (keepSouth ? p[1] >= zc : p[1] <= zc);
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const ia = inside(a), ib = inside(b);
    if (ia) out.push(a);
    if (ia !== ib) {
      const t = (zc - a[1]) / (b[1] - a[1]);
      out.push([a[0] + t * (b[0] - a[0]), zc]);
    }
  }
  return out;
}
const manhattanSouth = clipRingZ(geo.manhattan, CUT_Z, true);
const manhattanNorth = clipRingZ(geo.manhattan, CUT_Z, false);
log(`Manhattan split at z=${CUT_Z}: detailed ${manhattanSouth.length} pts, upper ${manhattanNorth.length} pts`);

export { parks, parkShapes, pierOut as piers, bridges, nj, islands, manhattanSouth, manhattanNorth };
