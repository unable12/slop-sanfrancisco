(function () {
// js/grade-separation.js
// Roads off the ground (P3.3):
// - Tunnels (Broadway, Stockton): the road network's tunnel edges (road-network.js spans(): straight between the portals'
//   ground, under the hill, which isn't cut) get a dark box bore with ceiling lights and lane lines, masonry portals and
//   wall colliders. AI traffic drives them; pedestrians don't.
// - Street bridges over the water (Mission Creek's 3rd and 4th St bridges; the bare-earth DEM has none): a deck between
//   the banks with parapets and piers down into the water.
// - Freeways and their ramps (I-80, US-101, I-280): decks on columns every COLUMN_STEP m. OSM says which stretches are
//   bridges and their `layer`, not how high: the deck stands DECK_H_ESTIMATE[layer] m over the ground (an estimate,
//   PLAN.md P3-3), eased along the road. Visual only for the player (they drive under them); highway traffic
//   (traffic.js createHighwayTraffic) runs on the main lines.
// Returns { group, colliders, highwayLanes, floorAt, roofAt, carveAt }: floorAt(x, z, y) is the tunnel floor or bridge
// deck at (x, z) for something at height y (null: the ground), roofAt(x, z, y) a tunnel's ceiling over it (Infinity:
// none), carveAt(x, z) how low the terrain mesh dips at a portal (null: not at all).

const { THREE, Terrain } = window.NYC;
const { createRoadSurfaceMaterial, createMarbleAshlarMaterial, boreY, edgeArc } = window.NYC;

const STEP = 2; // metres between floor height samples (and geometry stations, x2)
const LANE_HALF = 1.75;
const WALKWAY = 0.9; // tunnel ledge / bridge sidewalk beside the outer lanes
const BORE_H = 5.2; // tunnel: floor to ceiling (Bush St crosses over the Stockton Tunnel's portal 5.7 m above its road)
const PORTAL_T = 1.4; // portal headwall thickness
const LIGHT_STEP = 8;
const PARAPET_H = 1.0;
const DECK_T = 1.4; // deck thickness
const DECK_H_ESTIMATE = [0, 8, 15, 22]; // m over the ground by OSM layer (0 at grade): an ESTIMATE, the data has no heights
const DECK_GRADE = 0.05; // freeways climb at most 5% between their estimated heights
const FREEWAY_LANE = 3.6;
const COLUMN_STEP = 30;
const CARVE_SIDE = 2.4; // m beside a bore's walls the terrain mesh dips with it at the portals (a 2 m cell and more)
const FLOOR_BAND = 2.5; // a tunnel floor counts for something less than this above it; a deck for something above it less this

function buildGradeSeparation(scene, network) {
  const group = new THREE.Group();
  group.name = 'SFGradeSeparation';
  const colliders = [];
  const floors = []; // { kind, x0, z0, dx, dz, rx, rz, t0, t1, L, R, ys }
  const geo = { road: [], wall: [], ceiling: [], masonry: [], concrete: [], light: [], paint: [] };
  const ground = (x, z) => Terrain.groundAt(x, z);

  // A quad from four [x, y, z] corners (counter-clockwise seen from the side it faces)
  function quad(list, a, b, c, d) {
    list.push([...a, ...b, ...c, ...a, ...c, ...d]);
  }
  // ... and seen from the other side
  const back = (list, a, b, c, d) => quad(list, d, c, b, a);
  // An oriented box: centre (cx, cz), from y0 to y1, `along` m along (dx, dz), `across` m across
  function box(list, cx, cz, dx, dz, along, across, y0, y1) {
    const ax = (dx * along) / 2, az = (dz * along) / 2, bx = (-dz * across) / 2, bz = (dx * across) / 2;
    const c = [[cx - ax - bx, cz - az - bz], [cx + ax - bx, cz + az - bz], [cx + ax + bx, cz + az + bz], [cx - ax + bx, cz - az + bz]];
    for (let i = 0; i < 4; i++) {
      const [p, q] = [c[i], c[(i + 1) % 4]];
      back(list, [p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]]);
    }
    back(list, [c[0][0], y1, c[0][1]], [c[1][0], y1, c[1][1]], [c[2][0], y1, c[2][1]], [c[3][0], y1, c[3][1]]);
    back(list, [c[3][0], y0, c[3][1]], [c[2][0], y0, c[2][1]], [c[1][0], y0, c[1][1]], [c[0][0], y0, c[0][1]]);
  }
  // An oriented box collider (the controllers' OBB frame: local z along (dx, dz))
  function collider(cx, cz, dx, dz, along, across, minY, maxY) {
    const hz = along / 2, hx = across / 2;
    const ex = Math.abs(dz) * hx + Math.abs(dx) * hz, ez = Math.abs(dx) * hx + Math.abs(dz) * hz;
    colliders.push({ minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez, minY, maxY, obb: { cx, cz, hx, hz, cs: dz, sn: dx } });
  }

  // 1. Tunnels and street bridges, per road: an edge with the edge running the other way beside it (its partner) shares
  //    one bore or deck, as wide as both their lanes
  const done = new Set();
  const lateral = (e, x, z) => (x - e.x0) * e.rx + (z - e.z0) * e.rz;
  for (const e of network.edges) {
    if (!e.bore || done.has(e)) continue;
    done.add(e);
    const partner = network.edges.find((f) => f.bore && !done.has(f) && f.name === e.name && f.bore.kind === e.bore.kind &&
      e.dx * f.dx + e.dz * f.dz < -0.95 && Math.abs(lateral(e, f.x0, f.z0)) < 8 &&
      Math.abs((f.x0 - e.x0) * e.dx + (f.z0 - e.z0) * e.dz - e.span) < 12);
    if (partner) done.add(partner);
    const lanes = e.lanes.slice();
    if (partner) for (const o of partner.lanes) lanes.push(lateral(e, partner.x0, partner.z0) - o);
    const L = Math.min(...lanes) - LANE_HALF - WALKWAY;
    const R = Math.max(...lanes) + LANE_HALF + WALKWAY;
    // the stretch of e off the ground: arcs along its link at its two ends, the span [p0, p1] between them
    const b = e.bore;
    const s0 = Math.hypot(e.sx - e.x0, e.sz - e.z0);
    const tAt = (u) => ((u - b.a0) / (b.a1 - b.a0 || 1)) * e.span;
    const t0 = Math.max(0, Math.min(tAt(b.p0), tAt(b.p1)));
    const t1 = Math.min(e.span, Math.max(tAt(b.p0), tAt(b.p1)));
    if (t1 - t0 < 2) continue;
    // floor heights along the edge from its start node (the road's own profile, clamped to the edge's stop lines)
    const n = Math.ceil((t1 - t0) / STEP);
    const ys = new Float32Array(n + 1);
    for (let k = 0; k <= n; k++) {
      const t = Math.min(t1, t0 + k * STEP);
      ys[k] = boreY(b, edgeArc(e, t - s0)) ?? ground(e.x0 + e.dx * t, e.z0 + e.dz * t);
    }
    const seg = { kind: b.kind, x0: e.x0, z0: e.z0, dx: e.dx, dz: e.dz, rx: e.rx, rz: e.rz, t0, t1, L, R, ys };
    floors.push(seg);
    if (b.kind === 'tunnel') buildBore(seg, e, partner);
    else buildDeck(seg, e, partner);
  }

  // The point t m along a span's edge from its start node, o m to its right, dy m over its floor
  function P(seg, t, o, dy = 0) {
    const k = Math.min(seg.ys.length - 1, Math.max(0, (t - seg.t0) / STEP));
    const i = Math.min(seg.ys.length - 2, Math.floor(k));
    const y = i < 0 ? seg.ys[0] : seg.ys[i] + (seg.ys[i + 1] - seg.ys[i]) * (k - i);
    return [seg.x0 + seg.dx * t + seg.rx * o, y + dy, seg.z0 + seg.dz * t + seg.rz * o];
  }
  // stations along a span every 2 x STEP m
  function stations(seg) {
    const out = [];
    for (let t = seg.t0; t < seg.t1; t += 2 * STEP) out.push(t);
    out.push(seg.t1);
    return out;
  }
  // lane lines on a floor: dashed white between lanes going the same way, double yellow between the two directions
  function laneLines(seg, e, partner) {
    const line = (o, w, col, dash) => {
      for (let t = seg.t0 + 1; t < seg.t1 - 1; t += dash ? 12 : 4) {
        const len = Math.min(dash ? 3 : 4, seg.t1 - 1 - t);
        const a = P(seg, t, o - w / 2, 0.03), b = P(seg, t + len, o - w / 2, 0.03), c = P(seg, t + len, o + w / 2, 0.03), d = P(seg, t, o + w / 2, 0.03);
        geo.paint.push({ tri: [...a, ...d, ...c, ...a, ...c, ...b], col });
      }
    };
    const WHITE = [0.86, 0.86, 0.82], YELLOW = [0.85, 0.66, 0.12];
    for (let k = 0; k + 1 < e.lanes.length; k++) line((e.lanes[k] + e.lanes[k + 1]) / 2, 0.13, WHITE, true);
    if (partner) {
      const back = partner.lanes.map((o) => lateral(e, partner.x0, partner.z0) - o).sort((p, q) => p - q);
      for (let k = 0; k + 1 < back.length; k++) line((back[k] + back[k + 1]) / 2, 0.13, WHITE, true);
      const mid = (Math.min(...e.lanes) + Math.max(...back)) / 2;
      line(mid - 0.12, 0.1, YELLOW, false);
      line(mid + 0.12, 0.1, YELLOW, false);
    }
  }

  // A tunnel bore: floor, walls and ceiling facing in (seen from outside where the hill doesn't cover them: drawn both
  // sides), lights along the ceiling, wall colliders, and a masonry portal at each end
  function buildBore(seg, e, partner) {
    const st = stations(seg);
    for (let i = 0; i + 1 < st.length; i++) {
      const [ta, tb] = [st[i], st[i + 1]];
      quad(geo.road, P(seg, ta, seg.L), P(seg, ta, seg.R), P(seg, tb, seg.R), P(seg, tb, seg.L));
      quad(geo.wall, P(seg, ta, seg.R), P(seg, ta, seg.R, BORE_H), P(seg, tb, seg.R, BORE_H), P(seg, tb, seg.R));
      quad(geo.wall, P(seg, tb, seg.L), P(seg, tb, seg.L, BORE_H), P(seg, ta, seg.L, BORE_H), P(seg, ta, seg.L));
      quad(geo.ceiling, P(seg, ta, seg.R, BORE_H), P(seg, ta, seg.L, BORE_H), P(seg, tb, seg.L, BORE_H), P(seg, tb, seg.R, BORE_H));
      const len = tb - ta, tm = (ta + tb) / 2;
      for (const o of [seg.L - 0.3, seg.R + 0.3]) {
        const [cx, y, cz] = P(seg, tm, o);
        collider(cx, cz, seg.dx, seg.dz, len + 0.5, 0.6, y - 1, y + BORE_H);
      }
    }
    for (let t = seg.t0 + LIGHT_STEP / 2; t < seg.t1; t += LIGHT_STEP) {
      for (const o of [seg.L + (seg.R - seg.L) * 0.3, seg.L + (seg.R - seg.L) * 0.7]) {
        const [cx, y, cz] = P(seg, t, o, BORE_H - 0.06);
        box(geo.light, cx, cz, seg.dx, seg.dz, 2.4, 0.25, y - 0.08, y);
      }
    }
    laneLines(seg, e, partner);
    // portals: piers either side and a lintel up to the hill's surface over the opening (at least 2.5 m)
    for (const t of [seg.t0, seg.t1]) {
      const [cx, y, cz] = P(seg, t, (seg.L + seg.R) / 2);
      const w = seg.R - seg.L;
      let top = y + BORE_H + 2.5;
      for (const o of [seg.L, (seg.L + seg.R) / 2, seg.R]) {
        const [px, , pz] = P(seg, t, o);
        top = Math.max(top, ground(px, pz) + 0.5);
      }
      top = Math.min(top, y + BORE_H + 12);
      box(geo.masonry, cx, cz, seg.dx, seg.dz, PORTAL_T, w + 2 * CARVE_SIDE, y + BORE_H, top);
      for (const o of [seg.L - CARVE_SIDE / 2, seg.R + CARVE_SIDE / 2]) {
        const [px, , pz] = P(seg, t, o);
        box(geo.masonry, px, pz, seg.dx, seg.dz, PORTAL_T, CARVE_SIDE, y - 1.5, top);
        collider(px, pz, seg.dx, seg.dz, PORTAL_T, CARVE_SIDE, y - 1, top);
      }
    }
  }

  // A bridge deck over the water: road, sidewalks' parapets, the slab's sides and underside, piers every COLUMN_STEP m
  function buildDeck(seg, e, partner) {
    const st = stations(seg);
    for (let i = 0; i + 1 < st.length; i++) {
      const [ta, tb] = [st[i], st[i + 1]];
      quad(geo.road, P(seg, ta, seg.L), P(seg, ta, seg.R), P(seg, tb, seg.R), P(seg, tb, seg.L));
      quad(geo.concrete, P(seg, ta, seg.R, -DECK_T), P(seg, ta, seg.L, -DECK_T), P(seg, tb, seg.L, -DECK_T), P(seg, tb, seg.R, -DECK_T));
      quad(geo.concrete, P(seg, ta, seg.R, -DECK_T), P(seg, tb, seg.R, -DECK_T), P(seg, tb, seg.R), P(seg, ta, seg.R));
      quad(geo.concrete, P(seg, tb, seg.L, -DECK_T), P(seg, ta, seg.L, -DECK_T), P(seg, ta, seg.L), P(seg, tb, seg.L));
      const len = tb - ta, tm = (ta + tb) / 2;
      for (const o of [seg.L + 0.15, seg.R - 0.15]) {
        const [cx, y, cz] = P(seg, tm, o);
        box(geo.concrete, cx, cz, seg.dx, seg.dz, len + 0.02, 0.3, y, y + PARAPET_H);
        collider(cx, cz, seg.dx, seg.dz, len + 0.5, 0.3, y - 1, y + PARAPET_H);
      }
    }
    for (let t = seg.t0 + COLUMN_STEP / 2; t < seg.t1; t += COLUMN_STEP) {
      const [cx, y, cz] = P(seg, t, (seg.L + seg.R) / 2);
      if (Terrain.heightAt(cx, cz) > Terrain.waterLevel + 0.05) continue;
      box(geo.concrete, cx, cz, seg.dx, seg.dz, 1.6, seg.R - seg.L - 1, Terrain.waterLevel - 2, y - DECK_T);
    }
    laneLines(seg, e, partner);
  }

  // 2. Freeways and ramps (GEO.roadGraph.decks), drawn from the centreline graph
  const highwayLanes = buildFreeways();
  function buildFreeways() {
    const RG = window.NYC.GEO.roadGraph;
    if (!RG || !RG.decks) return [];
    const node = (i) => ({ x: RG.nodes[2 * i], z: RG.nodes[2 * i + 1] });
    const ways = RG.decks.map(([li, layers]) => {
      const [a, b, , , lanes, dir, inner, flags] = RG.links[li];
      const pts = [node(a)];
      for (let k = 0; k < inner.length; k += 2) pts.push({ x: inner[k], z: inner[k + 1] });
      pts.push(node(b));
      // layers where OSM had no matching way: the nearest matched point's
      const lay = layers.map((v, k) => {
        if (v >= 0) return v;
        for (let d = 1; d < layers.length; d++) for (const j of [k - d, k + d]) if (layers[j] >= 0) return layers[j];
        return 0;
      });
      return { li, a, b, lanes: Math.max(1, lanes), dir, ramp: (flags & 4) !== 0, pts, target: pts.map((p, k) => ground(p.x, p.z) + DECK_H_ESTIMATE[Math.min(3, lay[k])]) };
    });
    // a junction's height: the highest any freeway meeting there wants, so the decks meet; a ramp meets a street on
    // the ground
    const street = new Set();
    RG.links.forEach(([a, b, , , , , , flags]) => { if (!(flags & 1)) street.add(a).add(b); });
    const nodeY = new Map();
    for (const w of ways) {
      nodeY.set(w.a, Math.max(nodeY.get(w.a) ?? -Infinity, w.target[0]));
      nodeY.set(w.b, Math.max(nodeY.get(w.b) ?? -Infinity, w.target[w.target.length - 1]));
    }
    for (const i of nodeY.keys()) if (street.has(i)) nodeY.set(i, ground(node(i).x, node(i).z));
    for (const w of ways) {
      // dense stations every 2 x STEP m with the target heights, the ends at their junctions', then eased: a few
      // passes of a moving average, and at most DECK_GRADE either way from each end
      const dense = [];
      for (let k = 0; k + 1 < w.pts.length; k++) {
        const p = w.pts[k], q = w.pts[k + 1];
        const L = Math.hypot(q.x - p.x, q.z - p.z), m = Math.max(1, Math.ceil(L / (2 * STEP)));
        for (let i = 0; i < m; i++) dense.push({ x: p.x + ((q.x - p.x) * i) / m, z: p.z + ((q.z - p.z) * i) / m, y: w.target[k] + ((w.target[k + 1] - w.target[k]) * i) / m });
      }
      const last = w.pts[w.pts.length - 1];
      dense.push({ x: last.x, z: last.z, y: w.target[w.target.length - 1] });
      dense[0].y = nodeY.get(w.a);
      dense[dense.length - 1].y = nodeY.get(w.b);
      for (let pass = 0; pass < 6; pass++) {
        for (let i = 1; i + 1 < dense.length; i++) dense[i].y = (dense[i - 1].y + dense[i].y + dense[i + 1].y) / 3;
      }
      for (let i = 1; i < dense.length; i++) dense[i].s = Math.hypot(dense[i].x - dense[i - 1].x, dense[i].z - dense[i - 1].z);
      for (let i = 1; i + 1 < dense.length; i++) dense[i].y = Math.min(dense[i].y, dense[i - 1].y + DECK_GRADE * dense[i].s);
      for (let i = dense.length - 2; i > 0; i--) dense[i].y = Math.min(dense[i].y, dense[i + 1].y + DECK_GRADE * dense[i + 1].s);
      for (const d of dense) d.y = Math.max(d.y, ground(d.x, d.z) + 0.05);
      w.dense = dense;
      const width = w.lanes * FREEWAY_LANE + 2;
      w.half = width / 2;
      let sinceColumn = COLUMN_STEP / 2;
      for (let i = 0; i + 1 < dense.length; i++) {
        const p = dense[i], q = dense[i + 1];
        const L = Math.hypot(q.x - p.x, q.z - p.z) || 1;
        const dx = (q.x - p.x) / L, dz = (q.z - p.z) / L, rx = -dz, rz = dx;
        const gp = p.y - ground(p.x, p.z), gq = q.y - ground(q.x, q.z);
        if (gp < 0.6 && gq < 0.6) continue; // at grade: the terrain is its road
        const h = width / 2;
        const at = (r, o, dy = 0) => [r.x + rx * o, r.y + dy, r.z + rz * o];
        quad(geo.road, at(p, -h), at(p, h), at(q, h), at(q, -h));
        quad(geo.concrete, at(p, h, -DECK_T), at(p, -h, -DECK_T), at(q, -h, -DECK_T), at(q, h, -DECK_T));
        quad(geo.concrete, at(p, h, -DECK_T), at(q, h, -DECK_T), at(q, h), at(p, h));
        quad(geo.concrete, at(q, -h, -DECK_T), at(p, -h, -DECK_T), at(p, -h), at(q, -h));
        for (const o of [-h + 0.15, h - 0.15]) {
          const [cx, , cz] = at({ x: (p.x + q.x) / 2, y: 0, z: (p.z + q.z) / 2 }, o);
          box(geo.concrete, cx, cz, dx, dz, L + 0.05, 0.3, (p.y + q.y) / 2, (p.y + q.y) / 2 + PARAPET_H);
        }
        sinceColumn += L;
        if (sinceColumn >= COLUMN_STEP && Math.min(gp, gq) > 3.5) {
          sinceColumn = 0;
          const g = ground(q.x, q.z);
          for (const o of width > 14 ? [-width / 4, width / 4] : [0]) {
            const [cx, , cz] = at(q, o);
            box(geo.concrete, cx, cz, dx, dz, 1.6, 1.6, g - 0.5, q.y - DECK_T);
            collider(cx, cz, dx, dz, 1.6, 1.6, g - 1, q.y - DECK_T);
          }
        }
      }
    }
    // Highway traffic on the main lines: chains of freeway links (not ramps) end to end, going on straightest
    const lanes = [];
    const byStart = new Map();
    for (const w of ways) if (!w.ramp && w.dir !== 0) byStart.set(w.dir > 0 ? w.a : w.b, [...(byStart.get(w.dir > 0 ? w.a : w.b) || []), w]);
    const used = new Set();
    const along = (w) => (w.dir > 0 ? w.dense : w.dense.slice().reverse());
    const hasIn = new Set();
    for (const w of ways) if (!w.ramp && w.dir !== 0) hasIn.add(w.dir > 0 ? w.b : w.a);
    const starts = ways.filter((w) => !w.ramp && w.dir !== 0 && !hasIn.has(w.dir > 0 ? w.a : w.b));
    for (const first of [...starts, ...ways.filter((w) => !w.ramp && w.dir !== 0)]) {
      if (used.has(first)) continue;
      const chain = [];
      let w = first;
      while (w && !used.has(w)) {
        used.add(w);
        chain.push(...(chain.length ? along(w).slice(1) : along(w)));
        const end = w.dir > 0 ? w.b : w.a;
        const d = along(w), p = d[d.length - 2], q = d[d.length - 1];
        const L = Math.hypot(q.x - p.x, q.z - p.z) || 1;
        let best = null, bd = 0.7;
        for (const n of byStart.get(end) || []) {
          if (used.has(n)) continue;
          const e = along(n), dot = ((e[1].x - e[0].x) * (q.x - p.x) + (e[1].z - e[0].z) * (q.z - p.z)) / ((Math.hypot(e[1].x - e[0].x, e[1].z - e[0].z) || 1) * L);
          if (dot > bd) { bd = dot; best = n; }
        }
        w = best;
      }
      let len = 0;
      for (let i = 1; i < chain.length; i++) len += Math.hypot(chain[i].x - chain[i - 1].x, chain[i].z - chain[i - 1].z);
      if (len < 300) continue;
      const n = first.lanes;
      for (let k = 0; k < n; k++) {
        const o = (k - (n - 1) / 2) * FREEWAY_LANE;
        const pts = chain.map((c, i) => {
          const a = chain[Math.max(0, i - 1)], b = chain[Math.min(chain.length - 1, i + 1)];
          const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
          const x = c.x - ((b.z - a.z) / L) * o, z = c.z + ((b.x - a.x) / L) * o;
          return new THREE.Vector3(x, Math.max(c.y, ground(x, z)) + 0.02, z); // (at grade, on the cross slope)
        });
        lanes.push({ pts, speed: 24 + k * 1.5 });
      }
    }
    return lanes;
  }

  // 3. Meshes: one per material
  const mat = {
    road: createRoadSurfaceMaterial(),
    wall: new THREE.MeshStandardNodeMaterial({ color: 0xb8b3a6, roughness: 0.55, metalness: 0.0, side: THREE.DoubleSide }),
    ceiling: new THREE.MeshStandardNodeMaterial({ color: 0x34322e, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide }),
    masonry: createMarbleAshlarMaterial(),
    concrete: new THREE.MeshStandardNodeMaterial({ color: 0x9a958b, roughness: 0.86, metalness: 0.0 }),
    light: new THREE.MeshBasicNodeMaterial({ color: 0xfff1d6 })
  };
  for (const [key, tris] of Object.entries(geo)) {
    if (key === 'paint' || !tris.length) continue;
    const pos = new Float32Array(tris.flat());
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, mat[key]);
    mesh.name = `SFGradeSeparation_${key}`;
    mesh.castShadow = key !== 'light' && key !== 'road';
    mesh.receiveShadow = key !== 'light';
    group.add(mesh);
  }
  if (geo.paint.length) {
    const pos = new Float32Array(geo.paint.flatMap((p) => p.tri));
    const col = new Float32Array(geo.paint.flatMap((p) => [...p.col, ...p.col, ...p.col, ...p.col, ...p.col, ...p.col]));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.0 }));
    mesh.name = 'SFGradeSeparation_paint';
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  scene.add(group);
  for (const key of Object.keys(geo)) geo[key] = null; // (the floor lookups below keep this scope alive)

  // 4. Floors: the tunnel floor under something in the bore, the deck under something on the bridge
  function find(x, z, y) {
    for (const s of floors) {
      const px = x - s.x0, pz = z - s.z0;
      const t = px * s.dx + pz * s.dz;
      if (t < s.t0 - 0.5 || t > s.t1 + 0.5) continue;
      const o = px * s.rx + pz * s.rz;
      if (o < s.L || o > s.R) continue;
      const k = Math.min(s.ys.length - 1, Math.max(0, (t - s.t0) / STEP));
      const i = Math.min(s.ys.length - 2, Math.floor(k));
      const fy = i < 0 ? s.ys[0] : s.ys[i] + (s.ys[i + 1] - s.ys[i]) * (k - i);
      if (s.kind === 'tunnel' ? y < fy + FLOOR_BAND : y > fy - FLOOR_BAND) return { s, fy };
    }
    return null;
  }
  const floorAt = (x, z, y) => {
    const f = find(x, z, y);
    return f ? f.fy : null;
  };
  const roofAt = (x, z, y) => {
    const f = find(x, z, y);
    return f && f.s.kind === 'tunnel' ? f.fy + BORE_H : Infinity;
  };
  // The terrain mesh dips under a bore where the hill's surface comes down into it (terrain-mesh.js): the portals'
  // mouths stay open; deeper in, the hill covers the bore as it is
  const carveAt = (x, z) => {
    for (const s of floors) {
      if (s.kind !== 'tunnel') continue;
      const px = x - s.x0, pz = z - s.z0;
      const t = px * s.dx + pz * s.dz;
      if (t < s.t0 || t > s.t1) continue;
      const o = px * s.rx + pz * s.rz;
      if (o < s.L - CARVE_SIDE || o > s.R + CARVE_SIDE) continue;
      const fy = s.ys[Math.min(s.ys.length - 1, Math.round((t - s.t0) / STEP))];
      if (Terrain.groundAt(x, z) < fy + BORE_H + 0.3) return fy - 0.5;
    }
    return null;
  };
  const counts = { tunnels: floors.filter((f) => f.kind === 'tunnel').length, bridges: floors.filter((f) => f.kind === 'bridge').length };
  console.info(`[grade] ${counts.tunnels} tunnel bores, ${counts.bridges} bridge decks, ${highwayLanes.length} highway lanes, ${colliders.length} colliders`);
  return { group, colliders, highwayLanes, floorAt, roofAt, carveAt };
}

Object.assign(window.NYC, { buildGradeSeparation, DECK_H_ESTIMATE });
})();
