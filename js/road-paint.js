(function () {
// js/road-paint.js
// Road markings generated from the drivable road network (js/road-network.js), so the paint matches where traffic
// actually drives and stops: dashed lane lines, double yellow centre lines on two-way roads, stop bars and continental
// crosswalks (curb to curb, where traffic.js walks its pedestrians) at the junctions with signals or stop signs, and
// green bike lanes where the DataSF Bike Network has class II lanes or class IV separated ones (GEO.bikeways, P4.4:
// along both curbs, or along the curb on the right of a one-way lane's travel; a white buffer line on buffered ones);
// and the track beds and rails of the surface rail lines, with the cable slot along the cable-car lines. Every strip is a ribbon draped on the terrain
// (js/terrain.js), a vertex pair every metre.

const { THREE, CROSSWALK, createRoadPaintMaterial, blockAt } = window.NYC;

const WHITE = new THREE.Color(0xe6e2d6);
const YELLOW = new THREE.Color(0xe8ad22);
const GREEN = new THREE.Color(0x2a8a4e);
const STEEL = new THREE.Color(0x8d8f91);
const TRACK_BED = new THREE.Color(0x4d4a45);
const SLOT = new THREE.Color(0x141414);
const GAUGE = 1.435; // standard gauge, between the rails' centres (near enough)
const HEIGHT = 0.012; // above the asphalt
const STEP = 1; // metres between the vertex pairs of a strip

function buildRoadPaint(scene, network) {
  const position = [];
  const normal = [];
  const side = [];
  const paint = [];
  const colors = [];
  const index = [];
  const T = window.NYC.Terrain;
  const loaded = T && T.loaded;
  const n = { x: 0, y: 1, z: 0 };

  // Strip w wide from a to b, with a dash pattern (period, duty cycle) running along it, on the ground (and on the curb
  // islands' tops, `onIslands`)
  function strip(ax, az, bx, bz, w, col, period = 1, duty = 1, onIslands = false, lift = 0) {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.05) return;
    const sx = ((az - bz) / len) * w * 0.5;
    const sz = ((bx - ax) / len) * w * 0.5;
    const steps = Math.max(1, Math.ceil(len / STEP));
    const i0 = position.length / 3;
    for (let k = 0; k <= steps; k++) {
      const u = (len * k) / steps;
      const x = ax + ((bx - ax) * k) / steps;
      const z = az + ((bz - az) * k) / steps;
      for (const s of [-1, 1]) {
        const px = x + sx * s, pz = z + sz * s;
        const island = onIslands && blockAt(px, pz) ? window.NYC.CURB_H : 0;
        position.push(px, (loaded ? T.groundAt(px, pz) : 0) + island + HEIGHT + lift, pz);
        if (loaded) T.normalAt(px, pz, n);
        normal.push(n.x, n.y, n.z);
        side.push(sx * s, sz * s);
        paint.push(u, period, duty);
        colors.push(col.r, col.g, col.b);
      }
      if (k > 0) {
        const i = i0 + 2 * (k - 1);
        index.push(i, i + 1, i + 3, i, i + 3, i + 2);
      }
    }
  }
  // How far the roadway reaches either side of the point s along edge e (to the first curb island), like the
  // crosswalk tracks of traffic.js: [left, right]
  function curbs(e, s) {
    const x = e.sx + e.dx * s, z = e.sz + e.dz * s;
    const reach = (dir) => {
      for (let r = 0; r < e.half + 8; r += 0.25) if (blockAt(x + e.rx * r * dir, z + e.rz * r * dir)) return r;
      return e.half;
    };
    return [reach(-1), reach(1)];
  }

  // Edges run between stop lines; s is measured from the start one and o to the right of the centre line
  const at = (e, s, o) => [e.sx + e.dx * s + e.rx * o, e.sz + e.dz * s + e.rz * o];
  const along = (e, o, w, col, period, duty) => strip(...at(e, 0.9, o), ...at(e, e.len - 0.9, o), w, col, period, duty);
  const across = (e, s, o0, o1, w, col, period, duty) => strip(...at(e, s, o0), ...at(e, s, o1), w, col, period, duty);

  // Bike lanes (GEO.bikeways) by 16 m grid cell, segment by segment, to find the one running along a road
  const BIKE_CELL = 16;
  const bikeGrid = new Map();
  for (const b of window.NYC.GEO.bikeways || []) {
    for (let i = 2; i < b.pts.length; i += 2) {
      const ax = b.pts[i - 2], az = b.pts[i - 1], bx = b.pts[i], bz = b.pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.5) continue;
      const seg = { b, ax, az, ux: (bx - ax) / L, uz: (bz - az) / L, L };
      for (let t = 0; t <= L; t += BIKE_CELL / 2) {
        const k = Math.floor((ax + seg.ux * t) / BIKE_CELL) * 100000 + Math.floor((az + seg.uz * t) / BIKE_CELL);
        if (!bikeGrid.has(k)) bikeGrid.set(k, new Set());
        bikeGrid.get(k).add(seg);
      }
    }
  }
  // the bike lane along edge e: its segments within 4 m of e's centreline at a quarter, half & three quarters, running
  // within 25 degrees of it (at two of the three); with the drawing direction's sign against e
  function bikewayAlong(e) {
    const hits = new Map();
    for (const f of [0.25, 0.5, 0.75]) {
      const [x, z] = at(e, e.len * f, 0);
      const seen = new Set();
      for (const seg of bikeGrid.get(Math.floor(x / BIKE_CELL) * 100000 + Math.floor(z / BIKE_CELL)) || []) {
        if (seen.has(seg.b)) continue;
        const dot = seg.ux * e.dx + seg.uz * e.dz;
        if (Math.abs(dot) < 0.9) continue;
        const t = Math.max(0, Math.min(seg.L, (x - seg.ax) * seg.ux + (z - seg.az) * seg.uz));
        if (Math.hypot(seg.ax + seg.ux * t - x, seg.az + seg.uz * t - z) > 4) continue;
        seen.add(seg.b);
        const h = hits.get(seg.b) || { n: 0, sign: Math.sign(dot) };
        h.n++;
        hits.set(seg.b, h);
      }
    }
    for (const [b, h] of hits) if (h.n >= 2) return { b, sign: h.sign };
    return null;
  }

  // The one or two directed edges of each road between a pair of intersections
  let bikeLanes = 0;
  const roads = new Map();
  for (const e of network.edges) {
    if (e.bore) continue; // paint is draped on the terrain: tunnels and bridges have their own (grade-separation.js)
    const key = Math.min(e.from.id, e.to.id) * 65536 + Math.max(e.from.id, e.to.id);
    if (roads.has(key)) roads.get(key).push(e);
    else roads.set(key, [e]);
  }

  for (const [e, back] of roads.values()) {
    // Lanes of both directions, measured to the right of e, left to right
    const lanes = e.lanes.map((o) => ({ o, dir: 1 }));
    if (back) for (const o of back.lanes) lanes.push({ o: -o, dir: -1 });
    lanes.sort((p, q) => p.o - q.o);

    // Dashed white between lanes going the same way, double yellow between opposing ones
    // (nothing across a median or a lane closed off by an obstacle)
    for (let k = 0; k + 1 < lanes.length; k++) {
      const p = lanes[k];
      const q = lanes[k + 1];
      if (q.o - p.o > 4.5) continue;
      const mid = (p.o + q.o) / 2;
      if (p.dir === q.dir) {
        along(e, mid, 0.13, WHITE, 12, 0.25);
      } else {
        along(e, mid - 0.12, 0.11, YELLOW);
        along(e, mid + 0.12, 0.11, YELLOW);
      }
    }

    // Bike lanes: a 1.6 m green lane with white edge lines, outside a 2.4 m parking lane (class II, where it fits
    // beside the traffic lanes) or against the curb (class IV, separated); a buffered one gets a line 0.9 m further in
    const bike = bikewayAlong(e);
    if (bike) {
      const curbR = e.half, curbL = -(back ? back.half : e.half);
      // a one-way bike lane runs on the right of its travel: travel along e when the drawing runs with e and side is 1
      const sides = bike.b.side === 0 ? [1, -1] : [bike.b.side * bike.sign > 0 ? 1 : -1];
      for (const sign of sides) {
        const curb = sign > 0 ? curbR : curbL;
        const outer = sign > 0 ? lanes[lanes.length - 1].o : lanes[0].o; // the traffic lane nearest this curb
        let c = curb - sign * (bike.b.cls === 4 ? 1.1 : 3.2);
        if ((c - outer) * sign < 2.4) c = curb - sign * 1.1;
        if ((c - outer) * sign < 1.6) continue; // no room beside the traffic
        along(e, c, 1.6, GREEN);
        along(e, c - sign * 0.86, 0.12, WHITE);
        along(e, c + sign * 0.86, 0.12, WHITE);
        if (bike.b.buffered && (c - sign * 1.76 - outer) * sign > 1.2) along(e, c - sign * 1.76, 0.12, WHITE);
        bikeLanes++;
      }
    }

    // Stop bars across the lanes arriving at a signal or a stop sign, from the centre line (or median) to the curb
    const controlled = (node, f) => node.signal || (f && f.stop);
    for (const f of back ? [e, back] : [e]) {
      if (!controlled(f.to, f)) continue;
      const left = back ? Math.max(0, f.lanes[0] - 1.8) : -f.half;
      across(f, f.len - 0.35, left + 0.1, f.half - 0.1, 0.45, WHITE);
    }

    // Continental crosswalks curb to curb, between the stop lines and the junctions with signals or stop signs
    if (e.from.signal || e.from.stop) {
      const [l, r] = curbs(e, -CROSSWALK / 2);
      across(e, -CROSSWALK / 2, -l, r, CROSSWALK - 0.3, WHITE, 1.2, 0.5);
    }
    if (e.to.signal || e.to.stop) {
      const [l, r] = curbs(e, e.len + CROSSWALK / 2);
      across(e, e.len + CROSSWALK / 2, -l, r, CROSSWALK - 0.3, WHITE, 1.2, 0.5);
    }
  }

  // Surface rail (GEO.rail, P3.4): a track bed and two rails along each line, on the street or its rail median
  for (const r of window.NYC.GEO.rail || []) {
    for (let i = 2; i < r.pts.length; i += 2) {
      const [ax, az, bx, bz] = [r.pts[i - 2], r.pts[i - 1], r.pts[i], r.pts[i + 1]];
      const L = Math.hypot(bx - ax, bz - az) || 1, ox = (az - bz) / L, oz = (bx - ax) / L;
      strip(ax, az, bx, bz, 2.6, TRACK_BED, 1, 1, true);
      for (const s of [-GAUGE / 2, GAUGE / 2]) strip(ax + ox * s, az + oz * s, bx + ox * s, bz + oz * s, 0.08, STEEL, 1, 1, true, 0.004);
    }
  }

  // The cable cars' slot between their rails (GEO.transit cable-car runs, P4.6): a dark line down the track's middle
  for (const t of window.NYC.GEO.transit || []) {
    if (t.kind !== 'cablecar') continue;
    for (let i = 2; i < t.pts.length; i += 2) strip(t.pts[i - 2], t.pts[i - 1], t.pts[i], t.pts[i + 1], 0.05, SLOT, 1, 1, true, 0.006);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('side', new THREE.Float32BufferAttribute(side, 2));
  geometry.setAttribute('paint', new THREE.Float32BufferAttribute(paint, 3));
  geometry.setIndex(index);

  const mesh = new THREE.Mesh(geometry, createRoadPaintMaterial());
  mesh.name = 'RoadMarkings';
  mesh.receiveShadow = true;
  mesh.renderOrder = -1; // under the other see-through ground effects (contact shadows, headlight beams)
  scene.add(mesh);
  console.info(`[paint] ${bikeLanes} bike lanes along ${roads.size} roads`);
  return mesh;
}

Object.assign(window.NYC, { buildRoadPaint });
})();
