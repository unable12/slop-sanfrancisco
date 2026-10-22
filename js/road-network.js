(function () {
// js/road-network.js
// Drivable road graph from San Francisco's street centreline graph (GEO.roadGraph, tools/geo-roadgraph.mjs): lanes by
// each street's real width, lane count and direction of travel, kept clear of the curb islands, medians and obstacles;
// junctions controlled by the real traffic signals and stop signs (DataSF); the lane-to-lane curves used to drive
// straight through them or turn; and every edge's height profile over the terrain (js/terrain.js), so traffic drives
// the hills (edgeY, edgeGrade, curveY).
//
// Conventions: north = -z, east = +x. Every directed edge has a unit direction (dx, dz) and a right normal
// (rx, rz) = (-dz, dx). Lanes are lateral offsets to the right of the centreline, sorted left to right.

const CELL = 32;
const LANE_CLEAR = 1.2; // half width each lane keeps free of obstacles
const CROSSWALK = 2.5; // depth between an intersection box and its stop lines
const SHORE_MARGIN = 1; // metres of land kept between a lane and the bay (the terrain says exactly where it is)
const LANE_W = 3.4; // metres per lane
const JUNCTION_MERGE = 8; // centreline links shorter than this join their two junctions into one (see 4b)
const PROFILE_STEP = 2; // metres between the height samples along an edge

function buildRoadNetwork(sidewalks, obstacles) {
  // 1. Spatial hash of ground footprints: curbs bound the roads, everything else also blocks pedestrians
  const hash = new Map();
  const cellKey = (ix, iz) => (ix + 512) * 1024 + iz + 512;

  function insert(r) {
    for (let ix = Math.floor(r.minX / CELL); ix <= Math.floor(r.maxX / CELL); ix++) {
      for (let iz = Math.floor(r.minZ / CELL); iz <= Math.floor(r.maxZ / CELL); iz++) {
        const k = cellKey(ix, iz);
        if (!hash.has(k)) hash.set(k, []);
        hash.get(k).push(r);
      }
    }
  }
  for (const r of sidewalks) insert({ minX: r.minX, maxX: r.maxX, minZ: r.minZ, maxZ: r.maxZ, curb: true, block: r.block });
  for (const r of obstacles) insert(r);

  // Calls fn(rect) for every footprint overlapping the box until fn returns true
  function query(minX, maxX, minZ, maxZ, fn) {
    for (let ix = Math.floor(minX / CELL); ix <= Math.floor(maxX / CELL); ix++) {
      for (let iz = Math.floor(minZ / CELL); iz <= Math.floor(maxZ / CELL); iz++) {
        const list = hash.get(cellKey(ix, iz));
        if (!list) continue;
        for (const r of list) {
          if (r.minX < maxX && r.maxX > minX && r.minZ < maxZ && r.maxZ > minZ && fn(r)) return true;
        }
      }
    }
    return false;
  }

  // Land: the terrain above the bay at the box's corners (the bay is SHORE_MARGIN m further out than the corners need)
  const T = window.NYC.Terrain;
  const dry = (x, z) => !T || !T.loaded || T.heightAt(x, z) > T.waterLevel + 0.05;
  function onLand(minX, maxX, minZ, maxZ) {
    const m = SHORE_MARGIN;
    return dry(minX - m, minZ - m) && dry(maxX + m, minZ - m) && dry(minX - m, maxZ + m) && dry(maxX + m, maxZ + m);
  }
  // A curb island (sidewalk) under (x, z): by its real outline where it has one, else by its bounds
  const inPoly = (P, x, z) => {
    let inside = false;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      const a = P[i];
      const c = P[j];
      if ((a.z > z) !== (c.z > z) && x < ((c.x - a.x) * (z - a.z)) / (c.z - a.z) + a.x) inside = !inside;
    }
    return inside;
  };
  const curbAt = (x, z) => query(x - 0.01, x + 0.01, z - 0.01, z + 0.01, (r) => r.curb && (!r.block || inPoly(r.block.poly, x, z)));

  const walkable = (minX, maxX, minZ, maxZ) => onLand(minX, maxX, minZ, maxZ) && !query(minX, maxX, minZ, maxZ, (r) => !r.curb);
  const onSidewalk = (x, z) => curbAt(x, z);
  // The same test for the centreline streets (4b), which follow the real streets: the rectangles standing in for
  // irregular sidewalks may reach a little past their curbs, a whole park's bounds take in the streets around it and a
  // median mall's bounds (Allen St, Chrystie St...) both its roadways, so only a curb right at (x, z), median malls by
  // their real outline and other obstacles under 50 m across count
  const MEDIANS = window.NYC.BLOCKS.filter((b) => b.median);
  const medianBox = (r) => MEDIANS.some((b) => Math.abs(b.minX - r.minX) < 0.6 && Math.abs(b.maxX - r.maxX) < 0.6 && Math.abs(b.minZ - r.minZ) < 0.6 && Math.abs(b.maxZ - r.maxZ) < 0.6);
  const medianCells = new Map(); // 64 m cells -> the medians reaching into them
  for (const b of MEDIANS) {
    for (let ix = Math.floor((b.minX - 2) / 64); ix <= Math.floor((b.maxX + 2) / 64); ix++) {
      for (let iz = Math.floor((b.minZ - 2) / 64); iz <= Math.floor((b.maxZ + 2) / 64); iz++) {
        const k = ix * 100000 + iz;
        if (!medianCells.has(k)) medianCells.set(k, []);
        medianCells.get(k).push(b);
      }
    }
  }
  function nearMedian(x, z, clear) {
    for (const b of medianCells.get(Math.floor(x / 64) * 100000 + Math.floor(z / 64)) || []) {
      if (x < b.minX - clear || x > b.maxX + clear || z < b.minZ - clear || z > b.maxZ + clear) continue;
      let inside = false;
      const P = b.poly;
      for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
        const a = P[i];
        const c = P[j];
        if ((a.z > z) !== (c.z > z) && x < ((c.x - a.x) * (z - a.z)) / (c.z - a.z) + a.x) inside = !inside;
        const ex = c.x - a.x;
        const ez = c.z - a.z;
        const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / (ex * ex + ez * ez || 1)));
        if (Math.hypot(a.x + ex * t - x, a.z + ez * t - z) < clear) return true;
      }
      if (inside) return true;
    }
    return false;
  }
  const blockedOnStreet = (x, z, clear) => !onLand(x - clear, x + clear, z - clear, z + clear) ||
    curbAt(x, z) ||
    nearMedian(x, z, clear) ||
    query(x - clear, x + clear, z - clear, z + clear, (r) => !r.curb && (r.maxX - r.minX < 50 || r.maxZ - r.minZ < 50) && !medianBox(r));

  let nodes = [];

  // 4. The street centreline graph (GEO.roadGraph, tools/geo-roadgraph.mjs): junctions joined where a link between them
  //    is shorter than JUNCTION_MERGE (offset corners, divided roads); a street's bends get shape nodes, so every edge
  //    stays straight. Each run remembers its centreline link, for the stop signs facing traffic at its ends (9.)
  const RG = window.NYC.GEO.roadGraph;
  const genRuns = centrelineStreets();
  function centrelineStreets() {
    const runs = [];
    if (!RG) return runs;
    const pos = [];
    for (let i = 0; i < RG.nodes.length; i += 2) pos.push({ x: RG.nodes[i], z: RG.nodes[i + 1] });
    const links = [];
    RG.links.forEach(([a, b, ni, w, lanes, dir, inner, flags], li) => {
      // pedestrian-only & private ways carry no traffic; freeways, ramps & tunnels don't follow the ground (left out
      // until they get their own decks and bores, PLAN.md P2-10)
      if (flags & (1 | 2 | 4 | 8 | 16)) return;
      const pts = [pos[a]];
      for (let k = 0; k < inner.length; k += 2) pts.push({ x: inner[k], z: inner[k + 1] });
      pts.push(pos[b]);
      let len = 0;
      for (let k = 0; k + 1 < pts.length; k++) len += Math.hypot(pts[k + 1].x - pts[k].x, pts[k + 1].z - pts[k].z);
      links.push({ li, a, b, name: RG.names[ni], w, lanes, dir, pts, len });
    });
    const parent = pos.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (const l of links) if (l.len < JUNCTION_MERGE) parent[find(l.a)] = find(l.b);
    const sum = new Map();
    const counted = new Set();
    for (const l of links) {
      for (const i of [l.a, l.b]) {
        if (counted.has(i)) continue;
        counted.add(i);
        const r = find(i);
        const s = sum.get(r) || { x: 0, z: 0, n: 0, rg: [] };
        s.x += pos[i].x;
        s.z += pos[i].z;
        s.n++;
        s.rg.push(i);
        sum.set(r, s);
      }
    }
    const junctions = new Map();
    function junction(r) {
      if (junctions.has(r)) return junctions.get(r);
      const s = sum.get(r);
      const node = { x: s.x / s.n, z: s.z / s.n, hx: 0, hz: 0, signal: false, in: [], out: [], general: true, rg: s.rg };
      nodes.push(node);
      junctions.set(r, node);
      return node;
    }
    // Lanes from the street's own lane count (OSM `lanes`, both ways together, else from its width) and its
    // curb-to-curb width: one-way streets spread theirs across the roadway, two-way ones keep half each way, from the
    // centreline out. Wide streets (and those of 3+ lanes) are major roads (right of way, see 9.)
    function lanesOf(l) {
      const w = l.w > 3 ? l.w : 9.1;
      const half = w / 2;
      const axis = w >= 14.5 || l.lanes >= 3 ? 'ave' : 'st';
      const count = Math.max(1, Math.round(l.lanes || w / LANE_W));
      if (l.dir !== 0) {
        const n = Math.max(1, Math.min(count, Math.floor((w - 1) / 3.0)));
        const step = Math.min(LANE_W, (w - 1) / n);
        const lanes = Array.from({ length: n }, (_, k) => (k - (n - 1) / 2) * step);
        return { half, axis, fwd: l.dir > 0 ? lanes : [], back: l.dir < 0 ? lanes : [] };
      }
      const per = Math.max(1, Math.min(Math.floor(count / 2), Math.floor((half - 0.5) / 3.0)));
      const step = Math.min(LANE_W, (half - 0.5) / per);
      const each = Array.from({ length: per }, (_, k) => step * (k + 0.5));
      return { half, axis, fwd: each, back: each };
    }
    const DEG = Math.PI / 180;
    for (const l of links) {
      const A = junction(find(l.a));
      const B = junction(find(l.b));
      if (A === B) continue;
      const pts = [{ x: A.x, z: A.z }, ...l.pts.slice(1, -1), { x: B.x, z: B.z }];
      // stations along it: the ends and every bend over 12° at least 15 m from the last station and from the far end,
      // and wherever going on straight to the next point would stray over STRAY m from the street (long gentle curves:
      // The Embarcadero)
      const STRAY = 1.5;
      const stations = [A];
      let last = pts[0];
      let lastK = 0;
      let rest = l.len;
      const strays = (k2) => {
        const q = pts[k2];
        const dx = q.x - last.x, dz = q.z - last.z, L = Math.hypot(dx, dz) || 1;
        for (let m = lastK + 1; m < k2; m++) if (Math.abs((pts[m].x - last.x) * dz - (pts[m].z - last.z) * dx) / L > STRAY) return true;
        return false;
      };
      for (let k = 1; k < pts.length - 1; k++) {
        const p1 = pts[k];
        const p2 = pts[k + 1];
        const d0 = Math.hypot(p1.x - last.x, p1.z - last.z);
        rest -= Math.hypot(p1.x - pts[k - 1].x, p1.z - pts[k - 1].z);
        let turn = Math.abs(Math.atan2(p2.z - p1.z, p2.x - p1.x) - Math.atan2(p1.z - last.z, p1.x - last.x));
        if (turn > Math.PI) turn = 2 * Math.PI - turn;
        if ((turn < 12 * DEG && !strays(k + 1)) || d0 < 15 || rest < 15) continue;
        const s = { x: p1.x, z: p1.z, hx: 0, hz: 0, signal: false, in: [], out: [], general: true, shape: true, rg: [] };
        nodes.push(s);
        stations.push(s);
        last = p1;
        lastK = k;
      }
      stations.push(B);
      const lanes = lanesOf(l);
      for (let k = 0; k + 1 < stations.length; k++) {
        runs.push({
          from: stations[k], to: stations[k + 1], ...lanes, name: l.name,
          // the centreline node & link where traffic arrives at a junction: its far end going forwards, its near end
          // going back
          arriveFwd: k + 2 === stations.length ? { node: l.b, link: l.li } : null,
          arriveBack: k === 0 ? { node: l.a, link: l.li } : null
        });
      }
    }
    if (window.NYC.DEBUG_ROADS !== false) console.info(`[roads] centreline streets: ${links.length} links, ${runs.length} straight runs`);
    return runs;
  }

  // 5. Directed edges between intersections, keeping only the lanes clear of obstacles node to node
  let edges = [];
  // Streets run in any direction, so their lanes are checked for obstacles every 2.5 m (clear of the junctions, where
  // neighbouring corners would get in the way of the test) instead of over one bounding box
  const laneOpen = (x0, z0, dx, dz, span, o) => {
    const clear = Math.min(12, span / 2);
    for (let t = clear; t <= span - clear + 1e-6; t += 2.5) {
      if (blockedOnStreet(x0 + dx * t - dz * o, z0 + dz * t + dx * o, LANE_CLEAR)) return false;
    }
    return true;
  };
  function addEdgeGeneral(from, to, axis, lanes, half, divided, arrive, name) {
    const x0 = from.x;
    const z0 = from.z;
    const span = Math.hypot(to.x - x0, to.z - z0);
    if (span < 8) return;
    const dx = (to.x - x0) / span;
    const dz = (to.z - z0) / span;
    const open = lanes.filter((o) => laneOpen(x0, z0, dx, dz, span, o));
    if (!open.length) return;
    edges.push({ from, to, axis, x0, z0, dx, dz, rx: -dz, rz: dx, span, half, lanes: open.sort((p, q) => p - q), moves: [], general: true, cand: lanes, divided: !!divided, arrive, name });
  }
  // A divided road drawn as two one-way roadways between the same two junctions (most of the Bowery) runs both ways
  // along one centreline here: each way keeps to the right of it, as on a two-way street, and the road is as wide as
  // both roadways
  const travel = (r) => (r.fwd.length ? [r.from, r.to] : [r.to, r.from]);
  const oneWays = new Map(); // node -> next node -> the one-way run from one to the other
  for (const r of genRuns) {
    if (!r.fwd.length === !r.back.length) continue;
    const [a, b] = travel(r);
    if (!oneWays.has(a)) oneWays.set(a, new Map());
    oneWays.get(a).set(b, r);
  }
  for (const r of genRuns) {
    if (!r.fwd.length === !r.back.length || r.divided) continue;
    const [a, b] = travel(r);
    const o = oneWays.has(b) && oneWays.get(b).get(a);
    if (!o || o.divided) continue;
    for (const q of [r, o]) {
      const lanes = q.fwd.length ? q.fwd : q.back;
      const right = lanes.map((x) => x - lanes[0] + 1.8); // as on a two-way street, from 1.8 m right of the centreline
      if (q.fwd.length) q.fwd = right;
      else q.back = right;
      q.divided = true;
    }
    r.half = o.half = r.half + o.half;
    if (r.half >= 7.25) r.axis = o.axis = 'ave'; // as wide as a major road (see lanesOf)
  }
  for (const r of genRuns) {
    if (r.fwd.length) addEdgeGeneral(r.from, r.to, r.axis, r.fwd, r.half, r.divided, r.arriveFwd, r.name);
    if (r.back.length) addEdgeGeneral(r.to, r.from, r.axis, r.back, r.half, r.divided, r.arriveBack, r.name);
  }
  // Two edges from one node to the same next one (a service road whose ends were drawn onto its main road's junctions)
  // would drive through each other: keep the grid's, else the one with the most lanes
  const keptEdge = new Map();
  const edgeRank = (e) => (e.general ? 0 : 1000) + e.lanes.length * 10 + e.half / 100;
  for (const e of edges) {
    let to = keptEdge.get(e.from);
    if (!to) keptEdge.set(e.from, (to = new Map()));
    const o = to.get(e.to);
    if (!o || edgeRank(e) > edgeRank(o)) to.set(e.to, e);
  }
  edges = edges.filter((e) => keptEdge.get(e.from).get(e.to) === e);
  // ...and where only some of the junctions on both sides of its median became one (Pike St), the stretches of its two
  // roadways that run on top of each other the same way
  {
    const oneWay = edges.filter((e) => e.general && !e.divided && e.cand[0] <= 0); // lanes about its centreline
    const cells = new Map(); // 16 m cells -> the one-way edges passing within 4 m
    oneWay.forEach((e, i) => {
      e.oneWay = i;
      for (let t = 0; t <= e.span; t += 8) {
        const x = e.x0 + e.dx * t;
        const z = e.z0 + e.dz * t;
        for (let ix = Math.floor((x - 4) / 16); ix <= Math.floor((x + 4) / 16); ix++) {
          for (let iz = Math.floor((z - 4) / 16); iz <= Math.floor((z + 4) / 16); iz++) {
            const k = (ix + 4096) * 8192 + (iz + 4096);
            const list = cells.get(k);
            if (!list) cells.set(k, [e]);
            else if (list[list.length - 1] !== e) list.push(e);
          }
        }
      }
    });
    // metres of e along f whose lanes come within 3 m of f's (e's right is f's left)
    const onTop = (e, f) => {
      let hits = 0;
      for (let t = 0; t <= e.span; t += 2) {
        const px = e.x0 + e.dx * t - f.x0;
        const pz = e.z0 + e.dz * t - f.z0;
        const u = px * f.dx + pz * f.dz;
        if (u < 0 || u > f.span) continue;
        const side = px * f.rx + pz * f.rz;
        if (e.lanes.some((a) => f.lanes.some((b) => Math.abs(side - a - b) < 3))) hits += 2;
      }
      return hits;
    };
    const partner = new Map(); // edge -> half width of the widest roadway running the other way on top of it
    const tested = new Set();
    for (const list of cells.values()) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const e = list[i];
          const f = list[j];
          if (e.dx * f.dx + e.dz * f.dz > -0.94) continue; // the other way, within 20°
          const key = Math.min(e.oneWay, f.oneWay) * 65536 + Math.max(e.oneWay, f.oneWay);
          if (tested.has(key)) continue;
          tested.add(key);
          if (Math.max(onTop(e, f), onTop(f, e)) < 6) continue;
          partner.set(e, Math.max(partner.get(e) || 0, f.half));
          partner.set(f, Math.max(partner.get(f) || 0, e.half));
        }
      }
    }
    for (const [e, other] of partner) {
      e.lanes = e.cand.map((o) => o - e.cand[0] + 1.8).filter((o) => laneOpen(e.x0, e.z0, e.dx, e.dz, e.span, o));
      e.half += other;
      if (e.half >= 7.25) e.axis = 'ave'; // as wide as a major road (see lanesOf)
      e.divided = true;
    }
    edges = edges.filter((e) => e.lanes.length);
  }
  // Edges no vehicle could both reach and leave (dead ends, and roads reached only from them) are dropped once the
  // moves are known (7.); know them already, so that no road keeps clear of a dead one merging with it or forking off it
  {
    const outsOf = new Map();
    for (const e of edges) {
      if (!outsOf.has(e.from)) outsOf.set(e.from, []);
      outsOf.get(e.from).push(e);
    }
    const live = largestComponent(edges, (e) => (outsOf.get(e.to) || []).filter((f) => f.to !== e.from && e.dx * f.dx + e.dz * f.dz >= -0.5));
    for (const e of edges) e.live = live.has(e);
  }
  const liveArm = (a) => !!((a.in && a.in.live) || (a.out && a.out.live));

  // The roads meeting at each node ("arms": one per direction a road leaves it in), from the edges into and out of it:
  // { ux, uz } (unit, away from the node), half (the widest roadway's half width), ave (a major road's), and its edge
  // `in` and edge `out`, if any. The two ways of a two-way street share an arm, and so do the two one-way roadways of a
  // divided road (within 20° of each other); a second road arriving or leaving within 20° of another (where streets
  // merge or fork) gets an arm of its own. With `only`, for just the nodes in that set.
  function computeArms(list, only = null) {
    for (const n of only || nodes) n.arms = [];
    const ends = new Map(); // node -> the edge ends there, in the order the edges come
    list.forEach((e, i) => {
      for (const [n, role, ux, uz] of [[e.from, 'out', e.dx, e.dz], [e.to, 'in', -e.dx, -e.dz]]) {
        if (only && !only.has(n)) continue;
        if (role === 'out') e.outArm = null;
        else e.inArm = null;
        if (!ends.has(n)) ends.set(n, []);
        ends.get(n).push({ e, role, ux, uz, order: 2 * i + (role === 'in' ? 1 : 0) });
      }
    });
    const armed = (q) => (q.role === 'out' ? q.e.outArm : q.e.inArm);
    for (const [n, at] of ends) {
      // arms in the order of their first edge end, each pointing along it
      const newArm = (q) => {
        const a = { ux: q.ux, uz: q.uz, half: 0, ave: false, in: null, out: null, order: q.order };
        n.arms.push(a);
        return a;
      };
      const join = (a, q) => {
        a[q.role] = q.e;
        if (q.role === 'out') q.e.outArm = a;
        else q.e.inArm = a;
        a.half = Math.max(a.half, q.e.half);
        a.ave = a.ave || q.e.axis === 'ave';
        a.order = Math.min(a.order, q.order);
      };
      // both ways of a two-way street
      for (const q of at) {
        if (q.role !== 'out') continue;
        const r = at.find((p) => p.role === 'in' && p.e.from === q.e.to);
        if (!r) continue;
        const a = newArm(q.order < r.order ? q : r);
        join(a, q);
        join(a, r);
      }
      // one-way roadways within 20°, one each way: a divided road's, the best aligned first
      const pairs = [];
      for (const q of at) {
        if (q.role !== 'out' || armed(q)) continue;
        for (const r of at) {
          const d = q.ux * r.ux + q.uz * r.uz;
          if (r.role === 'in' && !armed(r) && d > 0.94) pairs.push([d, q, r]);
        }
      }
      pairs.sort((p, q) => q[0] - p[0]);
      for (const [, q, r] of pairs) {
        if (armed(q) || armed(r)) continue;
        const a = newArm(q.order < r.order ? q : r);
        join(a, q);
        join(a, r);
      }
      // and every other road alone
      for (const q of at) if (!armed(q)) join(newArm(q), q);
      n.arms.sort((a, b) => a.order - b.order);
      // an arm within 20° of an earlier one (where roads merge or fork) crosses the other roads as one with it (its
      // lead), as wide as the widest of them
      for (const a of n.arms) {
        a.lead = n.arms.find((b) => b.lead === b && b.ux * a.ux + b.uz * a.uz > 0.94) || a;
        a.lead.wide = Math.max(a.lead === a ? 0 : a.lead.wide, a.half);
      }
    }
  }
  computeArms(edges);
  // A centreline node where just one road goes on, bending less than 35°, is a shape node: no corner to stop at (nor a
  // fork: a road splitting in two live ones within 20°)
  const bends = (n) => {
    const leads = n.arms.filter((a) => a.lead === a);
    const forks = leads.some((l) => n.arms.filter((a) => a.lead === l && liveArm(a)).length > 1);
    return leads.length === 2 && leads[0].ux * leads[1].ux + leads[0].uz * leads[1].uz < -0.82 && !forks;
  };
  for (const n of nodes) if (n.general && !n.shape && bends(n)) n.shape = true;
  // Where two roads leave a node within 20° of each other (they merge or fork there), how far out every lane of one
  // first keeps 3 m (a car's width and some) from every lane of the other
  const lanesOut = (a, r, out) => {
    out.length = 0;
    for (const e of [a.in, a.out]) {
      if (!e || !e.live) continue;
      const t = e === a.out ? r : e.span - r; // r from its start leaving, r before its end arriving
      for (const o of e.lanes) out.push(e.x0 + e.dx * t + e.rx * o, e.z0 + e.dz * t + e.rz * o);
    }
    return out;
  };
  const lanesA = [];
  const lanesB = [];
  function apart(a, b) {
    for (let r = 2; r < 45; r++) {
      lanesOut(a, r, lanesA);
      lanesOut(b, r, lanesB);
      let near = Infinity;
      for (let i = 0; i < lanesA.length; i += 2) {
        for (let j = 0; j < lanesB.length; j += 2) near = Math.min(near, Math.hypot(lanesA[i] - lanesB[j], lanesA[i + 1] - lanesB[j + 1]));
      }
      if (near >= 3) return r;
    }
    return 45;
  }
  // How far before node n an edge arriving along `arm` stops: clear of every road crossing it (at whatever angle: its
  // curb corner reaches past the crossing road's far side by half its own width over the tangent) plus the crosswalk,
  // and clear of the lanes of a road merging with it or forking off it
  const goesOn = (p, q) => p.ux * q.ux + p.uz * q.uz < 0 && Math.abs(p.ux * q.uz - p.uz * q.ux) < 0.26; // q within 15° of straight on from p
  function stopBack(n, arm) {
    if (n.shape) return 1;
    const a = arm.lead;
    let ext = 0;
    let fork = 0;
    for (const b of n.arms) {
      if (b === arm) continue;
      if (b.lead === a) {
        if (liveArm(arm) && liveArm(b)) fork = Math.max(fork, apart(arm, b) + 1); // side by side rather than across
        continue;
      }
      if (b.lead !== b) continue; // crossing as one with its lead
      // the same road going on (into either of two roads forking there, or out of either of two merging)
      if (n.arms.some((p) => p.lead === a && n.arms.some((q) => q.lead === b && goesOn(p, q)))) continue;
      const cos = a.ux * b.ux + a.uz * b.uz;
      const sin = Math.abs(a.ux * b.uz - a.uz * b.ux);
      ext = Math.max(ext, (b.wide + a.wide * Math.abs(cos)) / sin);
    }
    return Math.max(ext > 0 ? Math.min(ext, 20) + CROSSWALK : 2, fork);
  }
  // Edges run between stop lines: past the roads crossing them and the crosswalk at both ends. On a short link between
  // acute corners the two pull in together, keeping at least 10 m (or half the link) to queue on.
  function place(e) {
    let b0 = stopBack(e.from, e.outArm);
    let b1 = stopBack(e.to, e.inArm);
    const keep = Math.min(10, e.span * 0.5);
    e.squeezed = false;
    if (e.span - b0 - b1 < keep) {
      const k = (e.span - keep) / (b0 + b1);
      b0 *= k;
      b1 *= k;
      e.squeezed = !e.to.shape; // its stop line closer to the roads crossing ahead than they need (see the end of 6.)
    }
    e.sx = e.x0 + e.dx * b0;
    e.sz = e.z0 + e.dz * b0;
    e.len = e.span - b0 - b1;
  }
  for (const e of edges) place(e);
  const placed = edges; // (see 7.)
  const genCreated = edges.filter((e) => e.general).length;
  edges = edges.filter((e) => e.len > 4);

  // 6. Movements at each intersection (no U-turns) and the lane each lane leads to, along obstacle-free curves:
  //    straight on, lane i keeps to lane i + k ahead, k chosen to use as many lanes there as possible with the least
  //    sideways shift; turns go from the lane nearest the turn into the lane nearest it. Lanes left with no way on
  //    (where the road ends or narrows) turn alongside the turn lane, or merge. Across the road, lanes always run
  //    left turns, straight on, right turns, into lanes in the same order, so no two paths from one approach cross.
  const lateral = (e, i) => e.x0 * e.rx + e.z0 * e.rz + e.lanes[i];
  const ORDER = { U: -1, L: 0, S: 1, R: 2 };
  function pathClear(e, i, f, j) {
    const c = makeCurve(e, i, f, j);
    const p = { x: 0, z: 0, dx: 0, dz: 0 };
    for (let k = 1; k < 10; k++) {
      curvePoint(c, c.len * k / 10, p);
      if (blockedOnStreet(p.x, p.z, 0.8)) return false;
    }
    return true;
  }
  function inOrder(e, m, i, j) {
    for (const o of e.moves) {
      for (let k = 0; k < e.lanes.length; k++) {
        if (k === i || o.out[k] < 0) continue;
        // o from k is right of m from i: by its kind of turn, then (two of a kind, where a road forks) by how far right
        // it bends
        const right = ORDER[o.turn] - ORDER[m.turn] || (o === m ? o.out[k] - j : Math.sign(o.cross - m.cross));
        if (k < i ? right > 0 : right < 0) return false;
      }
    }
    return true;
  }
  function nearestLane(e, i, f) {
    let j = 0;
    for (let k = 1; k < f.lanes.length; k++) {
      if (Math.abs(lateral(f, k) - lateral(e, i)) < Math.abs(lateral(f, j) - lateral(e, i))) j = k;
    }
    return j;
  }
  // Let lane i of e make move m into lane j of its edge (clamped to the lanes there), if the way is clear
  function link(e, m, i, j) {
    j = Math.max(0, Math.min(m.to.lanes.length - 1, j));
    if (m.out[i] < 0 && inOrder(e, m, i, j) && pathClear(e, i, m.to, j)) m.out[i] = j;
    return m.out[i] >= 0;
  }
  function serveEveryLane(e) {
    const n = e.lanes.length;
    for (let i = 0; i < n; i++) {
      if (e.moves.some((m) => m.out[i] >= 0)) continue;
      const turnLane = (m, k) => link(e, m, i, m.turn === 'L' ? k : m.to.lanes.length - 1 - k);
      const side = (m) => (m.turn === 'L' ? i : n - 1 - i); // lanes between i and the turn's side of the road
      e.moves.some((m) => m.turn !== 'S' && side(m) <= (n - 1) / 2 && turnLane(m, side(m))) ||
        e.moves.some((m) => m.turn === 'S' && link(e, m, i, nearestLane(e, i, m.to))) ||
        e.moves.some((m) => m.turn !== 'S' && turnLane(m, side(m))) ||
        e.moves.some((m) => m.to.lanes.some((_, j) => link(e, m, i, j)));
    }
    e.moves = e.moves.filter((m) => m.out.some((j) => j >= 0));
  }
  for (const e of edges) e.from.out.push(e);
  for (const e of edges) {
    const n = e.lanes.length;
    // a dead end (the street stops there, or leaves the data box) is the one place to turn round
    const deadEnd = e.to.out.every((f) => f.to === e.from);
    for (const f of e.to.out) {
      if (f.to === e.from && deadEnd) {
        e.moves.push({ to: f, turn: 'U', cross: -1, out: new Array(n).fill(-1) });
        continue;
      }
      if (f.to === e.from || e.dx * f.dx + e.dz * f.dz < -0.5) continue;
      const cross = e.dx * f.dz - e.dz * f.dx;
      e.moves.push({ to: f, turn: cross > 0.5 ? 'R' : cross < -0.5 ? 'L' : 'S', cross, out: new Array(n).fill(-1) });
    }
    // the straightest first: where a road forks, the branch going most nearly straight on keeps most of its lanes
    const ahead = (m) => e.dx * m.to.dx + e.dz * m.to.dz;
    for (const m of e.moves.slice().sort((p, q) => ahead(q) - ahead(p))) {
      const f = m.to;
      if (m.turn === 'L' || m.turn === 'U') link(e, m, 0, 0);
      else if (m.turn === 'R') link(e, m, n - 1, f.lanes.length - 1);
      else {
        let best = 0;
        let bestScore = -Infinity;
        for (let k = 1 - n; k < f.lanes.length; k++) {
          const used = new Set();
          let score = 0;
          for (let i = 0; i < n; i++) {
            const j = Math.max(0, Math.min(f.lanes.length - 1, i + k));
            used.add(j);
            score -= Math.abs(lateral(f, j) - lateral(e, i));
          }
          score += 100 * used.size;
          if (score > bestScore) {
            bestScore = score;
            best = k;
          }
        }
        for (let i = 0; i < n; i++) link(e, m, i, i + best);
      }
    }
    serveEveryLane(e);
  }

  // Sides & right-of-way groups of node n's arms (see 9.): sides by the arms' angle round the node from east, so they
  // follow the real approach directions (Market St's diagonal, five-way junctions)
  function sidesAndGroups(n) {
    const arms = n.arms;
    const angle = (a) => (Math.atan2(a.uz, a.ux) + 2 * Math.PI) % (2 * Math.PI);
    n.sideArms = arms.slice().sort((a, b) => angle(a) - angle(b));
    n.sideArms.forEach((a, k) => (a.side = k));
    n.sideCount = Math.max(4, arms.length);
    // roads: arms paired with the one most nearly opposite (beyond 145°), the likeliest pairs first: the straightest,
    // and of two about as straight, the one about as wide (a side street merging into a road nearly head on doesn't
    // take over the road's other side)
    const pairs = [];
    for (let i = 0; i < arms.length; i++) {
      for (let j = i + 1; j < arms.length; j++) {
        const d = arms[i].ux * arms[j].ux + arms[i].uz * arms[j].uz;
        if (d < -0.82) pairs.push([d + 0.02 * Math.abs(arms[i].half - arms[j].half), arms[i], arms[j]]);
      }
    }
    pairs.sort((p, q) => p[0] - q[0]);
    const mates = new Map();
    for (const [, a, b] of pairs) {
      if (mates.has(a) || mates.has(b)) continue;
      mates.set(a, b);
      mates.set(b, a);
    }
    const roads = [];
    const done = new Set();
    for (const a of arms) {
      if (done.has(a)) continue;
      done.add(a);
      const mate = mates.get(a);
      if (mate) done.add(mate);
      const members = mate ? [a, mate] : [a];
      roads.push({ members, group: -1, rank: Math.max(...members.map((m) => (m.ave ? 100 : 0) + m.half)) });
    }
    let groups = 0;
    roads.sort((p, q) => q.rank - p.rank);
    for (const r of roads) if (r.group < 0) r.group = groups++;
    for (const r of roads) for (const m of r.members) m.group = r.group;
    n.groupCount = Math.max(2, groups);
  }

  // A short link squeezed between two corners may leave its stop line inside the road crossing ahead, where whoever
  // waits on it stands in the way of the traffic crossing there (of other roads, which share the junction with it).
  // Where the link comes off a bend (a shape node: nothing crosses there), its stop line goes back as far as that
  // takes, as long as a car waiting there still stands on the link (not around the bend, in the way of the next);
  // a link that can't keep clear even so is dropped.
  const inOf = new Map();
  for (const e of edges) {
    if (!inOf.has(e.to)) inOf.set(e.to, []);
    inOf.get(e.to).push(e);
  }
  const HALF_CAR = 2.3;
  const HALF_WIDE = 0.95;
  const pathPt = { x: 0, z: 0, dx: 0, dz: 1 };
  function inTheWay(e) {
    const n = e.to;
    sidesAndGroups(n);
    // a car standing at each of its lanes' stop line
    const cars = e.lanes.map((o) => [e.sx + e.dx * (e.len - HALF_CAR) + e.rx * o, e.sz + e.dz * (e.len - HALF_CAR) + e.rz * o]);
    for (const o of inOf.get(n)) {
      if (o === e || o.inArm.group === e.inArm.group) continue;
      for (const m of o.moves) {
        for (let i = 0; i < o.lanes.length; i++) {
          if (m.out[i] < 0) continue;
          const c = makeCurve(o, i, m.to, m.out[i]);
          for (let s = 0; s <= c.len; s += 1) {
            curvePoint(c, s, pathPt);
            for (const [cx, cz] of cars) {
              const dx = pathPt.x - cx;
              const dz = pathPt.z - cz;
              if (dx * dx + dz * dz > 36) continue;
              // how deep a car on the path overlaps it (separating axes)
              let depth = Infinity;
              for (const [ax, az] of [[e.dx, e.dz], [e.rx, e.rz], [pathPt.dx, pathPt.dz], [-pathPt.dz, pathPt.dx]]) {
                const ra = HALF_CAR * Math.abs(e.dx * ax + e.dz * az) + HALF_WIDE * Math.abs(e.rx * ax + e.rz * az);
                const rb = HALF_CAR * Math.abs(pathPt.dx * ax + pathPt.dz * az) + HALF_WIDE * Math.abs(pathPt.dz * ax - pathPt.dx * az);
                depth = Math.min(depth, ra + rb - Math.abs(dx * ax + dz * az));
              }
              if (depth > 0.25) return true;
            }
          }
        }
      }
    }
    return false;
  }
  const inTheWayOut = new Set();
  for (const e of edges) {
    if (!e.squeezed || !e.from.shape || !inTheWay(e)) continue;
    while (e.len > 6 && inTheWay(e)) e.len = Math.max(5.5, e.len - 1);
    if (inTheWay(e)) inTheWayOut.add(e); // even so
  }
  if (inTheWayOut.size) {
    edges = edges.filter((e) => !inTheWayOut.has(e));
    for (const e of edges) e.moves = e.moves.filter((m) => !inTheWayOut.has(m.to));
  }

  // 7. Keep the largest strongly connected set of edges so no vehicle can ever reach a dead end
  edges.forEach((e, i) => (e.id = i));
  const visited = new Uint8Array(edges.length);
  const order = [];
  for (const root of edges) {
    if (visited[root.id]) continue;
    visited[root.id] = 1;
    const stack = [[root, 0]];
    while (stack.length) {
      const top = stack[stack.length - 1];
      const e = top[0];
      if (top[1] < e.moves.length) {
        const f = e.moves[top[1]++].to;
        if (!visited[f.id]) {
          visited[f.id] = 1;
          stack.push([f, 0]);
        }
      } else {
        order.push(e);
        stack.pop();
      }
    }
  }
  const incoming = edges.map(() => []);
  for (const e of edges) for (const m of e.moves) incoming[m.to.id].push(e);
  const comp = new Int32Array(edges.length).fill(-1);
  let bestComp = -1;
  let bestSize = 0;
  for (let k = order.length - 1, c = 0; k >= 0; k--) {
    if (comp[order[k].id] >= 0) continue;
    const stack = [order[k]];
    comp[order[k].id] = c;
    let size = 0;
    while (stack.length) {
      const e = stack.pop();
      size++;
      for (const p of incoming[e.id]) {
        if (comp[p.id] < 0) {
          comp[p.id] = c;
          stack.push(p);
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      bestComp = c;
    }
    c++;
  }
  const genShortKept = edges.filter((e) => e.general).length;
  const genLost = edges.filter((e) => e.general && comp[e.id] !== bestComp);
  edges = edges.filter((e) => comp[e.id] === bestComp);
  // Roads kept clear of a road merging with them or forking off them that is gone now (too short, or no way on from it
  // after all) get their stop lines placed again without it
  const kept = new Set(edges);
  const dropped = placed.filter((e) => e.live && !kept.has(e));
  if (dropped.length) {
    const redo = new Set();
    for (const e of dropped) {
      e.live = false;
      redo.add(e.from).add(e.to);
    }
    computeArms(placed, redo);
    for (const n of redo) if (n.general && !n.shape && bends(n)) n.shape = true;
    for (const e of edges) if (redo.has(e.from) || redo.has(e.to)) place(e);
  }
  if (window.NYC.DEBUG_ROADS !== false) {
    console.info(`[roads] centreline edges: ${genCreated} with clear lanes, ${genShortKept} long enough, ${genShortKept - genLost.length} connected`);
  }
  for (const e of edges) {
    e.moves = e.moves.filter((m) => comp[m.to.id] === bestComp);
    serveEveryLane(e);
    // Lanes still leading nowhere (every curve out of them grazes a curb or obstacle): send them on to the nearest lane
    // of the straightest move anyway, so every lane always has a way on
    for (let i = 0; i < e.lanes.length; i++) {
      if (!e.moves.length || e.moves.some((m) => m.out[i] >= 0)) continue;
      const m = e.moves.find((q) => q.turn === 'S') || e.moves[0];
      m.out[i] = nearestLane(e, i, m.to);
    }
  }
  edges.forEach((e, i) => (e.id = i));

  for (const n of nodes) n.in = n.out = null;
  for (const e of edges) {
    (e.from.out || (e.from.out = [])).push(e);
    (e.to.in || (e.to.in = [])).push(e);
  }
  nodes = nodes.filter((n) => n.in && n.out);
  nodes.forEach((n, i) => (n.id = i));

  // 8. Control from the data (DataSF Traffic Signals & Stop Signs, tools/geo-roadgraph.mjs): a junction is signalised
  //    when any centreline node it joins has a signal; otherwise every edge arriving over a centreline link with a stop
  //    sign facing it must stop (e.stop). n.stop: some approach stops; n.allWay: every one does.
  const incident = RG ? RG.nodes.map(() => []).slice(0, RG.nodes.length / 2) : [];
  if (RG) RG.links.forEach(([a, b], li) => { incident[a].push(li); incident[b].push(li); });
  const stopFacing = (arrive) => {
    if (!arrive || !RG.stopMask) return false;
    const slot = incident[arrive.node].indexOf(arrive.link);
    return slot >= 0 && slot < 31 && ((RG.stopMask[arrive.node] >> slot) & 1) === 1;
  };
  for (const n of nodes) {
    n.signal = !!RG && n.rg.some((i) => RG.control[i] === 1);
    // where in the city's signal cycle (60 s, city-config.js SIGNAL_TIMING) this junction starts: a hash of its place,
    // so the city doesn't blink in sync (traffic.js, street-details.js)
    n.signalOffset = n.signal ? (Math.abs(Math.sin(n.x * 12.9898 + n.z * 78.233) * 43758.5453) % 1) * 60 : 0;
    for (const e of n.in) e.stop = !n.signal && stopFacing(e.arrive);
    n.stop = !n.signal && n.in.some((e) => e.stop);
    n.allWay = n.stop && n.in.every((e) => e.stop);
  }

  // 9. Sides & right of way at each node, for traffic.js. Its arms are its sides (one crosswalk and approach each),
  //    numbered round the node from east. The arms of one road (on opposite sides) form a group: vehicles of different
  //    groups never share the intersection box, and group 0 (the widest road) has the right of way at junctions without
  //    stop signs (and the first phase at signals).
  computeArms(edges);
  for (const n of nodes) sidesAndGroups(n);
  for (const e of edges) {
    e.inSide = e.inArm.side; // the side of e.to it arrives over
    e.outSide = e.outArm.side; // the side of e.from it leaves over
    e.axisIndex = e.inArm.group; // its right-of-way group at e.to
    // lateral axis of its road, the same both ways (+x across north-south roads, +z across east-west ones)
    const flip = e.rx < -1e-6 || (Math.abs(e.rx) <= 1e-6 && e.rz < 0);
    e.clx = flip ? -e.rx : e.rx;
    e.clz = flip ? -e.rz : e.rz;
  }
  for (const e of edges) {
    e.opposite = e.to.in.find((o) => o !== e && o.axisIndex === e.axisIndex && o.dx * e.dx + o.dz * e.dz < -0.7) || null;
  }

  // 10. Heights: every edge's lanes (and its centreline) sampled on the terrain every PROFILE_STEP m from its start
  //     stop line to its end one, with the cumulative 3D length along the centreline (e.prof, e.laneProf[i], e.len3)
  const groundAt = (x, z) => (T && T.loaded ? T.groundAt(x, z) : 0);
  for (const e of edges) {
    const n = Math.max(1, Math.ceil(e.len / PROFILE_STEP));
    const sample = (o) => {
      const prof = new Float32Array(n + 1);
      for (let k = 0; k <= n; k++) {
        const s = Math.min(e.len, k * PROFILE_STEP);
        prof[k] = groundAt(e.sx + e.dx * s + e.rx * o, e.sz + e.dz * s + e.rz * o);
      }
      return prof;
    };
    e.prof = sample(0);
    e.laneProf = e.lanes.map(sample);
    e.len3 = new Float32Array(n + 1);
    for (let k = 1; k <= n; k++) {
      const ds = Math.min(e.len, k * PROFILE_STEP) - Math.min(e.len, (k - 1) * PROFILE_STEP);
      e.len3[k] = e.len3[k - 1] + Math.hypot(ds, e.prof[k] - e.prof[k - 1]);
    }
  }

  // Lane-to-lane curves are built on first use and cached, with the heights & grades of the lanes they join
  const curves = new Map();
  function connector(e, i, f, j) {
    const k = ((e.id * 8 + i) * 16384 + f.id) * 8 + j;
    let c = curves.get(k);
    if (!c) {
      curves.set(k, (c = makeCurve(e, i, f, j)));
      c.y0 = edgeY(e, e.len, i);
      c.y3 = edgeY(f, 0, j);
      c.g0 = edgeGrade(e, e.len, i);
      c.g3 = edgeGrade(f, 0, j);
      // turning round, the two grades point opposite ways: keep to the slope between the ends instead of a hump
      if (e.dx * f.dx + e.dz * f.dz < -0.9) c.g0 = c.g3 = (c.y3 - c.y0) / (c.len || 1);
    }
    return c;
  }

  return { nodes, edges, connector, curvePoint, walkable, onSidewalk, edgeY, edgeGrade, curveY };
}

// Height of the ground along edge e, s metres past its start stop line (clamped to [0, e.len]): on lane i, or on its
// centreline when i is omitted (linear between the samples)
function edgeY(e, s, i = -1) {
  const prof = i >= 0 && e.laneProf ? e.laneProf[i] : e.prof;
  const f = Math.min(prof.length - 1, Math.max(0, s / PROFILE_STEP));
  const k = Math.min(prof.length - 2, Math.floor(f));
  if (k < 0) return prof[0];
  return prof[k] + (prof[k + 1] - prof[k]) * (f - k);
}
// Its grade there (rise over run, + uphill in the direction of travel)
function edgeGrade(e, s, i = -1) {
  const prof = i >= 0 && e.laneProf ? e.laneProf[i] : e.prof;
  if (prof.length < 2) return 0;
  const f = Math.min(prof.length - 1, Math.max(0, s / PROFILE_STEP));
  const k = Math.min(prof.length - 2, Math.floor(f));
  const run = Math.min(e.len, (k + 1) * PROFILE_STEP) - k * PROFILE_STEP;
  return (prof[k + 1] - prof[k]) / (run || PROFILE_STEP);
}
// Height along curve c (from connector()) s metres from its start: a cubic Hermite between the two lanes' heights,
// leaving and arriving at their grades
function curveY(c, s) {
  const L = c.len || 1;
  const t = Math.min(1, Math.max(0, s / L));
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * c.y0 + (t3 - 2 * t2 + t) * c.g0 * L + (-2 * t3 + 3 * t2) * c.y3 + (t3 - t2) * c.g3 * L;
}

// The largest strongly connected set of `list` (a Set), going on from item e to the items next(e)
function largestComponent(list, next) {
  const index = new Map(list.map((e, i) => [e, i]));
  const succ = list.map((e) => next(e).map((f) => index.get(f)).filter((j) => j !== undefined));
  const pred = list.map(() => []);
  succ.forEach((s, i) => {
    for (const j of s) pred[j].push(i);
  });
  // Kosaraju: finishing order going forwards, then components going backwards from the last finished
  const visited = new Uint8Array(list.length);
  const order = [];
  for (let root = 0; root < list.length; root++) {
    if (visited[root]) continue;
    visited[root] = 1;
    const stack = [[root, 0]];
    while (stack.length) {
      const top = stack[stack.length - 1];
      if (top[1] < succ[top[0]].length) {
        const j = succ[top[0]][top[1]++];
        if (!visited[j]) {
          visited[j] = 1;
          stack.push([j, 0]);
        }
      } else {
        order.push(top[0]);
        stack.pop();
      }
    }
  }
  const comp = new Int32Array(list.length).fill(-1);
  let best = -1;
  let bestSize = 0;
  for (let k = order.length - 1, c = 0; k >= 0; k--) {
    if (comp[order[k]] >= 0) continue;
    const stack = [order[k]];
    comp[order[k]] = c;
    let size = 0;
    while (stack.length) {
      const i = stack.pop();
      size++;
      for (const p of pred[i]) {
        if (comp[p] < 0) {
          comp[p] = c;
          stack.push(p);
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      best = c;
    }
    c++;
  }
  return new Set(list.filter((_, i) => comp[i] === best));
}

// Cubic Bézier from the end of lane i on edge e to the start of lane j on edge f: a quarter-circle-like
// arc around the corner for turns, an S-bend for straight lane shifts. Includes an arc-length table and
// the sharpest curvature along it (1 / tightest radius).
function makeCurve(e, i, f, j) {
  const x0 = e.sx + e.dx * e.len + e.rx * e.lanes[i];
  const z0 = e.sz + e.dz * e.len + e.rz * e.lanes[i];
  const x3 = f.sx + f.rx * f.lanes[j];
  const z3 = f.sz + f.rz * f.lanes[j];
  const cross = e.dx * f.dz - e.dz * f.dx;
  let k0;
  let k3;
  if (e.dx * f.dx + e.dz * f.dz < -0.9) {
    // turning round (a dead end): a loop out ahead about as wide as the gap between the lanes plus a car's turning room
    k0 = k3 = Math.max(4, Math.hypot(x3 - x0, z3 - z0) * 1.3);
  } else if (Math.abs(cross) < 0.5) {
    k0 = k3 = Math.hypot(x3 - x0, z3 - z0) / 3;
  } else {
    const t = ((x3 - x0) * f.dz - (z3 - z0) * f.dx) / cross;
    k0 = 0.552 * Math.abs(t);
    k3 = 0.552 * Math.hypot(x3 - (x0 + e.dx * t), z3 - (z0 + e.dz * t));
  }
  const c = {
    x0, z0, x3, z3,
    x1: x0 + e.dx * k0, z1: z0 + e.dz * k0,
    x2: x3 - f.dx * k3, z2: z3 - f.dz * k3,
    lut: new Float32Array(17),
    len: 0,
    curv: 0
  };
  let px = x0;
  let pz = z0;
  for (let k = 0; k <= 16; k++) {
    const t = k / 16;
    const u = 1 - t;
    const x = u * u * u * x0 + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * x3;
    const z = u * u * u * z0 + 3 * u * u * t * c.z1 + 3 * u * t * t * c.z2 + t * t * t * z3;
    c.len += Math.hypot(x - px, z - pz);
    c.lut[k] = c.len;
    px = x;
    pz = z;
    const dx = 3 * u * u * (c.x1 - x0) + 6 * u * t * (c.x2 - c.x1) + 3 * t * t * (x3 - c.x2);
    const dz = 3 * u * u * (c.z1 - z0) + 6 * u * t * (c.z2 - c.z1) + 3 * t * t * (z3 - c.z2);
    const ddx = 6 * u * (c.x2 - 2 * c.x1 + x0) + 6 * t * (x3 - 2 * c.x2 + c.x1);
    const ddz = 6 * u * (c.z2 - 2 * c.z1 + z0) + 6 * t * (z3 - 2 * c.z2 + c.z1);
    c.curv = Math.max(c.curv, Math.abs(dx * ddz - dz * ddx) / Math.max(1e-6, Math.hypot(dx, dz) ** 3));
  }
  return c;
}

// Position and unit tangent at arc length s along a curve
function curvePoint(c, s, out) {
  let k = 1;
  while (k < 16 && c.lut[k] < s) k++;
  const s0 = c.lut[k - 1];
  const s1 = c.lut[k];
  const t = (k - 1 + Math.min(1, Math.max(0, (s - s0) / (s1 - s0 || 1)))) / 16;
  const u = 1 - t;
  out.x = u * u * u * c.x0 + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x3;
  out.z = u * u * u * c.z0 + 3 * u * u * t * c.z1 + 3 * u * t * t * c.z2 + t * t * t * c.z3;
  const dx = 3 * u * u * (c.x1 - c.x0) + 6 * u * t * (c.x2 - c.x1) + 3 * t * t * (c.x3 - c.x2);
  const dz = 3 * u * u * (c.z1 - c.z0) + 6 * u * t * (c.z2 - c.z1) + 3 * t * t * (c.z3 - c.z2);
  const l = Math.hypot(dx, dz) || 1;
  out.dx = dx / l;
  out.dz = dz / l;
  return out;
}

// ?debug=roads (main.js): the network as lines over the ground. Lanes grey, the curves through junctions cyan, each
// junction's arms coloured by right-of-way group (0 green, 1 yellow, 2+ magenta) and its control as a post: signals red,
// all-way stops orange, stops on some approaches white
function buildRoadDebug(net) {
  const { THREE } = window.NYC;
  const pos = [];
  const col = [];
  const line = (x0, y0, z0, x1, y1, z1, c) => {
    pos.push(x0, y0, z0, x1, y1, z1);
    col.push(c[0], c[1], c[2], c[0], c[1], c[2]);
  };
  const LIFT = 0.35;
  const p = { x: 0, z: 0, dx: 0, dz: 0 };
  for (const e of net.edges) {
    e.lanes.forEach((o, i) => {
      for (let s = 0; s < e.len; s += 4) {
        const s1 = Math.min(e.len, s + 4);
        line(e.sx + e.dx * s + e.rx * o, edgeY(e, s, i) + LIFT, e.sz + e.dz * s + e.rz * o,
          e.sx + e.dx * s1 + e.rx * o, edgeY(e, s1, i) + LIFT, e.sz + e.dz * s1 + e.rz * o, [0.6, 0.6, 0.6]);
      }
    });
    for (const m of e.moves) {
      m.out.forEach((j, i) => {
        if (j < 0) return;
        const c = net.connector(e, i, m.to, j);
        let px = c.x0, py = curveY(c, 0) + LIFT, pz = c.z0;
        for (let k = 1; k <= 8; k++) {
          curvePoint(c, (c.len * k) / 8, p);
          const py1 = curveY(c, (c.len * k) / 8) + LIFT;
          line(px, py, pz, p.x, py1, p.z, m.turn === 'U' ? [1, 0.3, 0.3] : [0.2, 0.9, 1]);
          px = p.x; py = py1; pz = p.z;
        }
      });
    }
  }
  const GROUP = [[0.2, 1, 0.3], [1, 0.9, 0.2], [1, 0.3, 1]];
  for (const n of net.nodes) {
    const y = window.NYC.Terrain && window.NYC.Terrain.loaded ? window.NYC.Terrain.groundAt(n.x, n.z) : 0;
    for (const a of n.arms) line(n.x, y + LIFT, n.z, n.x + a.ux * 6, y + LIFT, n.z + a.uz * 6, GROUP[Math.min(2, a.group)]);
    const c = n.signal ? [1, 0.1, 0.1] : n.allWay ? [1, 0.55, 0.1] : n.stop ? [1, 1, 1] : null;
    if (c) line(n.x, y, n.z, n.x, y + 8, n.z, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const lines = new THREE.LineSegments(g, new THREE.LineBasicNodeMaterial({ vertexColors: true, depthTest: false, transparent: true }));
  lines.name = 'RoadDebug';
  lines.renderOrder = 10;
  lines.frustumCulled = false;
  return lines;
}

Object.assign(window.NYC, { buildRoadNetwork, buildRoadDebug, CROSSWALK, edgeY, edgeGrade, curveY });
})();
