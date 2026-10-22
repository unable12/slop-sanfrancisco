// tools/road-corridor.mjs — the roadway as the curbs define it (P2.5 masses are kept out of it): a point lies in the road
// corridor when it is outside every curb island but within NEAR m of one (further out the curb data has a gap: the
// 2016 curbs miss some blocks of SoMa, Transbay and the north Embarcadero, see PLAN.md P1-3). `roadDepth(x, z)` is
// how far into the corridor the point is: 0 on a curb island, its distance to the nearest curb otherwise, Infinity
// beyond NEAR.
export const NEAR = 6;
const CELL = 32;

export function roadCorridor(blockRings) {
  const grid = new Map();
  for (const ring of blockRings) {
    if (ring.length < 3) continue;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    for (let gx = Math.floor((x0 - NEAR) / CELL); gx <= Math.floor((x1 + NEAR) / CELL); gx++) {
      for (let gz = Math.floor((z0 - NEAR) / CELL); gz <= Math.floor((z1 + NEAR) / CELL); gz++) {
        const k = gx * 100000 + gz;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push({ ring, x0, x1, z0, z1 });
      }
    }
  }
  const inside = (ring, x, z) => {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, az] = ring[i], [bx, bz] = ring[j];
      if ((az > z) !== (bz > z) && x < ((bx - ax) * (z - az)) / (bz - az) + ax) c = !c;
    }
    return c;
  };
  return function roadDepth(x, z) {
    const list = grid.get(Math.floor(x / CELL) * 100000 + Math.floor(z / CELL)) || [];
    let d = Infinity;
    for (const b of list) {
      if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && inside(b.ring, x, z)) return 0;
      const r = b.ring;
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const [ax, az] = r[j], [bx, bz] = r[i];
        const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
        d = Math.min(d, Math.hypot(ax + t * dx - x, az + t * dz - z));
      }
    }
    return d <= NEAR ? d : Infinity;
  };
}
