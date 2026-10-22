(function () {
// js/road-paint.js
// Road markings generated from the drivable road network (js/road-network.js), so the paint matches where traffic
// actually drives and stops: dashed lane lines, double yellow centre lines on two-way roads, stop bars and continental
// crosswalks (curb to curb, where traffic.js walks its pedestrians) at the junctions with signals or stop signs, and
// green bike lanes along wide one-way roads. Every strip is a ribbon draped on the terrain (js/terrain.js), a vertex
// pair every metre.

const { THREE, CROSSWALK, createRoadPaintMaterial, blockAt } = window.NYC;

const WHITE = new THREE.Color(0xe6e2d6);
const YELLOW = new THREE.Color(0xe8ad22);
const GREEN = new THREE.Color(0x2a8a4e);
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

  // Strip w wide from a to b, with a dash pattern (period, duty cycle) running along it, on the ground
  function strip(ax, az, bx, bz, w, col, period = 1, duty = 1) {
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
        position.push(px, (loaded ? T.groundAt(px, pz) : 0) + HEIGHT, pz);
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

  // The one or two directed edges of each road between a pair of intersections
  const roads = new Map();
  for (const e of network.edges) {
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

    // Wide one-way avenues: edge line, then a buffer and a green bike lane along the curb on the side left free
    if (!back && e.axis === 'ave' && lanes.length >= 4) {
      for (const [edge, sign] of [[lanes[lanes.length - 1].o + 1.8, 1], [lanes[0].o - 1.8, -1]]) {
        const curb = sign * e.half;
        if ((curb - edge) * sign < 3.5) continue;
        along(e, edge + sign * 0.2, 0.13, WHITE);
        along(e, curb - sign * 2.4, 0.13, WHITE);
        along(e, curb - sign * 1.3, 2.0, GREEN);
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
  return mesh;
}

Object.assign(window.NYC, { buildRoadPaint });
})();
