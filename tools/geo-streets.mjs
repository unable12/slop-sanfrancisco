// Part 2: streets & avenues from the CSCL centerline, in the world frame
import { cscl, segLines, toWorld, log } from './geo-base.mjs';

// Every CSCL roadway piece as world-frame line segments with attributes
const pieces = [];
for (const s of cscl) {
  if (!['1', '2', '3', '4', '9', '13'].includes(s.rw_type)) continue; // streets, highways, bridges, tunnels, ramps, U-turns
  const name = s.full_street_name || '';
  const w = parseFloat(s.streetwidth || '0') * 0.3048; // curb-to-curb roadway width (ft -> m)
  const lanes = parseInt(s.number_travel_lanes || '0', 10);
  for (const ln of segLines(s)) {
    const pts = ln.map(([lon, lat]) => toWorld(lon, lat));
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x0, z0] = pts[i];
      const [x1, z1] = pts[i + 1];
      const L = Math.hypot(x1 - x0, z1 - z0);
      if (L < 0.5) continue;
      // trafdir: FT = travel from the first point to the last, TF = the reverse, TW = both ways
      pieces.push({ name, rw: s.rw_type, w, lanes, dir: s.trafdir, x0, z0, x1, z1, L, level: s.from_level_code === s.to_level_code ? s.from_level_code : 'ramp' });
    }
  }
}
log(`${pieces.length} centerline pieces`);

const wmedian = (vals) => {
  vals = vals.filter((v) => Number.isFinite(v[0])).sort((a, b) => a[0] - b[0]);
  const tot = vals.reduce((t, v) => t + v[1], 0);
  let acc = 0;
  for (const [v, w] of vals) {
    acc += w;
    if (acc >= tot / 2) return v;
  }
  return NaN;
};
// Union of [a, b] intervals, joining gaps narrower than `join`
function unionIntervals(iv, join = 2) {
  iv = iv.map(([a, b]) => [Math.min(a, b), Math.max(a, b)]).sort((p, q) => p[0] - q[0]);
  const out = [];
  for (const [a, b] of iv) {
    if (out.length && a <= out[out.length - 1][1] + join) out[out.length - 1][1] = Math.max(out[out.length - 1][1], b);
    else out.push([a, b]);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Numbered cross streets (E/W n ST): z, x-runs with one-way direction and width
// ---------------------------------------------------------------------------------------------------------------------
const streetRe = /^(E|W)\s+(\d+)\s+ST$/;
const byNum = new Map();
for (const p of pieces) {
  const m = streetRe.exec(p.name);
  if (!m || p.rw !== '1') continue;
  if (Math.abs(p.z1 - p.z0) / p.L > 0.08) continue; // grid-aligned pieces only
  const n = +m[2];
  if (!byNum.has(n)) byNum.set(n, []);
  byNum.get(n).push(p);
}
const STREETS = [];
for (const [n, ps] of [...byNum].sort((a, b) => a[0] - b[0])) {
  const z = wmedian(ps.map((p) => [(p.z0 + p.z1) / 2, p.L]));
  const near = ps.filter((p) => Math.abs((p.z0 + p.z1) / 2 - z) < 12);
  // Direction of travel along x for each piece: +1 eastbound, -1 westbound, 0 both
  const runs = near.map((p) => {
    let d = 0;
    if (p.dir === 'FT') d = Math.sign(p.x1 - p.x0);
    else if (p.dir === 'TF') d = Math.sign(p.x0 - p.x1);
    return { a: Math.min(p.x0, p.x1), b: Math.max(p.x0, p.x1), d, w: p.w, L: p.L };
  });
  const iv = unionIntervals(runs.map((r) => [r.a, r.b]), 3);
  const segs = iv.map(([a, b]) => {
    const inside = runs.filter((r) => r.a >= a - 1 && r.b <= b + 1);
    const votes = { '-1': 0, '0': 0, '1': 0 };
    for (const r of inside) votes[r.d] += r.L;
    const d = +Object.entries(votes).sort((p, q) => q[1] - p[1])[0][0];
    const w = wmedian(inside.map((r) => [r.w, r.L]));
    return [Math.round(a * 10) / 10, Math.round(b * 10) / 10, d, Math.round(w * 10) / 10];
  });
  STREETS.push({ n, z: Math.round(z * 10) / 10, segs });
}
log(`${STREETS.length} numbered streets (1st..${STREETS[STREETS.length - 1].n}th)`);

// ---------------------------------------------------------------------------------------------------------------------
// Avenues: grid-aligned lines (x) carrying one or more CSCL names along z
// ---------------------------------------------------------------------------------------------------------------------
const AVENUE_LINES = [
  // id, CSCL names (north to south), display names
  ['riverside', ['RIVERSIDE DR'], 'Riverside Dr'],
  ['11', ['W  END AVE', '11 AVE'], '11th Ave / West End Ave'],
  ['10', ['AMSTERDAM AVE', '10 AVE'], '10th Ave / Amsterdam Ave'],
  ['9', ['COLUMBUS AVE', '9 AVE'], '9th Ave / Columbus Ave'],
  ['manhattan', ['MANHATTAN AVE'], 'Manhattan Ave'],
  ['8', ['FREDERICK DOUGLASS BLVD', 'CENTRAL PARK W', '8 AVE'], '8th Ave / Central Park West'],
  ['st_nicholas', ['ST NICHOLAS AVE'], 'St Nicholas Ave'],
  ['7', ['ADAM CLAYTON POWELL JR BLVD', '7 AVE'], '7th Ave / Adam Clayton Powell Jr Blvd'],
  ['6', ['LENOX AVE', 'MALCOLM X BLVD', 'AVE OF THE AMERICAS'], '6th Ave / Lenox Ave'],
  ['5', ['5 AVE'], '5th Ave'],
  ['madison', ['MADISON AVE'], 'Madison Ave'],
  ['park', ['PARK AVE', 'PARK AVE S'], 'Park Ave'],
  ['lex', ['LEXINGTON AVE'], 'Lexington Ave'],
  ['3', ['3 AVE'], '3rd Ave'],
  ['2', ['2 AVE'], '2nd Ave'],
  ['1', ['1 AVE'], '1st Ave'],
  ['york', ['YORK AVE', 'SUTTON PL', 'PLEASANT AVE', 'AVE A'], 'York Ave / Ave A'],
  ['eastend', ['E  END AVE', 'AVE B'], 'East End Ave / Ave B'],
  ['c', ['AVE C'], 'Ave C'],
  ['d', ['AVE D'], 'Ave D'],
  ['vanderbilt', ['VANDERBILT AVE'], 'Vanderbilt Ave'],
  ['university', ['UNIVERSITY PL'], 'University Pl'],
  ['irving', ['IRVING PL'], 'Irving Pl']
];
const AVENUES = [];
for (const [id, names, label] of AVENUE_LINES) {
  const ps = pieces.filter((p) => names.includes(p.name) && Math.abs(p.x1 - p.x0) / p.L < 0.08 && ['1', '2'].includes(p.rw));
  if (!ps.length) continue;
  const x = wmedian(ps.map((p) => [(p.x0 + p.x1) / 2, p.L]));
  const near = ps.filter((p) => Math.abs((p.x0 + p.x1) / 2 - x) < 25);
  const runs = near.map((p) => {
    let d = 0;
    if (p.dir === 'FT') d = Math.sign(p.z1 - p.z0);
    else if (p.dir === 'TF') d = Math.sign(p.z0 - p.z1);
    return { a: Math.min(p.z0, p.z1), b: Math.max(p.z0, p.z1), d, w: p.w, L: p.L, lanes: p.lanes, name: p.name };
  });
  const iv = unionIntervals(runs.map((r) => [r.a, r.b]), 40);
  const segs = iv.map(([a, b]) => {
    const inside = runs.filter((r) => r.a >= a - 1 && r.b <= b + 1);
    const votes = { '-1': 0, '0': 0, '1': 0 };
    for (const r of inside) votes[r.d] += r.L;
    const d = +Object.entries(votes).sort((p, q) => q[1] - p[1])[0][0];
    const w = wmedian(inside.map((r) => [r.w, r.L]));
    const lanes = wmedian(inside.map((r) => [r.lanes, r.L]));
    // name sections along z
    const secs = [];
    for (const r of inside.sort((p, q) => p.a - q.a)) {
      const last = secs[secs.length - 1];
      if (last && last[2] === r.name) last[1] = Math.max(last[1], r.b);
      else secs.push([r.a, r.b, r.name]);
    }
    return { z0: Math.round(a), z1: Math.round(b), dir: d, w: Math.round(w * 10) / 10, lanes, names: secs.map(([s0, s1, nm]) => [Math.round(s0), Math.round(s1), nm]) };
  }).filter((s) => s.z1 - s.z0 > 60);
  AVENUES.push({ id, label, x: Math.round(x * 10) / 10, segs });
}

export { pieces, STREETS, AVENUES, wmedian, unionIntervals };

if (process.argv[1] && process.argv[1].endsWith('geo-streets.mjs')) {
  for (const s of STREETS) {
    if (s.n % 1 === 0 && (s.n <= 20 || s.n % 5 === 0 || [42, 34, 23, 57, 59, 72, 79, 86, 96, 110, 116, 125].includes(s.n))) {
      console.log(`${String(s.n).padStart(3)} z=${String(s.z).padStart(8)}  ${s.segs.map(([a, b, d, w]) => `[${Math.round(a)}..${Math.round(b)} ${d > 0 ? 'E' : d < 0 ? 'W' : 'B'} ${w}m]`).join(' ')}`);
    }
  }
  for (const a of AVENUES) {
    console.log(`${a.id.padEnd(12)} x=${String(a.x).padStart(8)}  ${a.segs.map((s) => `[${s.z0}..${s.z1} ${s.dir > 0 ? 'S' : s.dir < 0 ? 'N' : 'B'} ${s.w}m ${s.lanes}L ${s.names.map((n) => n[2]).join('/')}]`).join(' ')}`);
  }
}
