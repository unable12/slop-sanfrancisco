// Part 3: real Manhattan blocks ("curb islands") from the street centerline, by rasterising every at-grade roadway at
// its curb-to-curb width over the land (minus a waterfront strip), then labelling what's left.
// Each block: curb outline polygon, axis-aligned lot rects inside its property line (curb minus sidewalk), metadata.
import { geo, Raster, rdpRing, ringArea, bbox, log } from './geo-base.mjs';
import { pieces } from './geo-streets.mjs';

export const CUT_Z = -7090; // detailed island south of here (≈ 129th St); Upper Manhattan beyond is low-detail
export const STRIP = 20; // waterfront strip kept clear of blocks (esplanade + shore highway), metres in from the bulkhead
export const SIDEWALK = 4.6; // property line in from the curb (15 ft)
const RES = 1;

// --- Roadways that bound blocks ----------------------------------------------------------------------------------------
const PARK_ROADS = /^(EAST DR|WEST DR|CENTER DR|\d+ ST TRANSVERSE|CENTRAL PARK GREAT HL|CENTRAL RD)$/;
const HIGHWAYS = /^(FRANKLIN D ROOSEVELT DR|FDR DR {2}VIADUCT|HARLEM RIVER DR|HARLEM RIVER DY|HENRY HUDSON PKWY|BATTERY PARK UNDERPASS)$/;
function roadWidth(p) {
  if (p.w > 3) return p.w;
  if (/AVE|BLVD|BROADWAY|DR$/.test(p.name)) return 18;
  return 9.1;
}
const roads = [];
for (const p of pieces) {
  if (p.level !== '13') continue; // at grade (from-level; ramps & viaducts drop out below)
  const atGradeStreet = p.rw === '1' && !PARK_ROADS.test(p.name) && !HIGHWAYS.test(p.name) && !/DRIVEWAY|PEDESTRIAN|ALLEY/.test(p.name);
  const surface9A = p.rw === '2' && /^(WEST ST|12 AVE|11 AVE)$/.test(p.name); // Route 9A at grade bounds the west side blocks
  const plaza = p.rw === '6' && p.name === 'BROADWAY'; // Broadway's pedestrian plazas (Times Sq, Herald Sq...)
  if (!atGradeStreet && !surface9A && !plaza) continue;
  roads.push({ x0: p.x0, z0: p.z0, x1: p.x1, z1: p.z1, r: roadWidth(p) / 2, name: p.name });
}
// Broadway's pedestrian plazas aren't in the centerline (Times Square 42nd-47th St, Herald & Greeley Squares
// 33rd-35th St): bridge each gap with a straight piece between the Broadway ends on either side
export const PLAZAS = [];
{
  const bw = roads.filter((s) => s.name === 'BROADWAY');
  const ends = [];
  for (const s of bw) ends.push([s.x0, s.z0], [s.x1, s.z1]);
  const nearestEnd = (z, below) => {
    let best = null;
    for (const e of ends) {
      if (below ? e[1] < z - 3 || e[1] > z + 40 : e[1] > z + 3 || e[1] < z - 40) continue;
      if (!best || Math.abs(e[1] - z) < Math.abs(best[1] - z)) best = e;
    }
    return best;
  };
  for (const [name, zN, zS] of [['Times Square', -402, 0], ['Herald Square', 556, 726]]) {
    const a = nearestEnd(zN, false), b = nearestEnd(zS, true);
    if (!a || !b) continue;
    roads.push({ x0: a[0], z0: a[1], x1: b[0], z1: b[1], r: 9, name: 'BROADWAY', plaza: name });
    PLAZAS.push({ name, a, b, w: 18 });
  }
}
log(`${roads.length} at-grade roadway pieces`);

// --- Land: the bulkhead ring eroded by the waterfront strip ------------------------------------------------------------
const mb = bbox(geo.manhattan);
const land2 = new Raster(mb.x0 - 10, Math.max(mb.z0, CUT_Z - 400) - 10, mb.x1 + 10, mb.z1 + 10, 2);
land2.fillRing(geo.manhattan, 1);
{
  const toWater = land2.edt((v) => v === 0);
  const rc = (STRIP / 2) ** 2;
  for (let i = 0; i < land2.d.length; i++) land2.d[i] = toWater[i] > rc ? 1 : 0;
}
land2.keepLargest();
const innerRing = rdpRing(land2.traceOuter(), 1.0);
log(`inner land ring (strip ${STRIP} m): ${innerRing.length} pts`);

// --- 1 m buildable raster -------------------------------------------------------------------------------------------
const X0 = Math.floor(mb.x0) - 4, X1 = Math.ceil(mb.x1) + 4;
const Z0 = CUT_Z, Z1 = Math.ceil(mb.z1) + 4;
const R = new Raster(X0, Z0, X1, Z1, RES);
R.fillRing(innerRing, 1);
const W = R.w, H = R.h, D = R.d;
// Stamp each roadway as a capsule
for (const s of roads) {
  const ix0 = Math.max(0, Math.floor((Math.min(s.x0, s.x1) - s.r - R.x0) / RES));
  const ix1 = Math.min(W - 1, Math.ceil((Math.max(s.x0, s.x1) + s.r - R.x0) / RES));
  const iz0 = Math.max(0, Math.floor((Math.min(s.z0, s.z1) - s.r - R.z0) / RES));
  const iz1 = Math.min(H - 1, Math.ceil((Math.max(s.z0, s.z1) + s.r - R.z0) / RES));
  if (ix0 > ix1 || iz0 > iz1) continue;
  const dx = s.x1 - s.x0, dz = s.z1 - s.z0;
  const L2 = dx * dx + dz * dz || 1e-9;
  const r2 = s.r * s.r;
  for (let j = iz0; j <= iz1; j++) {
    const pz = R.z0 + (j + 0.5) * RES;
    for (let i = ix0; i <= ix1; i++) {
      const k = j * W + i;
      if (!D[k]) continue;
      const px = R.x0 + (i + 0.5) * RES;
      let t = ((px - s.x0) * dx + (pz - s.z0) * dz) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = s.x0 + t * dx - px, ez = s.z0 + t * dz - pz;
      if (ex * ex + ez * ez <= r2) D[k] = 0;
    }
  }
}

// --- Label curb islands (4-connected) --------------------------------------------------------------------------------
const lab = new Int32Array(W * H);
const comps = [];
{
  const stack = new Int32Array(W * H > 4e7 ? 4e7 : W * H);
  for (let s0 = 0; s0 < W * H; s0++) {
    if (!D[s0] || lab[s0]) continue;
    const id = comps.length + 1;
    let sp = 0, n = 0, i0 = W, i1 = -1, j0 = H, j1 = -1;
    stack[sp++] = s0;
    lab[s0] = id;
    while (sp) {
      const p = stack[--sp];
      n++;
      const i = p % W, j = (p - i) / W;
      if (i < i0) i0 = i;
      if (i > i1) i1 = i;
      if (j < j0) j0 = j;
      if (j > j1) j1 = j;
      if (i > 0 && D[p - 1] && !lab[p - 1]) { lab[p - 1] = id; stack[sp++] = p - 1; }
      if (i < W - 1 && D[p + 1] && !lab[p + 1]) { lab[p + 1] = id; stack[sp++] = p + 1; }
      if (j > 0 && D[p - W] && !lab[p - W]) { lab[p - W] = id; stack[sp++] = p - W; }
      if (j < H - 1 && D[p + W] && !lab[p + W]) { lab[p + W] = id; stack[sp++] = p + W; }
    }
    comps.push({ id, n, i0, i1, j0, j1, start: s0 });
  }
}
log(`${comps.length} curb islands labelled`);

// --- Contour of one component (corner walk keeping the component on the right, as Raster.traceOuter) ---------------
function traceComponent(c) {
  const at = (i, j) => (i >= 0 && j >= 0 && i < W && j < H && lab[j * W + i] === c.id ? 1 : 0);
  const si = c.start % W, sj = (c.start - si) / W;
  const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];
  let cx = si, cz = sj, dir = 0;
  const pts = [];
  const start = cx + ',' + cz + ',' + dir;
  let guard = 0;
  do {
    pts.push([R.x0 + cx * RES, R.z0 + cz * RES]);
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
  } while (cx + ',' + cz + ',' + dir !== start);
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[(i + pts.length - 1) % pts.length], q = pts[i], n = pts[(i + 1) % pts.length];
    if ((q[0] - p[0]) * (n[1] - q[1]) - (q[1] - p[1]) * (n[0] - q[0]) !== 0) out.push(q);
  }
  return destair(out, RES * 1.5);
}

// Raster stairs -> lines: short edges (stair steps) are replaced by their midpoints, vertices between two long edges
// (true corners) are kept
export function destair(out, short) {
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

// --- Property line: square erosion of each island by the sidewalk width (keeps grid blocks rectangular) -------------
const ER = Math.round(SIDEWALK / RES);
const prop = new Uint8Array(W * H);
{
  // erosion along x then z with running counts of non-matching cells (same label required)
  const tmp = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) {
    const row = j * W;
    let run = 0; // consecutive same-label cells ending at i
    const left = new Int32Array(W), right = new Int32Array(W);
    for (let i = 0; i < W; i++) {
      const L = lab[row + i];
      run = L && i > 0 && lab[row + i - 1] === L ? run + 1 : L ? 1 : 0;
      left[i] = run;
    }
    run = 0;
    for (let i = W - 1; i >= 0; i--) {
      const L = lab[row + i];
      run = L && i < W - 1 && lab[row + i + 1] === L ? run + 1 : L ? 1 : 0;
      right[i] = run;
    }
    for (let i = 0; i < W; i++) tmp[row + i] = lab[row + i] && left[i] > ER && right[i] > ER ? 1 : 0;
  }
  const up = new Int32Array(H), dn = new Int32Array(H);
  for (let i = 0; i < W; i++) {
    let run = 0;
    for (let j = 0; j < H; j++) {
      const k = j * W + i, L = lab[k];
      run = L && j > 0 && lab[k - W] === L ? run + 1 : L ? 1 : 0;
      up[j] = run;
    }
    run = 0;
    for (let j = H - 1; j >= 0; j--) {
      const k = j * W + i, L = lab[k];
      run = L && j < H - 1 && lab[k + W] === L ? run + 1 : L ? 1 : 0;
      dn[j] = run;
    }
    for (let j = 0; j < H; j++) prop[j * W + i] = tmp[j * W + i] && up[j] > ER && dn[j] > ER ? 1 : 0;
  }
}

// --- Greedy axis-aligned lot rects in a component's property region (largest rectangle in a histogram) ---------------
// maskRects: on a w x h 0/1 mask (cleared as it goes), up to maxRects rects [i0, i1, j0, j1] (cells, inclusive) of at
// least minSide x minSide cells and 120 cells, until 93% of the mask is covered
function maskRects(m, w, h, maxRects = 8, minSide = 8) {
  let total = 0;
  for (let k = 0; k < w * h; k++) total += m[k];
  const rects = [];
  const hist = new Int32Array(w);
  const stack = new Int32Array(w + 1);
  let covered = 0;
  for (let it = 0; it < maxRects; it++) {
    hist.fill(0);
    let best = 0, bi0 = 0, bi1 = 0, bj0 = 0, bj1 = 0;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) hist[i] = m[j * w + i] ? hist[i] + 1 : 0;
      let sp = 0;
      for (let i = 0; i <= w; i++) {
        const hh = i < w ? hist[i] : 0;
        while (sp && hist[stack[sp - 1]] >= hh) {
          const top = stack[--sp];
          const height = hist[top];
          const left = sp ? stack[sp - 1] + 1 : 0;
          const width = i - left;
          // lots need some depth both ways: penalise slivers
          if (height >= minSide && width >= minSide) {
            const area = height * width;
            if (area > best) { best = area; bi0 = left; bi1 = i - 1; bj0 = j - height + 1; bj1 = j; }
          }
        }
        stack[sp++] = i;
      }
    }
    if (best < 120 || (rects.length && best < total * 0.06)) break;
    rects.push([bi0, bi1, bj0, bj1]);
    covered += best;
    for (let j = bj0; j <= bj1; j++) for (let i = bi0; i <= bi1; i++) m[j * w + i] = 0;
    if (covered > total * 0.93) break;
  }
  return { rects, total, covered };
}
function lotRects(c, maxRects = 8) {
  const w = c.i1 - c.i0 + 1, h = c.j1 - c.j0 + 1;
  const m = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = (c.j0 + j) * W + c.i0 + i;
    if (prop[k] && lab[k] === c.id) m[j * w + i] = 1;
  }
  const { rects, total, covered } = maskRects(m, w, h, maxRects);
  return {
    rects: rects.map(([i0, i1, j0, j1]) => [R.x0 + (c.i0 + i0) * RES, R.x0 + (c.i0 + i1 + 1) * RES, R.z0 + (c.j0 + j0) * RES, R.z0 + (c.j0 + j1 + 1) * RES]),
    propArea: total,
    covered
  };
}

// --- Frontage frames of irregular islands (Lower Manhattan, Broadway's diagonals...) ---------------------------------
// The street directions an island fronts: its outline's edge directions modulo 90°, length-weighted, in up to 3
// clusters ±7° wide. Every island cell joins the cluster of its nearest outline edge; each cluster's cells are then
// re-rasterised in a frame turned to its direction, eroded by the sidewalk width there (so a diagonal property line
// sits exactly SIDEWALK in from its curb) and covered with lot rects in that frame, which buildings.js fills like a
// grid block and turns back into place. Returns [[θ, px, pz, rects], ...] with world = p + R_y(θ)·(local − p)
// (three.js rotation about +y), or null for an island fronting the grid alone.
const DEG = Math.PI / 180;
const wrap90 = (a) => ((((a + Math.PI / 4) % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2)) - Math.PI / 4;
function blockFrames(c, poly) {
  const edges = [];
  let per = 0;
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i];
    const [bx, bz] = poly[(i + 1) % poly.length];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 0.5) continue;
    edges.push({ ax, az, bx, bz, L, phi: wrap90(Math.atan2(bz - az, bx - ax)), k: -1 });
    per += L;
  }
  const clusters = [];
  for (let n = 0; n < 3; n++) {
    let seed = null, seedW = 0;
    for (const e of edges) {
      if (e.k >= 0 || e.L < 4) continue;
      let w = 0;
      for (const f of edges) if (f.k < 0 && Math.abs(wrap90(f.phi - e.phi)) <= 7 * DEG) w += f.L;
      if (w > seedW) { seedW = w; seed = e; }
    }
    if (!seed || seedW < 14 || (n > 0 && seedW < per * 0.12)) break;
    const members = edges.filter((f) => f.k < 0 && Math.abs(wrap90(f.phi - seed.phi)) <= 7 * DEG);
    let sx = 0, sy = 0;
    for (const f of members) { sx += f.L * Math.cos(4 * f.phi); sy += f.L * Math.sin(4 * f.phi); }
    for (const f of members) f.k = clusters.length;
    clusters.push({ phi: Math.atan2(sy, sx) / 4 });
  }
  if (!clusters.length || (clusters.length === 1 && Math.abs(clusters[0].phi) < 2 * DEG)) return null;
  for (const e of edges) {
    if (e.k >= 0) continue;
    let bd = Infinity;
    clusters.forEach((cl, k) => { const d = Math.abs(wrap90(e.phi - cl.phi)); if (d < bd) { bd = d; e.k = k; } });
  }

  // Island cells -> cluster of the nearest outline edge
  const w = c.i1 - c.i0 + 1, h = c.j1 - c.j0 + 1;
  const owner = new Int8Array(w * h).fill(-1);
  for (let j = 0; j < h; j++) {
    const pz = R.z0 + (c.j0 + j + 0.5) * RES;
    for (let i = 0; i < w; i++) {
      if (lab[(c.j0 + j) * W + c.i0 + i] !== c.id) continue;
      if (clusters.length === 1) { owner[j * w + i] = 0; continue; }
      const px = R.x0 + (c.i0 + i + 0.5) * RES;
      let bd = Infinity, bk = 0;
      for (const e of edges) {
        const dx = e.bx - e.ax, dz = e.bz - e.az;
        let t = ((px - e.ax) * dx + (pz - e.az) * dz) / (e.L * e.L);
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = e.ax + t * dx - px, ez = e.az + t * dz - pz;
        const d = ex * ex + ez * ez;
        if (d < bd) { bd = d; bk = e.k; }
      }
      owner[j * w + i] = bk;
    }
  }

  const px = R.x0 + ((c.i0 + c.i1 + 1) * RES) / 2;
  const pz = R.z0 + ((c.j0 + c.j1 + 1) * RES) / 2;
  // Each cluster's frame: the island re-rasterised turned to the cluster's direction, eroded by the sidewalk width
  // there (`prop`, square runs along u then v) and its own region (`reg`)
  const views = clusters.map((cl, k) => {
    const th = -cl.phi; // local +x (u) runs along the cluster's edges
    const cs = Math.cos(th), sn = Math.sin(th);
    // local bbox of the island's world bbox
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [x, z] of [[c.i0, c.j0], [c.i1 + 1, c.j0], [c.i0, c.j1 + 1], [c.i1 + 1, c.j1 + 1]]) {
      const dx = R.x0 + x * RES - px, dz = R.z0 + z * RES - pz;
      const u = px + dx * cs - dz * sn, v = pz + dx * sn + dz * cs; // R_y(-θ)
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    u0 = Math.floor(u0); v0 = Math.floor(v0);
    const lw = Math.ceil(u1 - u0) + 1, lh = Math.ceil(v1 - v0) + 1;
    const isl = new Uint8Array(lw * lh);
    const reg = new Uint8Array(lw * lh);
    const cell = new Int32Array(lw * lh).fill(-1); // island cell (index into the block's w x h raster) under each local cell
    for (let j = 0; j < lh; j++) {
      const dv = v0 + j + 0.5 - pz;
      for (let i = 0; i < lw; i++) {
        const du = u0 + i + 0.5 - px;
        const x = px + du * cs + dv * sn, z = pz - du * sn + dv * cs; // R_y(θ)
        const gi = Math.floor((x - R.x0) / RES) - c.i0, gj = Math.floor((z - R.z0) / RES) - c.j0;
        if (gi < 0 || gj < 0 || gi >= w || gj >= h) continue;
        const o = owner[gj * w + gi];
        if (o < 0) continue;
        isl[j * lw + i] = 1;
        cell[j * lw + i] = gj * w + gi;
        if (o === k) reg[j * lw + i] = 1;
      }
    }
    const tmp = new Uint8Array(lw * lh);
    for (let j = 0; j < lh; j++) {
      let run = 0;
      const left = new Int32Array(lw);
      for (let i = 0; i < lw; i++) { run = isl[j * lw + i] ? run + 1 : 0; left[i] = run; }
      run = 0;
      for (let i = lw - 1; i >= 0; i--) { run = isl[j * lw + i] ? run + 1 : 0; tmp[j * lw + i] = left[i] > ER && run > ER ? 1 : 0; }
    }
    const prop = new Uint8Array(lw * lh);
    for (let i = 0; i < lw; i++) {
      let run = 0;
      const up = new Int32Array(lh);
      for (let j = 0; j < lh; j++) { run = isl[j * lw + i] ? run + 1 : 0; up[j] = run; }
      run = 0;
      for (let j = lh - 1; j >= 0; j--) {
        run = isl[j * lw + i] ? run + 1 : 0;
        prop[j * lw + i] = tmp[j * lw + i] && up[j] > ER && run > ER ? 1 : 0;
      }
    }
    return { th, u0, v0, lw, lh, prop, reg, cell, rects: [] };
  });
  // Pass 1: each cluster's lots inside its own region. Pass 2: corner wedges & seams no region's lots reached, from
  // any frame. Island cells under a lot, grown by a cell (the frames sample the raster at different angles), can't be
  // built on twice.
  const used = new Uint8Array(w * h);
  const markUsed = (k) => {
    const gi = k % w, gj = (k - gi) / w;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const i = gi + di, j = gj + dj;
      if (i >= 0 && j >= 0 && i < w && j < h) used[j * w + i] = 1;
    }
  };
  for (const pass of [1, 2]) {
    for (const vw of views) {
      const { lw, lh, prop, reg, cell } = vw;
      const m = new Uint8Array(lw * lh);
      for (let k = 0; k < lw * lh; k++) m[k] = prop[k] && (pass === 2 || reg[k]) && cell[k] >= 0 && !used[cell[k]] ? 1 : 0;
      const { rects } = maskRects(m, lw, lh, pass === 1 ? 6 : 4, 12);
      for (const [i0, i1, j0, j1] of rects) {
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (cell[j * lw + i] >= 0) markUsed(cell[j * lw + i]);
        vw.rects.push([vw.u0 + i0, vw.u0 + i1 + 1, vw.v0 + j0, vw.v0 + j1 + 1]);
      }
    }
  }
  const frames = views.filter((vw) => vw.rects.length).map((vw) => [vw.th, px, pz, vw.rects]);
  return frames.length ? frames : null;
}

// --- Assemble blocks ---------------------------------------------------------------------------------------------------
const blocks = [];
let small = 0;
for (const c of comps) {
  const area = c.n * RES * RES;
  if (area < 40) { small++; continue; }
  let poly = traceComponent(c);
  poly = rdpRing(poly, 0.5);
  if (poly.length < 3) continue;
  if (ringArea(poly) > 0) poly.reverse();
  const bw = (c.i1 - c.i0 + 1) * RES, bd = (c.j1 - c.j0 + 1) * RES;
  const rectness = area / (bw * bd);
  const { rects, propArea, covered } = area >= 300 ? lotRects(c) : { rects: [], propArea: 0, covered: 0 };
  const frames = rectness <= 0.985 && area >= 300 ? blockFrames(c, poly) : null;
  blocks.push({
    id: blocks.length,
    poly,
    area: Math.round(area),
    bbox: [R.x0 + c.i0 * RES, R.x0 + (c.i1 + 1) * RES, R.z0 + c.j0 * RES, R.z0 + (c.j1 + 1) * RES],
    rect: rectness > 0.985,
    rects,
    frames,
    fill: propArea ? Math.round((covered / propArea) * 100) / 100 : 0
  });
}
log(`${blocks.length} blocks (${blocks.filter((b) => b.rect).length} rectangular, ${blocks.filter((b) => !b.rects.length).length} without lots); ${small} specks dropped`);
log(`${blocks.filter((b) => b.frames).length} irregular blocks with frontage frames (${blocks.reduce((t, b) => t + (b.frames ? b.frames.length : 0), 0)} frames)`);

export { blocks, innerRing, roads, R as blockRaster, lab as blockLabels };
