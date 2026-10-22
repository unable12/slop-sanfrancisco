// tools/geo-curbs.mjs — curb islands ("blocks": everything raised behind a curb) from DataSF "Curbs and Islands"
// (emxt-b6yg). The curb lines mostly close into rings; where a block's curb is broken (alley mouths, driveways) the open
// ends are paired and closed with straight segments, but never across a street wider than an alley. The rings are filled
// on a 0.5 m raster, alley corridors that now lie inside blocks are carved back out of them, and the components are traced
// back to polygons (the NYC labelling / tracing code, geo-blocks.mjs). Output in NYC's BLOCKS format plus a kind:
//   [flat outline, lot rects (none), park share, park name, rectangular, frames, kind ('block' | 'island')]
// Writes docs/reports/curbs-<box>.md and docs/review/p1/curbs-<box>.svg.
import fs from 'node:fs';
import path from 'node:path';
import { datasf, worldLines, worldPolygons, boxWorld, rdpRing, ringArea, bbox, log, ROOT, BOX } from './geo-base.mjs';

const RES = 0.5;
const SNAP = 0.3; // metres: ends this close are the same point
const CLOSE_MAX = 12; // metres: longest gap closed between curb ends
const ALLEY_GAP = 9; // metres: a closing segment may cross a street centreline only if this short (an alley mouth)
const ALLEY_HALF = 2.6; // metres: half width of the corridor carved for an alley running inside a closed block
const MIN_AREA = 4; // m^2
const FAR_CLOSE_MAX = 60; // metres: a chain may close on itself this far if nothing lies across the gap

// Raster stairs -> lines: short edges (stair steps) become their midpoints, corners between two long edges stay
// (NYC geo-blocks.mjs destair)
function destair(out, short) {
  const n = out.length;
  const len = (i) => { const a = out[i], b = out[(i + 1) % n]; return Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]); };
  const res = [];
  for (let i = 0; i < n; i++) {
    const prevLong = len((i + n - 1) % n) > short;
    const nextLong = len(i) > short;
    if (prevLong && nextLong) res.push(out[i]);
    if (!nextLong) { const a = out[i], b = out[(i + 1) % n]; res.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]); }
  }
  return res;
}

const segX = (a, b, c, d) => {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
};

export function buildCurbIslands(box = BOX) {
  const B = boxWorld(box);
  const report = { closures: [], rejected: [], unclosed: 0 };

  // --- 1. curb lines, ends snapped ---------------------------------------------------------------------------------------
  const lines = [];
  for (const f of datasf('curbs', box)) {
    const kind = f.properties.layer === 'ISLANDS' ? 'island' : 'block';
    for (const l of worldLines(f.geometry)) if (l.length >= 2) lines.push({ pts: l, kind });
  }
  const streets = [];
  for (const f of datasf('streets', box)) {
    const p = f.properties;
    if (/^PAPER|PSEUDO/.test(p.layer)) continue;
    for (const l of worldLines(f.geometry)) streets.push({ pts: l, name: p.streetname || '', type: p.st_type || '', cls: String(p.classcode) });
  }
  const crossesStreet = (a, b) => {
    for (const s of streets) for (let i = 0; i + 1 < s.pts.length; i++) if (segX(a, b, s.pts[i], s.pts[i + 1])) return s;
    return null;
  };

  // --- 2. pair open ends (closest first), close the gaps ----------------------------------------------------------------
  const closed = [];
  const open = [];
  for (const L of lines) {
    const a = L.pts[0], b = L.pts[L.pts.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) <= SNAP) closed.push(L);
    else open.push(L);
  }
  // chains of open lines joined end to end; ends: {chain, at: 0 | 1}
  let chains = open.map((L) => ({ pts: L.pts.slice(), kind: L.kind }));
  for (let pass = 0; pass < 2; pass++) {
    const ends = [];
    chains.forEach((c, ci) => { ends.push({ ci, at: 0 }, { ci, at: 1 }); });
    const P = (e) => (e.at === 0 ? chains[e.ci].pts[0] : chains[e.ci].pts[chains[e.ci].pts.length - 1]);
    const pairs = [];
    for (let i = 0; i < ends.length; i++) {
      for (let j = i + 1; j < ends.length; j++) {
        const d = Math.hypot(P(ends[i])[0] - P(ends[j])[0], P(ends[i])[1] - P(ends[j])[1]);
        if (d <= CLOSE_MAX) pairs.push([d, i, j]);
      }
    }
    pairs.sort((p, q) => p[0] - q[0]);
    const used = new Set();
    const link = new Map(); // end index -> partner end index
    for (const [d, i, j] of pairs) {
      if (used.has(i) || used.has(j)) continue;
      if (d > SNAP) {
        const s = crossesStreet(P(ends[i]), P(ends[j]));
        // many SF alleys are named "ST" (Ecker St, Spofford St): judge by the gap and the street's class instead
        if (s && (d > ALLEY_GAP || ['1', '2', '3'].includes(s.cls))) {
          report.rejected.push({ at: P(ends[i]), gap: d, street: s.name });
          continue;
        }
        report.closures.push({ at: P(ends[i]), gap: d, street: s ? s.name : '' });
      }
      used.add(i); used.add(j);
      link.set(i, j); link.set(j, i);
    }
    // walk chains through the links into rings or longer open chains
    const visited = new Set();
    const next = [];
    for (let ci = 0; ci < chains.length; ci++) {
      if (visited.has(ci)) continue;
      // find a start: an unlinked end of this chain group, or any end if it is a loop
      let startEnd = 2 * ci;
      let guard = 0;
      for (let e = startEnd; guard++ < chains.length * 2; ) {
        const other = e ^ 1; // the chain's other end... walk backwards to find an unlinked end
        const partner = link.get(e);
        if (partner === undefined) { startEnd = e; break; }
        e = partner ^ 1;
        if (e === 2 * ci) { startEnd = 2 * ci; break; } // loop
        void other;
      }
      const pts = [];
      let e = startEnd;
      let isLoop = false;
      for (let g = 0; g < chains.length * 2; g++) {
        const c = chains[e >> 1];
        visited.add(e >> 1);
        const seq = (e & 1) === 0 ? c.pts : c.pts.slice().reverse(); // enter at end e, leave at end e^1
        pts.push(...seq);
        const out = e ^ 1;
        const partner = link.get(out);
        if (partner === undefined) break;
        if (partner === startEnd) { isLoop = true; break; }
        e = partner;
      }
      const kind = chains[ci].kind;
      if (isLoop) closed.push({ pts, kind });
      else next.push({ pts, kind });
    }
    chains = next;
  }
  // Last resort for chains still open: close each on itself, or join it to the nearest open chain end (up to
  // FAR_CLOSE_MAX), when the closing segment crosses no street centreline and no curb line at all
  const crossesCurb = (a, b, self) => {
    for (const L of [...lines, ...chains]) {
      if (L === self) continue;
      const pts = L.pts;
      for (let i = 0; i + 1 < pts.length; i++) if (segX(a, b, pts[i], pts[i + 1])) return true;
    }
    return false;
  };
  const still = [];
  for (const c of chains) {
    const a = c.pts[0], b = c.pts[c.pts.length - 1];
    const gap = Math.hypot(a[0] - b[0], a[1] - b[1]);
    // only an alley (class 5 / 0) may lie across the gap: it runs into the block and is carved back out below
    const across = crossesStreet(a, b);
    if (gap <= FAR_CLOSE_MAX && !(across && ['1', '2', '3', '4'].includes(across.cls)) && !crossesCurb(a, b, c) && Math.abs(ringArea(c.pts)) > 50) {
      closed.push({ pts: c.pts, kind: c.kind });
      report.closures.push({ at: a, gap, street: '', far: true });
    } else still.push(c);
  }
  chains = still;
  report.unclosed = chains.length;
  report.unclosedLength = chains.reduce((t, c) => t + c.pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - c.pts[i - 1][0], p[1] - c.pts[i - 1][1]) : 0), 0), 0);
  const closedLength = closed.reduce((t, c) => t + c.pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - c.pts[i - 1][0], p[1] - c.pts[i - 1][1]) : 0), 0), 0);

  // --- 3. fill rings on a raster (union) -------------------------------------------------------------------------------
  const M = 60;
  const x0 = Math.floor((B.x0 - M) / RES) * RES, z0 = Math.floor((B.z0 - M) / RES) * RES;
  const W = Math.ceil((B.x1 + M - x0) / RES) + 1, H = Math.ceil((B.z1 + M - z0) / RES) + 1;
  const D = new Uint8Array(W * H);
  const kindAt = new Uint8Array(W * H); // 1 block, 2 island
  const fill = (ring, cb) => {
    const bb = bbox(ring);
    const j0 = Math.max(0, Math.floor((bb.z0 - z0) / RES)), j1 = Math.min(H - 1, Math.ceil((bb.z1 - z0) / RES));
    const xs = [];
    for (let j = j0; j <= j1; j++) {
      const z = z0 + (j + 0.5) * RES;
      xs.length = 0;
      for (let i = 0, k = ring.length - 1; i < ring.length; k = i++) {
        const [xa, za] = ring[k], [xb, zb] = ring[i];
        if ((za > z) !== (zb > z)) xs.push(xa + ((z - za) * (xb - xa)) / (zb - za));
      }
      xs.sort((p, q) => p - q);
      for (let n = 0; n + 1 < xs.length; n += 2) {
        const i0 = Math.max(0, Math.ceil((xs[n] - x0) / RES - 0.5)), i1 = Math.min(W - 1, Math.floor((xs[n + 1] - x0) / RES - 0.5));
        for (let i = i0; i <= i1; i++) cb(j * W + i);
      }
    }
  };
  // biggest first, to count rings nested in others (duplicated curbs)
  closed.sort((a, b) => Math.abs(ringArea(b.pts)) - Math.abs(ringArea(a.pts)));
  let nested = 0;
  for (const c of closed) {
    let inside = 0, total = 0;
    fill(c.pts, (k) => { total++; if (D[k]) inside++; });
    if (total && inside / total > 0.9) nested++;
    fill(c.pts, (k) => { D[k] = 1; kindAt[k] = c.kind === 'island' ? 2 : 1; }); // union: nested rings are duplicates
  }

  // --- 3b. parks & plazas whose curbs are missing from the curb data are raised areas too --------------------------------
  let parksAdded = 0;
  for (const f of datasf('parks', box)) {
    for (const rings of worldPolygons(f.geometry)) {
      let inside = 0, total = 0;
      fill(rings[0], (k) => { total++; if (D[k]) inside++; });
      if (total && inside / total < 0.5) { fill(rings[0], (k) => { D[k] = 1; kindAt[k] = 1; }); parksAdded++; }
    }
  }

  // --- 4. carve alley corridors that run inside blocks -------------------------------------------------------------------
  let carved = 0;
  const inBlock = (x, z) => {
    const i = Math.floor((x - x0) / RES), j = Math.floor((z - z0) / RES);
    return i >= 0 && j >= 0 && i < W && j < H && D[j * W + i] === 1;
  };
  for (const s of streets) {
    let n = 0, inside = 0;
    for (let i = 0; i + 1 < s.pts.length; i++) {
      const [ax, az] = s.pts[i], [bx, bz] = s.pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      for (let t = 0; t < L; t += 2) { n++; if (inBlock(ax + ((bx - ax) * t) / L, az + ((bz - az) * t) / L)) inside++; }
    }
    if (!n || inside / n < 0.3) continue;
    carved++;
    for (let i = 0; i + 1 < s.pts.length; i++) {
      const [ax, az] = s.pts[i], [bx, bz] = s.pts[i + 1];
      const ix0 = Math.max(0, Math.floor((Math.min(ax, bx) - ALLEY_HALF - x0) / RES)), ix1 = Math.min(W - 1, Math.ceil((Math.max(ax, bx) + ALLEY_HALF - x0) / RES));
      const iz0 = Math.max(0, Math.floor((Math.min(az, bz) - ALLEY_HALF - z0) / RES)), iz1 = Math.min(H - 1, Math.ceil((Math.max(az, bz) + ALLEY_HALF - z0) / RES));
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9;
      for (let j = iz0; j <= iz1; j++) {
        for (let i = ix0; i <= ix1; i++) {
          const px = x0 + (i + 0.5) * RES, pz = z0 + (j + 0.5) * RES;
          let t = ((px - ax) * dx + (pz - az) * dz) / L2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          if (Math.hypot(ax + t * dx - px, az + t * dz - pz) <= ALLEY_HALF) D[j * W + i] = 0;
        }
      }
    }
  }

  // --- 5. label & trace components (as NYC geo-blocks.mjs) --------------------------------------------------------------
  const lab = new Int32Array(W * H);
  const comps = [];
  const stack = new Int32Array(W * H);
  for (let s0 = 0; s0 < W * H; s0++) {
    if (!D[s0] || lab[s0]) continue;
    const id = comps.length + 1;
    let sp = 0, n = 0, islandCells = 0;
    stack[sp++] = s0;
    lab[s0] = id;
    while (sp) {
      const p = stack[--sp];
      n++;
      if (kindAt[p] === 2) islandCells++;
      const i = p % W;
      if (i > 0 && D[p - 1] && !lab[p - 1]) { lab[p - 1] = id; stack[sp++] = p - 1; }
      if (i < W - 1 && D[p + 1] && !lab[p + 1]) { lab[p + 1] = id; stack[sp++] = p + 1; }
      if (p >= W && D[p - W] && !lab[p - W]) { lab[p - W] = id; stack[sp++] = p - W; }
      if (p + W < W * H && D[p + W] && !lab[p + W]) { lab[p + W] = id; stack[sp++] = p + W; }
    }
    comps.push({ id, n, start: s0, island: islandCells > n / 2 });
  }
  const trace = (c) => {
    const at = (i, j) => (i >= 0 && j >= 0 && i < W && j < H && lab[j * W + i] === c.id ? 1 : 0);
    const si = c.start % W, sj = (c.start - si) / W;
    const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];
    let cx = si, cz = sj, dir = 0;
    const pts = [];
    const start = `${cx},${cz},${dir}`;
    let guard = 0;
    do {
      pts.push([x0 + cx * RES, z0 + cz * RES]);
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
    // drop collinear raster corners, turn the stair steps into lines, then simplify (as NYC geo-blocks.mjs)
    const corners = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[(i + pts.length - 1) % pts.length], c = pts[i], n = pts[(i + 1) % pts.length];
      if ((c[0] - p[0]) * (n[1] - c[1]) - (c[1] - p[1]) * (n[0] - c[0]) !== 0) corners.push(c);
    }
    return rdpRing(destair(corners, RES * 1.5), 0.35);
  };

  // --- 6. polygons, frames, parks ------------------------------------------------------------------------------------------
  const parks = datasf('parks', box).flatMap((f) => worldPolygons(f.geometry).map((rings) => ({ ring: rings[0], name: f.properties.property_name || '' })));
  const inPoly = (ring, x, z) => {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  };
  const blocks = [];
  for (const c of comps) {
    if (c.n * RES * RES < MIN_AREA) continue;
    let ring = trace(c);
    if (ring.length < 3) continue;
    if (ringArea(ring) > 0) ring = ring.reverse(); // NYC convention: every ring has negative ringArea()
    // dominant edge directions (length-weighted, folded to [0, 90) degrees), up to two frames
    const hist = new Float64Array(90);
    for (let i = 0; i < ring.length; i++) {
      const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 3) continue;
      const deg = ((((Math.atan2(bz - az, bx - ax) * 180) / Math.PI) % 90) + 90) % 90;
      hist[Math.floor(deg) % 90] += L;
    }
    let best = 0;
    for (let d = 1; d < 90; d++) if (hist[d] > hist[best]) best = d;
    const theta = (best * Math.PI) / 180;
    const bb = bbox(ring);
    const cx = (bb.x0 + bb.x1) / 2, cz = (bb.z0 + bb.z1) / 2;
    // park share: sampled
    let parkHits = 0, samples = 0, parkName = '';
    for (let s = 0; s < 64; s++) {
      const x = bb.x0 + (((s * 0.618) % 1) * (bb.x1 - bb.x0)), z = bb.z0 + (((s * 0.377 + 0.5) % 1) * (bb.z1 - bb.z0));
      if (!inPoly(ring, x, z)) continue;
      samples++;
      const pk = parks.find((p) => inPoly(p.ring, x, z));
      if (pk) { parkHits++; parkName = pk.name; }
    }
    const share = samples ? parkHits / samples : 0;
    const area = Math.abs(ringArea(ring));
    const rect = area / ((bb.x1 - bb.x0) * (bb.z1 - bb.z0)) > 0.97;
    blocks.push({ ring, park: share > 0.5 ? Math.round(share * 100) / 100 : 0, parkName: share > 0.5 ? parkName : '', rect, frames: [[theta, cx, cz, []]], kind: c.island ? 'island' : 'block' });
  }

  // --- 7. checks against the footprints ------------------------------------------------------------------------------------
  const blockAt = (x, z) => {
    const i = Math.floor((x - x0) / RES), j = Math.floor((z - z0) / RES);
    return i >= 0 && j >= 0 && i < W && j < H ? lab[j * W + i] : 0;
  };
  let fpIn = 0, fpNear = 0, fpOut = 0;
  const outliers = [];
  for (const f of datasf('buildings', box)) {
    for (const rings of worldPolygons(f.geometry)) {
      const r = rings[0];
      const cx = r.reduce((s, p) => s + p[0], 0) / r.length, cz = r.reduce((s, p) => s + p[1], 0) / r.length;
      if (cx < B.x0 || cx > B.x1 || cz < B.z0 || cz > B.z1) continue;
      if (blockAt(cx, cz)) { fpIn++; continue; }
      let near = false;
      for (let a = 0; a < 16 && !near; a++) near = !!blockAt(cx + 2 * Math.cos(a * 0.39), cz + 2 * Math.sin(a * 0.39));
      if (near) fpNear++;
      else { fpOut++; if (outliers.length < 12) outliers.push([Math.round(cx), Math.round(cz)]); }
    }
  }

  // --- 8. report & SVG --------------------------------------------------------------------------------------------------
  const pct = (a, b) => ((100 * a) / Math.max(1, b)).toFixed(1);
  const lines2 = [
    `# Curb islands report: ${box}`,
    '',
    `Generated by \`tools/geo-curbs.mjs\` from DataSF Curbs and Islands (emxt-b6yg) and Streets (3psu-pn9h).`,
    '',
    '| Item | Value |',
    '|---|---|',
    `| Curb lines | ${lines.length} (${lines.filter((l) => l.kind === 'island').length} island) |`,
    `| Gaps closed | ${report.closures.length} (median ${report.closures.length ? report.closures.map((c) => c.gap).sort((a, b) => a - b)[report.closures.length >> 1].toFixed(1) : '-'} m) |`,
    `| Closures rejected (would cross a street) | ${report.rejected.length} |`,
    `| Unclosed chains | ${report.unclosed} (${report.unclosedLength.toFixed(0)} m of ${(report.unclosedLength + closedLength).toFixed(0)} m curb, ${pct(report.unclosedLength, report.unclosedLength + closedLength)}% dropped) |`,
    `| Rings nested in another ring (toggled) | ${nested} |`,
    `| Alley corridors carved | ${carved} |`,
    `| Park polygons added (no curb ring in the data) | ${parksAdded} |`,
    `| Blocks | ${blocks.length} (${blocks.filter((b) => b.kind === 'island').length} islands, ${blocks.filter((b) => b.park).length} parks) |`,
    `| Footprint centroids in a block / within 2 m / outside | ${fpIn} / ${fpNear} / ${fpOut} (${pct(fpIn + fpNear, fpIn + fpNear + fpOut)}% covered) |`,
    '',
    `Outside samples (world x, z): ${JSON.stringify(outliers)}`,
    '',
    'Rejected closures (first 15):',
    '',
    ...report.rejected.slice(0, 15).map((r) => `- at (${r.at.map(Math.round).join(', ')}), gap ${r.gap.toFixed(1)} m, across ${r.street}`),
    ''
  ];
  fs.mkdirSync(path.join(ROOT, 'docs/reports'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, `docs/reports/curbs-${box}.md`), lines2.join('\n'));
  const svg = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${B.x0 - 20} ${B.z0 - 20} ${B.x1 - B.x0 + 40} ${B.z1 - B.z0 + 40}" style="background:#1d2026">`];
  for (const b of blocks) svg.push(`<path d="M${b.ring.map((p) => p.map((v) => v.toFixed(1)).join(' ')).join('L')}Z" fill="${b.kind === 'island' ? '#6b8f71' : b.park ? '#3f6f45' : '#8a8f99'}" stroke="#d0d4dc" stroke-width="0.3"/>`);
  for (const s of streets) svg.push(`<path d="M${s.pts.map((p) => p.map((v) => v.toFixed(1)).join(' ')).join('L')}" fill="none" stroke="#e8b04a" stroke-width="0.6" opacity="0.7"/>`);
  for (const c of chains) svg.push(`<path d="M${c.pts.map((p) => p.map((v) => v.toFixed(1)).join(' ')).join('L')}" fill="none" stroke="#ff4fd8" stroke-width="1.2"/>`);
  for (const c of report.closures) svg.push(`<circle cx="${c.at[0].toFixed(1)}" cy="${c.at[1].toFixed(1)}" r="2.5" fill="none" stroke="#ff3b30" stroke-width="0.8"/>`);
  for (const r of report.rejected) svg.push(`<circle cx="${r.at[0].toFixed(1)}" cy="${r.at[1].toFixed(1)}" r="2.5" fill="none" stroke="#4fc3ff" stroke-width="0.8"/>`);
  svg.push('</svg>');
  fs.mkdirSync(path.join(ROOT, 'docs/review/p1'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, `docs/review/p1/curbs-${box}.svg`), svg.join('\n'));
  log(`curb islands ${box}: ${blocks.length} blocks, ${report.closures.length} gaps closed, ${report.rejected.length} rejected, ${report.unclosed} unclosed; footprints covered ${pct(fpIn + fpNear, fpIn + fpNear + fpOut)}%`);
  return { blocks, report, raster: { x0, z0, W, H, RES, lab } };
}

if (import.meta.url === `file://${process.argv[1]}`) buildCurbIslands(process.argv[2] || BOX);
