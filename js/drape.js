(function () {
// js/drape.js
// Polygons laid on the terrain (pure JS, no THREE; tests/drape.test.cjs): curb island tops, lawns, curb faces.
//   Drape.polygon(ring, ground, normal, offset, out)  top surface at ground + offset. The ring's bounding square is cut
//       into a quadtree whose leaves stop splitting once the terrain inside departs less than TOL from the plane through
//       their corners (or at MIN_LEAF); the ring is clipped to each leaf and the pieces triangulated.
//   Drape.wall(ring, ground, bottom, top, out)       outward-facing quads along the ring from ground + bottom to ground + top
//   Drape.densify(ring, step)                        the ring with points added so no edge is longer than `step`
// Rings are [{x, z}], either winding. `ground(x, z)` gives the height, `normal(x, z, out)` the unit normal.
// `out` = { pos: [], nrm: [], idx: [] } (world x, y, z triples; triangles counter-clockwise seen from outside).

const TOL = 0.05; // metres
const MIN_LEAF = 2; // metres: the height field's own spacing
const MAX_LEAF = 32; // metres: big flat blocks still get vertices this often

const signedArea = (ring) => {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j].x - ring[i].x) * (ring[j].z + ring[i].z);
  return a / 2; // < 0: counter-clockwise seen from above (+y; x east, z south, north up)
};

function densify(ring, step) {
  const out = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / step));
    for (let k = 0; k < n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
  }
  return out;
}

// Sutherland-Hodgman clip of a ring to an axis-aligned rectangle
function clipToRect(ring, x0, z0, x1, z1) {
  let pts = ring;
  const planes = [
    [(p) => p.x >= x0, (a, b) => (x0 - a.x) / (b.x - a.x)],
    [(p) => p.x <= x1, (a, b) => (x1 - a.x) / (b.x - a.x)],
    [(p) => p.z >= z0, (a, b) => (z0 - a.z) / (b.z - a.z)],
    [(p) => p.z <= z1, (a, b) => (z1 - a.z) / (b.z - a.z)]
  ];
  for (const [inside, cut] of planes) {
    if (!pts.length) break;
    const next = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const ia = inside(a), ib = inside(b);
      if (ia) next.push(a);
      if (ia !== ib) {
        const t = cut(a, b);
        next.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
      }
    }
    pts = next;
  }
  // drop repeated points
  const clean = [];
  for (const p of pts) {
    const q = clean[clean.length - 1];
    if (!q || Math.abs(q.x - p.x) > 1e-6 || Math.abs(q.z - p.z) > 1e-6) clean.push(p);
  }
  while (clean.length > 1 && Math.abs(clean[0].x - clean[clean.length - 1].x) < 1e-6 && Math.abs(clean[0].z - clean[clean.length - 1].z) < 1e-6) clean.pop();
  return clean;
}

// Ear clipping of a simple ring (counter-clockwise from above); collinear points are tolerated. Returns index triples.
function earClip(pts) {
  const n = pts.length;
  if (n < 3) return [];
  const idx = [];
  for (let i = 0; i < n; i++) idx.push(i);
  const cross = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x); // < 0: left turn seen from above
  const tris = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < n * n) {
    let clipped = false;
    for (let k = 0; k < idx.length; k++) {
      const ia = idx[(k + idx.length - 1) % idx.length], ib = idx[k], ic = idx[(k + 1) % idx.length];
      const a = pts[ia], b = pts[ib], c = pts[ic];
      const cr = cross(a, b, c);
      if (cr > -1e-9) {
        // reflex or collinear: a collinear vertex can go without a triangle
        if (Math.abs(cr) < 1e-9) {
          idx.splice(k, 1);
          clipped = true;
          break;
        }
        continue;
      }
      let empty = true;
      for (const j of idx) {
        if (j === ia || j === ib || j === ic) continue;
        const p = pts[j];
        if (cross(a, b, p) < 0 && cross(b, c, p) < 0 && cross(c, a, p) < 0) {
          empty = false;
          break;
        }
      }
      if (!empty) continue;
      tris.push(ia, ib, ic);
      idx.splice(k, 1);
      clipped = true;
      break;
    }
    if (!clipped) break; // degenerate leftovers
  }
  if (idx.length === 3 && cross(pts[idx[0]], pts[idx[1]], pts[idx[2]]) < -1e-9) tris.push(idx[0], idx[1], idx[2]);
  return tris;
}

const _n = { x: 0, y: 1, z: 0 };

function polygon(ring, ground, normal, offset, out) {
  // counter-clockwise from above, so every piece clipped from it is too
  const ccw = signedArea(ring) < 0 ? ring : ring.slice().reverse();
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of ccw) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  const x0 = Math.floor(minX / MIN_LEAF) * MIN_LEAF;
  const z0 = Math.floor(minZ / MIN_LEAF) * MIN_LEAF;
  let size = MIN_LEAF;
  while (x0 + size < maxX || z0 + size < maxZ) size *= 2;

  // vertices shared between the pieces of this polygon (keyed to the centimetre)
  const shared = new Map();
  const vertex = (p) => {
    const key = (Math.round(p.x * 100) + 4e5) * 1e6 + Math.round(p.z * 100) + 4e5;
    let v = shared.get(key);
    if (v === undefined) {
      v = out.pos.length / 3;
      shared.set(key, v);
      out.pos.push(p.x, ground(p.x, p.z) + offset, p.z);
      normal(p.x, p.z, _n);
      out.nrm.push(_n.x, _n.y, _n.z);
    }
    return v;
  };
  const emit = (piece) => {
    const tris = earClip(piece);
    if (!tris.length) return;
    const ids = piece.map(vertex);
    for (let t = 0; t < tris.length; t += 3) {
      const a = ids[tris[t]], b = ids[tris[t + 1]], c = ids[tris[t + 2]];
      if (a !== b && b !== c && c !== a) out.idx.push(a, b, c); // points merged to the centimetre leave slivers
    }
  };
  const flatEnough = (qx, qz, s) => {
    const h00 = ground(qx, qz), h10 = ground(qx + s, qz), h01 = ground(qx, qz + s), h11 = ground(qx + s, qz + s);
    // a triangle across the square's diagonal leaves the corners' bilinear blend by up to a quarter of their twist
    if (Math.abs(h00 - h10 - h01 + h11) / 4 > TOL) return false;
    const n = Math.min(4, s / MIN_LEAF); // the height field's own samples, at most 5 x 5
    for (let b = 0; b <= n; b++) {
      for (let a = 0; a <= n; a++) {
        const u = a / n, v = b / n;
        const plane = (h00 * (1 - u) + h10 * u) * (1 - v) + (h01 * (1 - u) + h11 * u) * v;
        if (Math.abs(ground(qx + u * s, qz + v * s) - plane) > TOL) return false;
      }
    }
    return true;
  };
  // each square clips its parent's piece (the same as clipping the whole ring, for a fraction of the points)
  const visit = (parent, qx, qz, s) => {
    const piece = clipToRect(parent, qx, qz, qx + s, qz + s);
    if (piece.length < 3) return;
    if (s > MIN_LEAF && (s > MAX_LEAF || !flatEnough(qx, qz, s))) {
      const h = s / 2;
      visit(piece, qx, qz, h);
      visit(piece, qx + h, qz, h);
      visit(piece, qx, qz + h, h);
      visit(piece, qx + h, qz + h, h);
      return;
    }
    emit(piece);
  };
  visit(ccw, x0, z0, size);
  return out;
}

function wall(ring, ground, bottom, top, out) {
  const ccw = signedArea(ring) < 0 ? ring : ring.slice().reverse();
  for (let i = 0; i < ccw.length; i++) {
    const a = ccw[i], b = ccw[(i + 1) % ccw.length];
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) continue;
    // outward = right of the direction of travel for a counter-clockwise ring (seen from above, north up)
    const nx = -dz / len, nz = dx / len;
    const ga = ground(a.x, a.z), gb = ground(b.x, b.z);
    const base = out.pos.length / 3;
    out.pos.push(a.x, ga + bottom, a.z, b.x, gb + bottom, b.z, b.x, gb + top, b.z, a.x, ga + top, a.z);
    for (let k = 0; k < 4; k++) out.nrm.push(nx, 0, nz);
    out.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return out;
}

window.NYC.Drape = { polygon, wall, densify, earClip, clipToRect, signedArea, TOL, MIN_LEAF };
})();
