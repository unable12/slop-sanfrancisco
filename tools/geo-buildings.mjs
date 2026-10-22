// tools/geo-buildings.mjs — building footprints & heights from DataSF Building Footprints (ynuv-fyni): lidar zonal
// statistics on 50 cm cells per footprint. Per building: base = gnd_min_m (lowest bare-earth ground under it, NAVD88 m),
// roof = median_1st_m (median first return elevation: the main roof, robust to antennas), peak = peak_1st_m.
// Per building also: its rectangle cover (tools/rect-cover.mjs: the oriented masses buildings.js builds; footprints the
// rectangles cover less than POLY_COVER of are drawn as their outline instead), whether its land-use parcel (DataSF
// Land Use, ludb) has retail floor space (shop fronts), and its class (P4.1, rules in tools/building-rules.json): type,
// palette set, bay windows, garage, era, front width, row size, and for towers the Tall Building Inventory's storey
// height, storeys, facade material and tower/base plan ratio.
// Output: data/buildings-<box>.bin (format: docs/formats.md, "sf-buildings"), docs/reports/building-types-<box>.md and
// docs/review/p4/types.svg (footprints coloured by type).
import fs from 'node:fs';
import path from 'node:path';
import { datasf, worldPolygons, worldLines, rdpRing, ringArea, boxWorld, log, ROOT, BOX } from './geo-base.mjs';
import { readBin, writeBin } from './geo-terrain.mjs';
import { rectCover } from './rect-cover.mjs';
import { roadCorridor } from './road-corridor.mjs';

const RULES = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/building-rules.json'), 'utf8'));
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
  for (let pass = 0; pass < 32; pass++) {
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

// Land-use parcels (DataSF Land Use): by map block-lot (`mapblklot` lists every lot of a multi-parcel record) and for
// a point-in-parcel test: [{ bbox, ring, p }]
function landUse(box) {
  const byLot = new Map();
  const parcels = [];
  for (const f of datasf('landuse', box)) {
    const p = f.properties;
    for (const lot of String(p.mapblklot || '').split(',')) byLot.set(lot.trim().replace(/'/g, ''), p);
    for (const rings of worldPolygons(f.geometry)) {
      const ring = rings[0];
      const xs = ring.map((q) => q[0]), zs = ring.map((q) => q[1]);
      parcels.push({ x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs), ring, p });
    }
  }
  return { byLot, parcels };
}
const inRing = (ring, x, z) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[j];
    if ((az > z) !== (bz > z) && x < ((bx - ax) * (z - az)) / (bz - az) + ax) c = !c;
  }
  return c;
};

// ---------------------------------------------------------------------------------------------------------------------
// Classification (P4.1)
// ---------------------------------------------------------------------------------------------------------------------
const TYPES = RULES.types;
const T = Object.fromEntries(TYPES.map((t, i) => [t, i]));
const feetToM = (s) => {
  // Tall Building Inventory storey heights: 13' / 12'6" / 12.5 (feet) / 12'-6"
  const m = String(s ?? '').match(/^\s*(\d+(?:\.\d+)?)\s*'?\s*-?\s*(?:(\d+(?:\.\d+)?)\s*")?/);
  if (!m || s == null || s === 'null') return 0;
  const ft = Number(m[1]) + (m[2] ? Number(m[2]) / 12 : 0);
  return ft > 6 && ft < 30 ? ft * 0.3048 : 0;
};
const planArea = (s) => {
  const m = String(s ?? '').match(/^\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*$/i);
  return m ? Number(m[1]) * Number(m[2]) : 0;
};
function facadeCode(text) {
  const t = String(text ?? '').toLowerCase();
  let best = 0, at = Infinity;
  for (const [re, code] of RULES.facades.match) {
    const i = t.search(new RegExp(re));
    if (i >= 0 && i < at) { at = i; best = code; }
  }
  return best;
}
// Floor areas of a land-use record (square feet) and the dominant use; residential area is resunits x resUnitSqft
// (estimated: the dataset has no residential floor area)
function useMix(p) {
  if (!p) return { res: 0, units: 0, dominant: null, pdr: 0, retail: 0 };
  const n = (k) => Number(p[k]) || 0;
  const units = n('resunits');
  const mix = { res: units * RULES.resUnitSqft, cie: n('cie'), mips: n('mips'), retail: n('retail'), pdr: n('pdr'), visitor: n('visitor'), med: n('med') };
  let dominant = null, best = 0;
  for (const [k, v] of Object.entries(mix)) if (v > best) { best = v; dominant = k; }
  return { ...mix, units, dominant };
}
function matches(r, b) {
  if (r.minH != null && b.h < r.minH) return false;
  if (r.maxH != null && b.h >= r.maxH) return false;
  if (r.minArea != null && b.area < r.minArea) return false;
  if (r.minFront != null && b.frontW < r.minFront) return false;
  if (r.maxFront != null && b.frontW > r.maxFront) return false;
  if (r.minRow != null && b.row < r.minRow) return false;
  if (r.minUnits != null && b.use.units < r.minUnits) return false;
  if (r.maxUnits != null && b.use.units > r.maxUnits) return false;
  if (r.dominant && !r.dominant.includes(b.use.dominant)) return false;
  if (r.notDominant && r.notDominant.includes(b.use.dominant)) return false;
  if (r.pdr && !(b.use.pdr > 0)) return false;
  if (r.waterfront && !RULES.waterfrontNhoods.includes(b.nhood)) return false;
  if (r.inventoryMinStories != null && !(b.tall && b.tall.stories >= r.inventoryMinStories)) return false;
  return true;
}

// Per building: front width (the walls looking onto the road corridor within frontReach m, before another building,
// summed per facing direction: footprints break a front at its bay windows; the widest facing counts), the ground drop
// along that front (sidewalk ground 1 m out at its ends), row size (buildings joined by shared walls of sharedWallMin m
// or more), neighbourhood
function classify(blds, roadDepth, streets, landmarkRings, heightAt) {
  const CELL = 32;
  const grid = new Map();
  blds.forEach((b, i) => {
    for (let gx = Math.floor(b.x0 / CELL); gx <= Math.floor(b.x1 / CELL); gx++) {
      for (let gz = Math.floor(b.z0 / CELL); gz <= Math.floor(b.z1 / CELL); gz++) {
        const k = gx * 100000 + gz;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(i);
      }
    }
  });
  const buildingAt = (x, z, self) => {
    for (const j of grid.get(Math.floor(x / CELL) * 100000 + Math.floor(z / CELL)) || []) {
      if (j === self) continue;
      const o = blds[j];
      if (x >= o.x0 && x <= o.x1 && z >= o.z0 && z <= o.z1 && inRing(o.ring, x, z)) return j;
    }
    return -1;
  };
  // street midpoints by neighbourhood, for the nearest-street lookup
  const sgrid = new Map();
  const SC = 64;
  for (const s of streets) {
    const k = Math.floor(s.x / SC) * 100000 + Math.floor(s.z / SC);
    if (!sgrid.has(k)) sgrid.set(k, []);
    sgrid.get(k).push(s);
  }
  const nhoodAt = (x, z) => {
    let best = null, bd = Infinity;
    for (let r = 0; r <= 4 && !best; r++) {
      for (let gx = Math.floor(x / SC) - r; gx <= Math.floor(x / SC) + r; gx++) {
        for (let gz = Math.floor(z / SC) - r; gz <= Math.floor(z / SC) + r; gz++) {
          for (const s of sgrid.get(gx * 100000 + gz) || []) {
            const d = (s.x - x) ** 2 + (s.z - z) ** 2;
            if (d < bd) { bd = d; best = s; }
          }
        }
      }
    }
    return best ? (best.an === 'Chinatown' ? 'Chinatown' : best.nhood) : null;
  };
  const parent = blds.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  blds.forEach((b, i) => {
    const r = b.ring;
    const shared = new Map();
    const facing = new Map();
    let frontW = 0, fronts = 0;
    for (let k = 0; k < r.length; k++) {
      const [ax, az] = r[k], [bx, bz] = r[(k + 1) % r.length];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.5) continue;
      let nx = (bz - az) / L, nz = -(bx - ax) / L;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      if (inRing(r, mx + nx * 0.1, mz + nz * 0.1)) { nx = -nx; nz = -nz; }
      // shared wall: 1 m samples just outside the edge inside another footprint
      for (let t = 0.5; t < L; t += 1) {
        const j = buildingAt(ax + ((bx - ax) * t) / L + nx * RULES.partyGap, az + ((bz - az) * t) / L + nz * RULES.partyGap, i);
        if (j >= 0) shared.set(j, (shared.get(j) || 0) + 1);
      }
      // front: a sample at a quarter, half and three quarters marching out reaches the road before another building
      let front = false;
      for (const u of [0.25, 0.5, 0.75]) {
        for (let o = 1.5; o <= RULES.frontReach && !front; o += 1.5) {
          const x = ax + (bx - ax) * u + nx * o, z = az + (bz - az) * u + nz * o;
          if (buildingAt(x, z, i) >= 0) break;
          const d = roadDepth(x, z);
          if (d > 0 && Number.isFinite(d)) front = true;
        }
      }
      if (front) {
        fronts++;
        const bin = ((Math.round((Math.atan2(nz, nx) * 180) / Math.PI / 30) % 12) + 12) % 12; // 30 degree facing bins
        const f = facing.get(bin) || { L: 0, lo: Infinity, hi: -Infinity };
        for (const [px, pz] of [[ax, az], [bx, bz]]) {
          const g = heightAt(px + nx, pz + nz);
          f.lo = Math.min(f.lo, g);
          f.hi = Math.max(f.hi, g);
        }
        f.L += L;
        facing.set(bin, f);
      }
    }
    let best = null;
    for (const f of facing.values()) if (!best || f.L > best.L) best = f;
    frontW = best ? best.L : 0;
    b.frontDrop = best ? best.hi - best.lo : 0;
    for (const [j, m] of shared) if (m >= RULES.sharedWallMin) parent[find(i)] = find(j);
    b.frontW = frontW;
    b.fronts = fronts;
    b.nhood = nhoodAt(b.cx, b.cz);
    b.landmark = landmarkRings.some((lr) => b.cx >= lr.x0 && b.cx <= lr.x1 && b.cz >= lr.z0 && b.cz <= lr.z1 && inRing(lr.ring, b.cx, b.cz));
  });
  const rowSize = new Map();
  blds.forEach((_, i) => rowSize.set(find(i), (rowSize.get(find(i)) || 0) + 1));
  const civicRe = new RegExp(RULES.civicNames);
  for (const [i, b] of blds.entries()) {
    b.row = rowSize.get(find(i));
    let type = b.landmark ? T.landmark : -1;
    if (type < 0 && b.civicName && civicRe.test(b.civicName)) type = T.civic;
    for (const r of RULES.rules) if (type < 0 && matches(r, b)) { type = T[r.type]; b.rule = 'rule'; }
    for (const r of RULES.fallbacks) if (type < 0 && matches(r, b)) { type = T[r.type]; b.rule = 'fallback'; }
    b.type = type;
    b.palette = RULES.palettes.byNhood[b.nhood] ?? RULES.palettes.default;
    const t = TYPES[type];
    b.bays = t === 'rowhouse' ? Math.min(2, Math.floor(b.frontW / 3.5)) : t === 'flats' ? Math.min(2, Math.floor(b.frontW / 3.5)) : t === 'apartment' ? Math.min(4, Math.floor(b.frontW / 7)) : 0;
    b.garage = (t === 'rowhouse' || t === 'flats') && b.frontDrop > RULES.garageDrop ? 1 : 0;
    const year = Number(b.tall?.year);
    if (year > 1800) { b.era = RULES.eras.byYear.find(([y]) => year < y)[1]; b.eraSource = 'data'; }
    else { b.era = RULES.eras.byType[t] ?? 0; b.eraSource = b.era ? 'rule' : 'unknown'; }
  }
}

// Report and type map (docs/reports/building-types-<box>.md, docs/review/p4/types.svg)
const TYPE_COLOURS = ['#9a9a9a', '#e8789a', '#f2b05e', '#c9a227', '#5b8fd9', '#8a5a3c', '#5fb8a8', '#2a3f8f', '#9b59b6', '#e03030'];
function writeTypeReport(box, blds, joins) {
  const counts = TYPES.map((t, i) => [t, blds.filter((b) => b.type === i)]);
  const pct = (n, d) => `${((100 * n) / Math.max(1, d)).toFixed(1)}%`;
  const N = blds.length;
  const lines = [
    `# Building types: ${box}`, '',
    'Generated by `tools/geo-buildings.mjs` (P4.1) from DataSF Building Footprints, Land Use (joined by map block-lot) and the',
    'Tall Building Inventory; rules in `tools/building-rules.json`. Map: `docs/review/p4/types.svg`.', '',
    `Buildings: ${N}. Land use joined by block-lot ${joins.lot} (${pct(joins.lot, N)}), by point-in-parcel ${joins.point}, none ${joins.none}.`,
    `Tall Building Inventory: ${joins.tall} of ${joins.tallRecords} records joined to a footprint (${joins.tallByRing} by ring, ${joins.tallByLot} by lot; the tallest footprint of the lot).`,
    `Residential floor area is estimated as resunits x ${RULES.resUnitSqft} sq ft (not in the data).`, '',
    '| Type | Buildings | Share | By rule | By fallback | Median height (m) | Median front (m) |', '|---|---|---|---|---|---|---|'
  ];
  const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1].toFixed(1) : '-'; };
  for (const [t, bs] of counts) lines.push(`| ${t} | ${bs.length} | ${pct(bs.length, N)} | ${bs.filter((b) => b.rule === 'rule').length} | ${bs.filter((b) => b.rule === 'fallback').length} | ${med(bs.map((b) => b.h))} | ${med(bs.map((b) => b.frontW))} |`);
  lines.push('', '| Palette set | Buildings |', '|---|---|');
  RULES.palettes.names.forEach((n, i) => lines.push(`| ${n} | ${blds.filter((b) => b.palette === i).length} |`));
  lines.push('', '| Era | From data (inventory completion date) | By type rule |', '|---|---|---|');
  RULES.eras.names.forEach((n, i) => lines.push(`| ${n} | ${blds.filter((b) => b.era === i && b.eraSource === 'data').length} | ${blds.filter((b) => b.era === i && b.eraSource !== 'data').length} |`));
  const rh = blds.filter((b) => TYPES[b.type] === 'rowhouse' || TYPES[b.type] === 'flats');
  lines.push('', `Row houses and flats: ${rh.length}; with bay windows ${rh.filter((b) => b.bays > 0).length}; with a garage (ground drop along the front > ${RULES.garageDrop} m) ${rh.filter((b) => b.garage).length}.`);
  lines.push(`Buildings with no front within ${RULES.frontReach} m of the road: ${blds.filter((b) => !b.fronts).length} (${pct(blds.filter((b) => !b.fronts).length, N)}).`);
  lines.push(`Retail ground floors (land use retail > 0): ${blds.filter((b) => b.shops).length}.`);
  fs.writeFileSync(path.join(ROOT, `docs/reports/building-types-${box}.md`), `${lines.join('\n')}\n`);

  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const b of blds) { x0 = Math.min(x0, b.x0); x1 = Math.max(x1, b.x1); z0 = Math.min(z0, b.z0); z1 = Math.max(z1, b.z1); }
  const S = 0.25; // px per metre
  const W = Math.ceil((x1 - x0) * S), H = Math.ceil((z1 - z0) * S);
  const paths = TYPES.map(() => []);
  for (const b of blds) {
    const ring = rdpRing(b.ring, 1.5);
    if (ring.length < 3) continue;
    paths[b.type].push(`M${ring.map(([x, z]) => `${Math.round((x - x0) * S * 2) / 2} ${Math.round((z - z0) * S * 2) / 2}`).join('L')}Z`);
  }
  const legend = TYPES.map((t, i) => `<rect x="10" y="${10 + i * 18}" width="12" height="12" fill="${TYPE_COLOURS[i]}"/><text x="28" y="${20 + i * 18}">${t} (${counts[i][1].length})</text>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="sans-serif" font-size="12"><rect width="${W}" height="${H}" fill="#f4f1ea"/>${paths.map((p, i) => `<path fill="${TYPE_COLOURS[i]}" d="${p.join('')}"/>`).join('')}<rect x="4" y="4" width="150" height="${TYPES.length * 18 + 10}" fill="#fff" opacity="0.85"/>${legend}</svg>\n`;
  fs.mkdirSync(path.join(ROOT, 'docs/review/p4'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'docs/review/p4/types.svg'), svg);
  return counts.map(([t, bs]) => `${t} ${bs.length}`).join(', ');
}

// blockRings: the curb islands' outlines [[x, z], ...] (tools/geo-curbs.mjs), which keep the masses off the roadway;
// landmarks: GEO.landmarks as tools/geo-extra.mjs builds them (the P5 list in building-rules.json becomes `landmark`)
export function buildBuildings(box = BOX, blockRings = [], landmarks = {}) {
  const B = boxWorld(box);
  const verts = [];
  const masses = [];
  const lu = landUse(box);
  const roadDepth = roadCorridor(blockRings);
  const stats = { in: 0, small: 0, low: 0, outside: 0, bad: 0, poly: 0, retail: 0, rects: 0, clipped: 0, dropped: 0 };
  const joins = { lot: 0, point: 0, none: 0, tall: 0, tallByRing: 0, tallByLot: 0, tallRecords: 0 };
  const blds = [];
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
      const lot = String(p.mblr || '').replace(/^SF/, '');
      let use = lu.byLot.get(lot);
      if (use) joins.lot++;
      else {
        use = lu.parcels.find((r) => cx >= r.x0 && cx <= r.x1 && cz >= r.z0 && cz <= r.z1 && inRing(r.ring, cx, cz))?.p;
        joins[use ? 'point' : 'none']++;
      }
      const mix = useMix(use);
      const shops = mix.retail > 0;
      stats.poly += poly;
      stats.retail += shops;
      stats.rects += poly ? 0 : cover.rects.length;
      const xs = ring.map((q) => q[0]), zs = ring.map((q) => q[1]);
      blds.push({
        rec: [base, roof, Math.max(peak, roof), verts.length / 2, ring.length, cover.theta, masses.length / 4, poly ? 0 : cover.rects.length, shops ? 1 : 0],
        ring, cx, cz, x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs), lot, use: mix, shops,
        h: roof - base, area, tall: null
      });
      if (!poly) for (const r of cover.rects) masses.push(...r);
      for (const [x, z] of ring) verts.push(x, z);
    }
  }
  // Tall Building Inventory: the footprint containing the record's centroid, else the tallest footprint of its lot
  const byLot = new Map();
  for (const b of blds) if (!byLot.has(b.lot) || byLot.get(b.lot).h < b.h) byLot.set(b.lot, b);
  for (const f of datasf('tall-buildings', box)) {
    joins.tallRecords++;
    const p = f.properties;
    const ring = worldPolygons(f.geometry)[0]?.[0];
    if (!ring) continue;
    const cx = ring.reduce((s, r) => s + r[0], 0) / ring.length, cz = ring.reduce((s, r) => s + r[1], 0) / ring.length;
    let b = blds.find((o) => cx >= o.x0 && cx <= o.x1 && cz >= o.z0 && cz <= o.z1 && inRing(o.ring, cx, cz));
    if (b) joins.tallByRing++;
    else if ((b = byLot.get(String(p.mapblocklot)))) joins.tallByLot++;
    if (!b || b.tall) continue;
    joins.tall++;
    const base = planArea(p.base_plan_size), tower = planArea(p.tower_plan_size);
    b.tall = {
      name: p.name, stories: Number(p.stories_above_grade) || 0, storeyH: feetToM(p.typ_story_height), facade: facadeCode(p.facade_material),
      podium: base > 0 && tower > 0 ? Math.min(1, tower / base) : 0, year: String(p.completion_date ?? '').match(/\d{4}/)?.[0]
    };
  }
  // civic names: an OSM landmark footprint containing the building's centroid
  const lmRings = [];
  const civic = [];
  for (const [name, l] of Object.entries(landmarks)) {
    if (!l.ring || l.ring.length < 3) continue;
    const xs = l.ring.map((q) => q[0]), zs = l.ring.map((q) => q[1]);
    const r = { name, ring: l.ring, x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
    if (RULES.landmarks.includes(name)) lmRings.push(r);
    civic.push(r);
  }
  for (const b of blds) b.civicName = civic.find((r) => b.cx >= r.x0 && b.cx <= r.x1 && b.cz >= r.z0 && b.cz <= r.z1 && inRing(r.ring, b.cx, b.cz))?.name;
  const streets = [];
  for (const f of datasf('streets', box)) {
    const line = worldLines(f.geometry)[0];
    if (!line?.length) continue;
    const [x, z] = line[line.length >> 1];
    streets.push({ x, z, nhood: f.properties.nhood, an: f.properties.analysis_neighborhood });
  }
  const { header: TH, payload } = readBin(path.join(ROOT, `data/terrain-${box}.bin`));
  const q = new Uint16Array(payload.buffer, payload.byteOffset, TH.w * TH.h);
  const height = (i, j) => TH.minH + q[j * TH.w + i] * TH.scale;
  const heightAt = (x, z) => {
    const fi = Math.min(TH.w - 1.001, Math.max(0, (x - TH.originX) / TH.cell));
    const fj = Math.min(TH.h - 1.001, Math.max(0, (z - TH.originZ) / TH.cell));
    const i = Math.floor(fi), j = Math.floor(fj), tx = fi - i, tz = fj - j;
    const a = height(i, j) + (height(i + 1, j) - height(i, j)) * tx;
    const c = height(i, j + 1) + (height(i + 1, j + 1) - height(i, j + 1)) * tx;
    return a + (c - a) * tz;
  };
  classify(blds, roadDepth, streets, lmRings, heightAt);
  const recs = blds.map((b) => [...b.rec, b.type, b.palette, b.bays, b.garage, b.era, Math.round(b.frontW * 10) / 10, Math.min(b.row, 9999),
    Math.round((b.tall?.storeyH || 0) * 100) / 100, b.tall?.stories || 0, b.tall?.facade || 0, Math.round((b.tall?.podium || 0) * 1000) / 1000]);
  const table = recs.flat();
  const data = new Float32Array(table.length + verts.length + masses.length);
  data.set(table, 0);
  data.set(verts, table.length);
  data.set(masses, table.length + verts.length);
  const header = {
    format: 'sf-buildings', version: 3, box, count: recs.length,
    fields: ['base', 'roof', 'peak', 'ringStart', 'ringCount', 'theta', 'massStart', 'massCount', 'shops',
      'type', 'palette', 'bays', 'garage', 'era', 'frontW', 'row', 'storeyH', 'stories', 'facade', 'podium'],
    types: TYPES, palettes: RULES.palettes.names, eras: RULES.eras.names, facades: RULES.facades.names,
    tableFloats: table.length, vertexFloats: verts.length, massFields: ['cx', 'cz', 'w', 'd'], massFloats: masses.length,
    datum: 'NAVD88 m',
    source: 'DataSF ynuv-fyni; shops & use mix: DataSF Land Use (by block-lot, else point in parcel); towers: DataSF Tall Building Inventory; classes: tools/building-rules.json'
  };
  writeBin(path.join(ROOT, `data/buildings-${box}.bin`), header, data);
  const typeLine = writeTypeReport(box, blds, joins);
  log(`buildings ${box}: ${recs.length} kept of ${stats.in} (small ${stats.small}, low ${stats.low}, outside ${stats.outside}, bad ${stats.bad}); ${stats.rects} masses, ${stats.poly} outlines (< ${POLY_COVER * 100}% covered), ${stats.clipped} masses clipped to the road corridor (${stats.dropped} dropped), ${stats.retail} with retail; ${(data.byteLength / 1e6).toFixed(2)} MB`);
  log(`buildings ${box}: types ${typeLine}`);
  return header;
}

if (import.meta.url === `file://${process.argv[1]}`) buildBuildings(process.argv[2] || BOX);
