// tools/geo-roadgraph.mjs — the street centreline as a graph (DataSF Streets 3psu-pn9h): nodes are the centreline
// network's intersection CNNs, links its segments, with
//   - curb-to-curb width measured from the curb islands (rays from the centreline to the nearest block on each side),
//   - sidewalk widths (DataSF Sidewalk Widths 4g86-grxu), lanes (OSM `lanes`, else from the width),
//   - direction of travel (oneway F: along the segment's geometry, T: against it, B: both; checked against OSM),
//   - flags (freeway, tunnel, ramp, pedestrian-only, private) and intersection control from DataSF Traffic Signals
//     (ybh5-27n2) and Stop Signs (4542-gpa3).
// Output (GEO.roadGraph), compatible with road-network.js centrelineStreets():
//   nodes: [x, z, ...]   names: [...]   links: [a, b, nameIdx, width, lanes, dir, inner [x, z, ...], flags, swLeft, swRight]
//   control: per node 0 none, 1 signal, 2 all-way stop, 3 stop on some approaches;  stopMask: per node, bit i set when
//   the node's i-th incident link (in links order) has a stop sign facing traffic arriving on it
import fs from 'node:fs';
import path from 'node:path';
import { datasf, osm, worldLines, rdp, log, ROOT, BOX, toWorld, boxWorld } from './geo-base.mjs';
import { buildCurbIslands } from './geo-curbs.mjs';

export const FLAGS = { freeway: 1, tunnel: 2, ramp: 4, pedestrian: 8, private: 16, alley: 32 };
const FT = 0.3048;

export function buildRoadGraph(box = BOX, curbs = buildCurbIslands(box)) {
  const { x0: rx0, z0: rz0, W, H, RES, lab } = curbs.raster;
  const blockAt = (x, z) => {
    const i = Math.floor((x - rx0) / RES), j = Math.floor((z - rz0) / RES);
    return i >= 0 && j >= 0 && i < W && j < H && lab[j * W + i] > 0;
  };
  // distance along (dx, dz) from (x, z) to the first curb island cell, up to `max`
  const rayToCurb = (x, z, dx, dz, max = 30) => {
    for (let s = 0; s <= max; s += 0.25) if (blockAt(x + dx * s, z + dz * s)) return s;
    return null;
  };

  const sidewalkByCnn = new Map();
  for (const f of datasf('sidewalks', box)) {
    const p = f.properties;
    const ftv = Number(p.sidewalk_f);
    if (!(ftv > 0)) continue;
    const e = sidewalkByCnn.get(p.cnn) || {};
    e[p.side || 'Both'] = ftv * FT;
    sidewalkByCnn.set(p.cnn, e);
  }
  const signalNodes = new Set(datasf('signals', box).filter((f) => f.properties.type === 'SIGNAL').map((f) => String(Number(f.properties.cnn))));
  const stopsByNode = new Map();
  for (const f of datasf('stops', box)) {
    const p = f.properties;
    if (!p.cnn || !p.st_facing) continue;
    const k = String(Number(p.cnn));
    if (!stopsByNode.has(k)) stopsByNode.set(k, new Set());
    stopsByNode.get(k).add(p.st_facing);
  }

  // OSM ways by normalised name, for lanes and the one-way check
  const norm = (s) => String(s || '').toUpperCase().replace(/\bSTREET\b/, 'ST').replace(/\bAVENUE\b/, 'AVE').replace(/\bPLACE\b/, 'PL').replace(/\bBOULEVARD\b/, 'BLVD').replace(/\bDRIVE\b/, 'DR').replace(/\bALLEY\b/, 'ALY').replace(/\bTERRACE\b/, 'TER').replace(/\bLANE\b/, 'LN').replace(/\bCOURT\b/, 'CT').replace(/\bTHE\s+/, '').replace(/[^A-Z0-9 ]/g, '').trim();
  const osmWays = new Map();
  for (const e of osm('roads-tags', box)) {
    if (e.type !== 'way' || !e.geometry || !e.tags?.name) continue;
    const k = norm(e.tags.name);
    if (!osmWays.has(k)) osmWays.set(k, []);
    osmWays.get(k).push({ tags: e.tags, pts: e.geometry.map((g) => toWorld(g.lon, g.lat)) });
  }
  const segDist = (p, a, b) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz || 1e-9;
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L;
    t = Math.max(0, Math.min(1, t));
    return { d: Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz), dx: dx / Math.sqrt(L), dz: dz / Math.sqrt(L) };
  };
  const nearestOsm = (name, p) => {
    let best = null;
    for (const w of osmWays.get(norm(name)) || []) {
      for (let i = 0; i + 1 < w.pts.length; i++) {
        const r = segDist(p, w.pts[i], w.pts[i + 1]);
        if (r.d < 15 && (!best || r.d < best.d)) best = { ...r, tags: w.tags };
      }
    }
    return best;
  };

  // --- nodes & links ----------------------------------------------------------------------------------------------------
  const nodeIdx = new Map(); // cnn -> index
  const nodeSum = [];
  const nodeOf = (cnn, p) => {
    if (!nodeIdx.has(cnn)) { nodeIdx.set(cnn, nodeSum.length); nodeSum.push({ x: 0, z: 0, n: 0, cnn }); }
    const s = nodeSum[nodeIdx.get(cnn)];
    s.x += p[0]; s.z += p[1]; s.n++;
    return nodeIdx.get(cnn);
  };
  const names = [];
  const nameIdx = new Map();
  const nameOf = (n) => { if (!nameIdx.has(n)) { nameIdx.set(n, names.length); names.push(n); } return nameIdx.get(n); };
  const links = [];
  const stats = { links: 0, skipped: 0, widthFallback: 0, lanesOsm: 0, oneWayChecked: 0, oneWayAgree: 0, oneWayDisagree: [] };
  for (const f of datasf('streets', box)) {
    const p = f.properties;
    if (/^(PAPER|PSEUDO|UPROW)/.test(p.layer) || !p.f_node_cnn || !p.t_node_cnn) { stats.skipped++; continue; }
    const parts = worldLines(f.geometry);
    const pts = parts.flat();
    if (pts.length < 2) { stats.skipped++; continue; }
    const name = p.streetname || '';
    const cls = String(p.classcode);
    let flags = 0;
    if (cls === '1' || p.layer === 'FREEWAYS') flags |= FLAGS.freeway;
    if (/\bTUNL\b|TUNNEL/.test(name)) flags |= FLAGS.tunnel;
    if (/\bRAMP\b/.test(name)) flags |= FLAGS.ramp;
    if (p.layer === 'STREETS_PEDESTRI') flags |= FLAGS.pedestrian;
    if (/^PRIVATE/.test(p.layer)) flags |= FLAGS.private;
    const a = nodeOf(String(Number(p.f_node_cnn)), pts[0]);
    const b = nodeOf(String(Number(p.t_node_cnn)), pts[pts.length - 1]);
    if (a === b) { stats.skipped++; continue; }
    const dir = p.oneway === 'F' ? 1 : p.oneway === 'T' ? -1 : 0;

    // width: rays both ways at 1/4, 1/2, 3/4 of the length (skip near the junctions)
    const total = pts.reduce((t, q, i) => (i ? t + Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) : 0), 0);
    const at = (s) => {
      let acc = 0;
      for (let i = 0; i + 1 < pts.length; i++) {
        const L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
        if (acc + L >= s && L > 1e-6) {
          const t = (s - acc) / L, dx = (pts[i + 1][0] - pts[i][0]) / L, dz = (pts[i + 1][1] - pts[i][1]) / L;
          return { x: pts[i][0] + dx * L * t, z: pts[i][1] + dz * L * t, dx, dz };
        }
        acc += L;
      }
      return null;
    };
    const widths = [];
    for (const u of [0.25, 0.5, 0.75]) {
      const q = at(total * u);
      if (!q || blockAt(q.x, q.z)) continue;
      const l = rayToCurb(q.x, q.z, -q.dz, q.dx), r = rayToCurb(q.x, q.z, q.dz, -q.dx);
      if (l !== null && r !== null) widths.push(l + r);
    }
    widths.sort((m, n) => m - n);
    let w = widths.length ? widths[widths.length >> 1] : 0;
    if (!(w >= 3 && w <= 45)) {
      stats.widthFallback++;
      w = flags & FLAGS.freeway ? 0 : { 2: 22, 3: 18, 4: 14, 5: 10, 0: 6 }[cls] || 10;
    }
    if (w < 8 && cls === '5') flags |= FLAGS.alley;

    // lanes: OSM tag on the matching way at the midpoint, else from the width (parking on both sides of locals)
    const mid = at(total / 2);
    const om = mid ? nearestOsm(name, [mid.x, mid.z]) : null;
    let lanes = om && Number(om.tags.lanes) > 0 ? Number(om.tags.lanes) : 0;
    if (lanes) stats.lanesOsm++;
    else lanes = Math.max(1, Math.floor((w - (['4', '5'].includes(cls) ? 4.8 : 0)) / 3.2));
    // one-way check against OSM (oneway=yes follows the way's drawing direction, -1 against it)
    if (dir && om && /^(yes|-1)$/.test(om.tags.oneway || '')) {
      stats.oneWayChecked++;
      const travel = [mid.dx * dir, mid.dz * dir];
      const osmDir = om.tags.oneway === '-1' ? -1 : 1;
      if ((travel[0] * om.dx + travel[1] * om.dz) * osmDir > 0) stats.oneWayAgree++;
      else stats.oneWayDisagree.push(`${name} (${p.f_st} -> ${p.t_st})`);
    }
    const sw = sidewalkByCnn.get(String(p.cnn)) || {};
    const swBoth = sw.Both || 0;
    const inner = rdp(pts, 0.4).slice(1, -1);
    links.push({ a, b, ni: nameOf(name), w, lanes, dir, inner, flags, swL: sw.W || sw.N || sw.NW || swBoth || 0, swR: sw.E || sw.S || sw.SE || swBoth || 0, cls });
    stats.links++;
  }
  const nodes = nodeSum.map((s) => [s.x / s.n, s.z / s.n]);

  // --- control per node -------------------------------------------------------------------------------------------------
  const incident = nodes.map(() => []);
  links.forEach((l, i) => { incident[l.a].push(i); incident[l.b].push(i); });
  const control = new Array(nodes.length).fill(0);
  const stopMask = new Array(nodes.length).fill(0);
  const HEAD = { NB: [0, -1], SB: [0, 1], EB: [1, 0], WB: [-1, 0] };
  let stopMatched = 0, stopUnmatched = 0;
  for (let n = 0; n < nodes.length; n++) {
    const cnn = nodeSum[n].cnn;
    if (signalNodes.has(cnn)) { control[n] = 1; continue; }
    const facing = stopsByNode.get(cnn);
    if (!facing) continue;
    // arrival heading of each incident link: from its neighbouring point towards the node
    incident[n].forEach((li, slot) => {
      const l = links[li];
      const pts = [nodes[l.a], ...chunk(l.inner), nodes[l.b]];
      const [p, q] = l.a === n ? [pts[1], pts[0]] : [pts[pts.length - 2], pts[pts.length - 1]];
      const L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      const h = [(q[0] - p[0]) / L, (q[1] - p[1]) / L];
      for (const f of facing) {
        const v = HEAD[f];
        if (v && h[0] * v[0] + h[1] * v[1] > 0.5) { stopMask[n] |= 1 << slot; }
      }
    });
    // approaches = links with traffic arriving here (a one-way leaving the node has no stop sign to face)
    const approaches = incident[n].filter((li) => { const l = links[li]; return l.dir === 0 || (l.dir > 0 ? l.b === n : l.a === n); }).length;
    const stops = popcount(stopMask[n]);
    if (stops) stopMatched++;
    else stopUnmatched++;
    control[n] = stops === 0 ? 0 : stops >= approaches ? 2 : 3;
  }

  const q1 = (v) => Math.round(v * 10) / 10;
  const out = {
    nodes: nodes.flatMap(([x, z]) => [q1(x), q1(z)]),
    names,
    links: links.map((l) => [l.a, l.b, l.ni, q1(l.w), l.lanes, l.dir, l.inner.flatMap(([x, z]) => [q1(x), q1(z)]), l.flags, q1(l.swL), q1(l.swR)]),
    control,
    stopMask
  };

  // --- report -----------------------------------------------------------------------------------------------------------
  const widthsAll = links.filter((l) => !(l.flags & FLAGS.freeway)).map((l) => l.w).sort((m, n) => m - n);
  const pctl = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
  // links reaching out of the box end in dead ends at its edge: measure connectivity on the links inside it
  const B = boxWorld(box);
  const inBox = ([x, z]) => x >= B.x0 && x <= B.x1 && z >= B.z0 && z <= B.z1;
  const scc = sccShare(nodes.length, links.filter((l) => inBox(nodes[l.a]) && inBox(nodes[l.b])));
  const md = [
    `# Road graph report: ${box}`,
    '',
    '| Item | Value |',
    '|---|---|',
    `| Nodes / links | ${nodes.length} / ${links.length} (skipped ${stats.skipped}) |`,
    `| Width fallback (no curb both sides) | ${stats.widthFallback} links |`,
    `| Curb-to-curb width p10 / p50 / p90 (non-freeway) | ${pctl(widthsAll, 0.1).toFixed(1)} / ${pctl(widthsAll, 0.5).toFixed(1)} / ${pctl(widthsAll, 0.9).toFixed(1)} m |`,
    `| Lanes from OSM | ${stats.lanesOsm} links |`,
    `| One-way vs OSM | ${stats.oneWayAgree} agree of ${stats.oneWayChecked} checked |`,
    `| Signal nodes / stop nodes (matched / unmatched) | ${control.filter((c) => c === 1).length} / ${stopMatched} / ${stopUnmatched} |`,
    `| All-way stops / partial stops | ${control.filter((c) => c === 2).length} / ${control.filter((c) => c === 3).length} |`,
    `| Largest strongly connected component (drivable links inside the box) | ${(100 * scc).toFixed(1)}% |`,
    '',
    stats.oneWayDisagree.length ? `One-way disagreements with OSM: ${stats.oneWayDisagree.slice(0, 20).join('; ')}` : 'No one-way disagreements with OSM.',
    ''
  ];
  fs.mkdirSync(path.join(ROOT, 'docs/reports'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, `docs/reports/roadgraph-${box}.md`), md.join('\n'));
  log(`road graph ${box}: ${nodes.length} nodes, ${links.length} links, SCC ${(100 * scc).toFixed(1)}%, one-way agree ${stats.oneWayAgree}/${stats.oneWayChecked}`);
  return out;
}

function chunk(flat) { const r = []; for (let i = 0; i < flat.length; i++) r.push(flat[i]); return r; }
function popcount(m) { let c = 0; while (m) { c += m & 1; m >>>= 1; } return c; }

// Share of drivable link length (not freeway / pedestrian / private) in the largest strongly connected component
function sccShare(n, links) {
  const drive = links.filter((l) => !(l.flags & (FLAGS.freeway | FLAGS.pedestrian | FLAGS.private)));
  const adj = Array.from({ length: n }, () => []);
  const radj = Array.from({ length: n }, () => []);
  for (const l of drive) {
    if (l.dir >= 0) { adj[l.a].push(l.b); radj[l.b].push(l.a); }
    if (l.dir <= 0) { adj[l.b].push(l.a); radj[l.a].push(l.b); }
  }
  // Kosaraju (iterative)
  const seen = new Uint8Array(n), order = [];
  for (let s = 0; s < n; s++) {
    if (seen[s]) continue;
    const st = [[s, 0]];
    seen[s] = 1;
    while (st.length) {
      const top = st[st.length - 1];
      if (top[1] < adj[top[0]].length) {
        const v = adj[top[0]][top[1]++];
        if (!seen[v]) { seen[v] = 1; st.push([v, 0]); }
      } else { order.push(top[0]); st.pop(); }
    }
  }
  const comp = new Int32Array(n).fill(-1);
  let c = 0;
  for (let k = order.length - 1; k >= 0; k--) {
    const s = order[k];
    if (comp[s] >= 0) continue;
    const st = [s];
    comp[s] = c;
    while (st.length) { const u = st.pop(); for (const v of radj[u]) if (comp[v] < 0) { comp[v] = c; st.push(v); } }
    c++;
  }
  const lenOf = (l) => 1 + l.inner.length; // proxy weight (points); refined below by geometry
  const byComp = new Map();
  let total = 0;
  for (const l of drive) {
    total += lenOf(l);
    if (comp[l.a] === comp[l.b]) byComp.set(comp[l.a], (byComp.get(comp[l.a]) || 0) + lenOf(l));
  }
  return total ? Math.max(...byComp.values()) / total : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) buildRoadGraph(process.argv[2] || BOX);
