// tools/rect-cover.mjs — a building footprint as a few oriented rectangles (P2.5; the masses buildings.js turns into
// facade boxes). The footprint is turned to its dominant direction (edge directions modulo 90°, length-weighted),
// rasterised at RES m (cells whose centre lies inside), and covered greedily by the largest empty rectangle (largest
// rectangle in a histogram, as NYC's geo-blocks.mjs lotRects) until COVER of it is covered or MAX_RECTS are placed.
// Rectangles come back in the world: [cx, cz, w, d] with the building's turn θ (three.js rotation about +y:
// world = c + R_y(θ) · local, so local +x points along (cos θ, -sin θ)).
const RES = 0.5;
const COVER = 0.97;
const MAX_RECTS = 10;
const MIN_SIDE = 2; // cells (1 m)
const MIN_AREA = 8; // cells (2 m²)

// Dominant direction of a ring's edges, in [-45°, 45°)
export function dominantAngle(ring) {
  let sx = 0, sy = 0;
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length];
    const L = Math.hypot(bx - ax, bz - az);
    const phi = Math.atan2(bz - az, bx - ax);
    sx += L * Math.cos(4 * phi);
    sy += L * Math.sin(4 * phi);
  }
  return Math.atan2(sy, sx) / 4;
}

// Greedy cover of a w x h 0/1 mask (cleared as it goes): rects [i0, i1, j0, j1] (cells, inclusive)
function maskRects(m, w, h) {
  let total = 0;
  for (let k = 0; k < w * h; k++) total += m[k];
  const rects = [];
  const hist = new Int32Array(w);
  const stack = new Int32Array(w + 1);
  let covered = 0;
  while (rects.length < MAX_RECTS && covered < total * COVER) {
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
          if (height >= MIN_SIDE && width >= MIN_SIDE && height * width > best) {
            best = height * width;
            bi0 = left; bi1 = i - 1; bj0 = j - height + 1; bj1 = j;
          }
        }
        stack[sp++] = i;
      }
    }
    if (best < MIN_AREA) break;
    rects.push([bi0, bi1, bj0, bj1]);
    covered += best;
    for (let j = bj0; j <= bj1; j++) for (let i = bi0; i <= bi1; i++) m[j * w + i] = 0;
  }
  return { rects, total, covered };
}

// ring: [[x, z], ...] world metres. Returns { theta, rects: [[cx, cz, w, d], ...], coverage }
export function rectCover(ring) {
  // R_y(θ) turns a local edge at angle a (atan2(dz, dx)) to a - θ in the world: the dominant world direction φ needs θ = -φ
  const theta = -dominantAngle(ring);
  const cs = Math.cos(theta), sn = Math.sin(theta);
  let cx = 0, cz = 0;
  for (const [x, z] of ring) { cx += x / ring.length; cz += z / ring.length; }
  // world -> local: the inverse of world = c + R_y(θ) local
  const local = ring.map(([x, z]) => [(x - cx) * cs - (z - cz) * sn, (x - cx) * sn + (z - cz) * cs]);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of local) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const w = Math.max(1, Math.ceil((x1 - x0) / RES)), h = Math.max(1, Math.ceil((z1 - z0) / RES));
  const m = new Uint8Array(w * h);
  const xs = [];
  for (let j = 0; j < h; j++) {
    const z = z0 + (j + 0.5) * RES;
    xs.length = 0;
    for (let i = 0, k = local.length - 1; i < local.length; k = i++) {
      const [xa, za] = local[k], [xb, zb] = local[i];
      if ((za > z) !== (zb > z)) xs.push(xa + ((z - za) * (xb - xa)) / (zb - za));
    }
    xs.sort((p, q) => p - q);
    for (let n = 0; n + 1 < xs.length; n += 2) {
      const i0 = Math.max(0, Math.ceil((xs[n] - x0) / RES - 0.5)), i1 = Math.min(w - 1, Math.floor((xs[n + 1] - x0) / RES - 0.5));
      for (let i = i0; i <= i1; i++) m[j * w + i] = 1;
    }
  }
  const { rects, total, covered } = maskRects(m, w, h);
  return {
    theta,
    coverage: total ? covered / total : 0,
    rects: rects.map(([i0, i1, j0, j1]) => {
      const lx = x0 + ((i0 + i1 + 1) / 2) * RES, lz = z0 + ((j0 + j1 + 1) / 2) * RES;
      return [cx + lx * cs + lz * sn, cz - lx * sn + lz * cs, (i1 - i0 + 1) * RES, (j1 - j0 + 1) * RES];
    })
  };
}
