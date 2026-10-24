(function () {
// js/sf-street-details.js
// San Francisco's street furniture from the road network (road-network.js), standing on the terrain (P2.10):
// - a signal mast on the near right corner of every signalised approach, its arm reaching over the lanes and its head
//   facing the drivers, lit by the junction's own phase (the lens material reads the mast's ground, the junction's
//   offset in the cycle and its right-of-way group: the same phases traffic.js obeys);
// - a stop sign on the near right corner of every approach with one (DataSF Stop Signs);
// - cobra-head lamps every LAMP_STEP m along the streets, on alternate sides, on the curb islands;
// - a fire hydrant on a corner of every junction;
// - Muni stops (GEO.muniStops, P4.4): a pole with a yellow band at the curb, and a glass shelter behind it where the
//   data says the stop has one and the sidewalk is wide enough;
// - overhead trolleybus wires (GEO.trolley: OSM trolley_wire=yes): a pair of wires 5.6 m over the curb lane of each
//   way the street runs, hung from span wires between poles on both curbs every TROLLEY_SPAN m;
// - parking meters along the curbs downtown (Financial District, SoMa, the Tenderloin, Chinatown);
// - the street trees of the DataSF Street Tree Inventory (GEO.trees, P4.5) that stand on a curb island, in five looks
//   (trees.js species: plane, ficus, palm, elm-like and fine-leaved broadleaf, conifer), sized by trunk diameter.
// No New York street furniture is built in San Francisco (steam stacks, scaffolding sheds, yellow-cab stands and NYC
// signage come from street-details.js and the NYC lot builders, which FEATURES leaves off).
// Returns what main.js expects of buildStreetDetails: { footprints (for traffic to keep clear of), signalClock }.

const { THREE } = window.NYC;
const { mergeGeometries } = window.NYC.Addons;
const { uniform, color, mix, smoothstep } = window.NYC.TSL;
const { blockAt, cityUniforms, CURB_H, createTrafficSignalLensMaterial } = window.NYC;

const LAMP_STEP = 30;
const TROLLEY_H = 5.6; // contact wires over the road
const TROLLEY_SPAN = 32; // span wires and their poles
const METER_STEP = 6.5; // one parking space
const METER_NHOODS = new Set(['Financial District/South Beach', 'South of Market', 'Tenderloin', 'Chinatown']);
const POLE_H = 6.4; // signal mast
const HEAD_Y = 5.42; // signal head centre above the mast's ground (the lens material's red / amber / green heights)

function buildSFStreetDetails(scene, network, buildingColliders = []) {
  const group = new THREE.Group();
  group.name = 'SFStreetDetails';
  const signalClock = uniform(0);
  const footprints = [];
  const T = window.NYC.Terrain;
  const groundAt = (x, z) => (T && T.loaded ? T.groundAt(x, z) : 0);
  // a spot on a real curb island (not a median), pad metres clear all round
  const onIsland = (x, z, pad = 0.5) => {
    for (const [ox, oz] of [[0, 0], [pad, 0], [-pad, 0], [0, pad], [0, -pad]]) {
      const b = blockAt(x + ox, z + oz);
      if (!b || b.median) return false;
    }
    return true;
  };
  // The first spot on an island from (x, z), stepping along (ax, az) and out along (bx, bz)
  const findSpot = (x, z, ax, az, bx, bz) => {
    for (const a of [0, 1, -1, 2, -2, 3]) {
      for (const b of [0, 0.6, 1.2, 1.8, 2.4]) {
        const px = x + ax * a + bx * b, pz = z + az * a + bz * b;
        if (onIsland(px, pz)) return { x: px, z: pz };
      }
    }
    return null;
  };

  const dummy = new THREE.Object3D();
  const mats = {
    pole: [],
    arm: [],
    head: [],
    lens: [],
    lensBase: [],
    stopPole: [],
    stopPlate: [],
    lampPole: [],
    lampHead: [],
    hydrant: [],
    muniPole: [],
    muniBand: [],
    shelterFrame: [],
    shelterGlass: [],
    shelterAd: [],
    wire: [],
    trolleyPole: [],
    meterPost: [],
    meterHead: []
  };
  const push = (list, x, y, z, ry, sx, sy, sz, rz = 0) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, ry, rz);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    list.push(dummy.matrix.clone());
  };

  // 1. Signals & 2. stop signs: on the right of each approach, just short of its crosswalk
  let signals = 0;
  let stops = 0;
  for (const e of network.edges) {
    const n = e.to;
    if (!n.signal && !e.stop) continue;
    const lx = e.sx + e.dx * e.len, lz = e.sz + e.dz * e.len; // the stop line, on the centreline
    const right = e.half + 0.9;
    const spot = findSpot(lx + e.rx * right, lz + e.rz * right, e.dx, e.dz, e.rx, e.rz);
    if (!spot) continue;
    const base = groundAt(spot.x, spot.z) + CURB_H;
    const facing = Math.atan2(-e.dx, -e.dz); // towards the drivers arriving
    footprints.push({ minX: spot.x - 0.3, maxX: spot.x + 0.3, minZ: spot.z - 0.3, maxZ: spot.z + 0.3 });
    if (n.signal) {
      signals++;
      push(mats.pole, spot.x, base + POLE_H / 2, spot.z, 0, 0.14, POLE_H, 0.14);
      // the arm reaches left over the lanes to above the middle one
      const lanes = e.lanes;
      const mid = lanes[Math.floor(lanes.length / 2)] || 0;
      const toX = lx + e.rx * mid, toZ = lz + e.rz * mid;
      const reach = Math.max(2, Math.min(9, Math.hypot(toX - spot.x, toZ - spot.z)));
      const ux = (toX - spot.x) / reach, uz = (toZ - spot.z) / reach;
      push(mats.arm, spot.x + ux * reach / 2, base + POLE_H - 0.3, spot.z + uz * reach / 2, Math.atan2(ux, uz), 0.11, 0.11, reach);
      push(mats.head, spot.x + ux * reach, base + HEAD_Y, spot.z + uz * reach, facing, 1, 1, 1);
      mats.lens.push(dummy.matrix.clone());
      mats.lensBase.push(base, n.signalOffset || 0, e.axisIndex === 0 ? 1 : 0);
    } else {
      stops++;
      push(mats.stopPole, spot.x, base + 1.15, spot.z, 0, 0.06, 2.3, 0.06);
      push(mats.stopPlate, spot.x, base + 2.35, spot.z, facing, 1, 1, 1);
    }
  }

  // 3. Lamps along every street (each road once: its edges one way, or the only way of a one-way street)
  const seen = new Set();
  let lamps = 0;
  for (const e of network.edges) {
    const key = Math.min(e.from.id, e.to.id) + ':' + Math.max(e.from.id, e.to.id);
    if (seen.has(key) || e.bore) continue; // (not in tunnels, lit inside, or on bridges: grade-separation.js)
    seen.add(key);
    for (let s = LAMP_STEP / 2, k = 0; s < e.len; s += LAMP_STEP, k++) {
      const side = k % 2 === 0 ? 1 : -1;
      const off = e.half + 0.6;
      const spot = findSpot(e.sx + e.dx * s + e.rx * off * side, e.sz + e.dz * s + e.rz * off * side, e.dx, e.dz, e.rx * side, e.rz * side);
      if (!spot) continue;
      const base = groundAt(spot.x, spot.z) + CURB_H;
      const out = Math.atan2(-e.rx * side, -e.rz * side); // the arm leans out over the road
      push(mats.lampPole, spot.x, base + 4, spot.z, 0, 0.09, 8, 0.09);
      push(mats.arm, spot.x - e.rx * side * 0.7, base + 7.98, spot.z - e.rz * side * 0.7, out, 0.07, 0.07, 1.4);
      dummy.position.set(spot.x - e.rx * side * 1.4, base + 7.9, spot.z - e.rz * side * 1.4);
      dummy.rotation.set(0, out, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mats.lampHead.push(dummy.matrix.clone());
      footprints.push({ minX: spot.x - 0.2, maxX: spot.x + 0.2, minZ: spot.z - 0.2, maxZ: spot.z + 0.2 });
      lamps++;
    }
  }

  // 4. A hydrant on a corner of every junction (the first approach's right-hand corner, set back from it)
  for (const n of network.nodes) {
    if (n.shape || !n.in || !n.in.length) continue;
    const e = n.in[0];
    const x = n.x - e.dx * (e.half + 6) + e.rx * (e.half + 0.5);
    const z = n.z - e.dz * (e.half + 6) + e.rz * (e.half + 0.5);
    const spot = findSpot(x, z, -e.dx, -e.dz, e.rx, e.rz);
    if (!spot) continue;
    push(mats.hydrant, spot.x, groundAt(spot.x, spot.z) + CURB_H + 0.38, spot.z, 0, 1, 1, 1);
  }

  // Directed edges by 20 m cell, sampled every 10 m: the edge nearest a point (optionally running within ~45 degrees of
  // a direction), with how far along it and to its right the point lies
  const EC = 20;
  const edgeGrid = new Map();
  for (const e of network.edges) {
    for (let t = 0; t <= e.len; t += 10) {
      const k = Math.floor((e.sx + e.dx * t) / EC) * 100000 + Math.floor((e.sz + e.dz * t) / EC);
      if (!edgeGrid.has(k)) edgeGrid.set(k, new Set());
      edgeGrid.get(k).add(e);
    }
  }
  const nearestEdge = (x, z, dx = 0, dz = 0, maxD = 15) => {
    let best = null;
    for (let gx = Math.floor(x / EC) - 1; gx <= Math.floor(x / EC) + 1; gx++) {
      for (let gz = Math.floor(z / EC) - 1; gz <= Math.floor(z / EC) + 1; gz++) {
        for (const e of edgeGrid.get(gx * 100000 + gz) || []) {
          if ((dx || dz) && e.dx * dx + e.dz * dz < 0.7) continue;
          const s = Math.max(0, Math.min(e.len, (x - e.sx) * e.dx + (z - e.sz) * e.dz));
          const px = e.sx + e.dx * s, pz = e.sz + e.dz * s;
          const d = Math.hypot(x - px, z - pz);
          if (d < maxD && (!best || d < best.d)) best = { e, s, d, off: (x - px) * e.rx + (z - pz) * e.rz };
        }
      }
    }
    return best;
  };

  // 5. Muni stops: the pole at the curb on the stop's side of the street, a shelter 1.6 m behind it facing the road
  let muniStops = 0, shelters = 0;
  const M = window.NYC.GEO.muniStops || [];
  for (let i = 0; i < M.length; i += 3) {
    const near = nearestEdge(M[i], M[i + 1]);
    if (!near || near.e.bore) continue;
    const { e } = near;
    const side = near.off >= 0 ? 1 : -1;
    const sx = e.rx * side, sz = e.rz * side; // towards the stop's curb
    const cx = e.sx + e.dx * near.s, cz = e.sz + e.dz * near.s;
    const spot = findSpot(cx + sx * (e.half + 0.5), cz + sz * (e.half + 0.5), e.dx, e.dz, sx, sz);
    if (!spot) continue;
    const base = groundAt(spot.x, spot.z) + CURB_H;
    muniStops++;
    push(mats.muniPole, spot.x, base + 1.6, spot.z, 0, 0.055, 3.2, 0.055);
    push(mats.muniBand, spot.x, base + 2.3, spot.z, 0, 0.062, 0.45, 0.062);
    footprints.push({ minX: spot.x - 0.2, maxX: spot.x + 0.2, minZ: spot.z - 0.2, maxZ: spot.z + 0.2 });
    if (!M[i + 2]) continue;
    // the shelter: 3.6 m along the curb, 1.5 m deep, its back 2.4 m from the pole; every corner on the sidewalk
    const bx = spot.x + sx * 1.7, bz = spot.z + sz * 1.7;
    const corners = [[-1.8, -0.75], [1.8, -0.75], [-1.8, 0.75], [1.8, 0.75]].every(([a, o]) => onIsland(bx + e.dx * a + sx * o, bz + e.dz * a + sz * o, 0.2));
    if (!corners) continue;
    shelters++;
    const g = groundAt(bx, bz) + CURB_H;
    // a part a m along the curb, o m back from the shelter's middle, y m up; the unit box's x along the curb
    const R = (list, a, o, y, along, up, across) => push(list, bx + e.dx * a + sx * o, g + y, bz + e.dz * a + sz * o, Math.atan2(-e.dz, e.dx), along, up, across);
    R(mats.shelterFrame, 0, 0, 2.45, 3.7, 0.08, 1.6); // roof
    R(mats.shelterGlass, 0, 0.72, 1.3, 3.6, 2.1, 0.03); // back
    R(mats.shelterGlass, -1.78, 0.1, 1.3, 0.03, 2.1, 1.25); // ends
    R(mats.shelterAd, 1.78, 0.1, 1.25, 0.12, 1.9, 1.25); // the lit advert at one end
    for (const a of [-1.75, 1.75]) R(mats.shelterFrame, a, 0.72, 1.2, 0.08, 2.4, 0.08); // back posts
    footprints.push({ minX: bx - 1.9, maxX: bx + 1.9, minZ: bz - 1.9, maxZ: bz + 1.9 });
  }

  // 6. Trolleybus wires: per OSM way, the curb lane's offset of the road it follows (median over its length) for each
  //    way it runs; contact wire pairs (0.6 m apart) between samples every 8 m, span wires & poles every TROLLEY_SPAN m
  let wireKm = 0, trolleyPoles = 0;
  // wires are drawn as lines (a pixel wide at any distance, as thin wires look against the sky)
  const wireSeg = (ax, ay, az, bx, by, bz) => mats.wire.push(ax, ay, az, bx, by, bz);
  for (const tw of window.NYC.GEO.trolley || []) {
    const P = tw.pts;
    const samples = [];
    for (let i = 2; i < P.length; i += 2) {
      const ax = P[i - 2], az = P[i - 1], bx = P[i], bz = P[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.5) continue;
      const ux = (bx - ax) / L, uz = (bz - az) / L;
      for (let t = 0; t < L; t += 8) samples.push({ x: ax + ux * t, z: az + uz * t, ux, uz });
      if (i + 2 >= P.length) samples.push({ x: bx, z: bz, ux, uz });
    }
    if (samples.length < 2) continue;
    // which ways it runs: +1 along the drawing, -1 against it
    const ways = tw.oneway ? [tw.oneway] : [1, -1];
    for (const w of ways) {
      const offs = [];
      const halves = [];
      for (const p of samples) {
        const near = nearestEdge(p.x, p.z, p.ux * w, p.uz * w, 12);
        if (!near || near.e.bore) { p.skip = true; continue; }
        offs.push(Math.max(...near.e.lanes) + near.off * -1); // the curb lane, measured from the OSM line
        halves.push(near.e.half - near.off * -1);
      }
      if (offs.length < 2) continue;
      offs.sort((a, b) => a - b);
      halves.sort((a, b) => a - b);
      const off = offs[offs.length >> 1], half = halves[halves.length >> 1];
      let prev = null;
      samples.forEach((p, k) => {
        // to the right of the way's travel
        const rx = -p.uz * w, rz = p.ux * w;
        const y = groundAt(p.x, p.z) + TROLLEY_H;
        const cur = p.skip ? null : [p.x + rx * off, y, p.z + rz * off, rx, rz];
        if (prev && cur) {
          for (const o of [-0.3, 0.3]) wireSeg(prev[0] + prev[3] * o, prev[1], prev[2] + prev[4] * o, cur[0] + cur[3] * o, cur[1], cur[2] + cur[4] * o);
          wireKm += Math.hypot(cur[0] - prev[0], cur[2] - prev[2]) / 1000;
        }
        prev = cur;
        // a span wire from a pole on this way's curb across to the wires (every 4th sample: 32 m)
        if (cur && k % (TROLLEY_SPAN / 8) === 0) {
          const spot = findSpot(p.x + rx * (half + 0.5), p.z + rz * (half + 0.5), p.ux, p.uz, rx, rz);
          if (!spot) return;
          const base = groundAt(spot.x, spot.z) + CURB_H;
          push(mats.trolleyPole, spot.x, base + 3.8, spot.z, 0, 0.11, 7.6, 0.11);
          wireSeg(spot.x, base + 6.6, spot.z, cur[0] - rx * 0.6, y + 0.35, cur[2] - rz * 0.6);
          footprints.push({ minX: spot.x - 0.25, maxX: spot.x + 0.25, minZ: spot.z - 0.25, maxZ: spot.z + 0.25 });
          trolleyPoles++;
        }
      });
    }
  }

  // 7. Parking meters downtown: every METER_STEP m along both curbs, 12 m clear of the junctions (each road once)
  const RG = window.NYC.GEO.roadGraph;
  const LC = 40;
  const linkGrid = new Map();
  RG.links.forEach((l, li) => {
    const [a, b] = l;
    const x = (RG.nodes[2 * a] + RG.nodes[2 * b]) / 2, z = (RG.nodes[2 * a + 1] + RG.nodes[2 * b + 1]) / 2;
    const k = Math.floor(x / LC) * 100000 + Math.floor(z / LC);
    if (!linkGrid.has(k)) linkGrid.set(k, []);
    linkGrid.get(k).push([x, z, RG.nhoods[RG.linkNhood[li]]]);
  });
  const nhoodAt = (x, z) => {
    let best = null, bd = Infinity;
    for (let gx = Math.floor(x / LC) - 1; gx <= Math.floor(x / LC) + 1; gx++) {
      for (let gz = Math.floor(z / LC) - 1; gz <= Math.floor(z / LC) + 1; gz++) {
        for (const [lx, lz, nh] of linkGrid.get(gx * 100000 + gz) || []) {
          const d = (lx - x) ** 2 + (lz - z) ** 2;
          if (d < bd) { bd = d; best = nh; }
        }
      }
    }
    return best;
  };
  const meterRoads = new Set();
  for (const e of network.edges) {
    const key = Math.min(e.from.id, e.to.id) + ':' + Math.max(e.from.id, e.to.id);
    if (meterRoads.has(key) || e.bore || e.len < 30) continue;
    meterRoads.add(key);
    if (!METER_NHOODS.has(nhoodAt(e.sx + e.dx * e.len * 0.5, e.sz + e.dz * e.len * 0.5))) continue;
    for (const side of [1, -1]) {
      for (let s = 12; s < e.len - 12; s += METER_STEP) {
        const x = e.sx + e.dx * s + e.rx * side * (e.half + 0.45), z = e.sz + e.dz * s + e.rz * side * (e.half + 0.45);
        if (!onIsland(x, z, 0.3)) continue;
        const base = groundAt(x, z) + CURB_H;
        push(mats.meterPost, x, base + 0.55, z, 0, 0.035, 1.1, 0.035);
        push(mats.meterHead, x, base + 1.25, z, Math.atan2(e.rx * side, e.rz * side), 0.2, 0.32, 0.14);
      }
    }
  }

  // 8. Street trees: on a curb island, or moved onto the nearest one within TREE_SNAP m (tree pits sit at the curb, and
  //    the inventory's points and the 2016 curbs disagree by a metre or so), else left out and counted; turned at
  //    random, scaled by trunk diameter
  //    (3 in: a young tree at 0.42 of a mature park tree's size, 24 in and more: full size; palms keep most of their
  //    height whatever the diameter)
  const SPECIES_OF = [0, 3, 4, 2, 5, 1]; // tree-classes.json class -> trees.js species
  const TREE_SNAP = 2;
  const sites = [];
  let offSidewalk = 0, snapped = 0;
  const TR = window.NYC.GEO.trees || [];
  for (let i = 0; i < TR.length; i += 4) {
    let x = TR[i], z = TR[i + 1];
    const cls = TR[i + 2], dbh = TR[i + 3];
    if (!blockAt(x, z)) {
      let best = null;
      for (let r = 0.5; r <= TREE_SNAP && !best; r += 0.5) {
        for (let k = 0; k < 8 && !best; k++) {
          const px = x + Math.cos((k * Math.PI) / 4) * r, pz = z + Math.sin((k * Math.PI) / 4) * r;
          if (blockAt(px, pz) && blockAt(px + Math.cos((k * Math.PI) / 4) * 0.4, pz + Math.sin((k * Math.PI) / 4) * 0.4)) best = [px + Math.cos((k * Math.PI) / 4) * 0.4, pz + Math.sin((k * Math.PI) / 4) * 0.4];
        }
      }
      if (!best) { offSidewalk++; continue; }
      [x, z] = best;
      snapped++;
    }
    const s = cls === 2 ? 0.75 + Math.min(dbh, 30) / 120 : Math.min(1, 0.36 + dbh / 40);
    const r = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
    sites.push({ x, y: groundAt(x, z) + CURB_H, z, scale: s, species: SPECIES_OF[cls] ?? 2, yaw: r * Math.PI * 2, tier: 1 });
  }
  const treeField = sites.length && window.NYC.createTreeField ? window.NYC.createTreeField(scene, sites) : null;
  if (treeField) group.add(treeField.group);

  // Meshes: one instanced mesh per part
  const metal = new THREE.MeshStandardNodeMaterial({ color: 0x5b6067, roughness: 0.5, metalness: 0.7 });
  const housing = new THREE.MeshStandardNodeMaterial({ color: 0x2a2f2a, roughness: 0.55, metalness: 0.3, side: THREE.DoubleSide });
  const lampGlow = new THREE.MeshBasicNodeMaterial();
  lampGlow.colorNode = mix(color(0x8f918c), color(0xfff1d6).mul(2.1), smoothstep(0.4, 1.1, cityUniforms.uInteriorGlow));
  const stopRed = new THREE.MeshStandardNodeMaterial({ color: 0xb3121b, roughness: 0.45, side: THREE.DoubleSide });
  const hydrantMat = new THREE.MeshStandardNodeMaterial({ color: 0xe8e4da, roughness: 0.5, metalness: 0.2 });
  const lensMat = createTrafficSignalLensMaterial(true, signalClock, true);

  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 8);
  // signal head: housing (lenses on both faces, see street-details.js) over 3 lenses
  const HEAD_D = 0.28;
  const LENS_Y = [0.36, 0, -0.36];
  const headGeo = mergeGeometries([new THREE.BoxGeometry(0.4, 1.12, HEAD_D), new THREE.BoxGeometry(0.07, 0.4, 0.07).translate(0, 0.76, 0)].map((g) => g.toNonIndexed()));
  const lensGeo = mergeGeometries(LENS_Y.flatMap((ly) => [
    new THREE.CircleGeometry(0.145, 16).translate(0, ly, HEAD_D / 2 + 0.004),
    new THREE.CircleGeometry(0.145, 16).rotateY(Math.PI).translate(0, ly, -HEAD_D / 2 - 0.004)
  ]));
  const plateGeo = mergeGeometries([
    new THREE.CircleGeometry(0.38, 8).rotateZ(Math.PI / 8).translate(0, 0, 0.02),
    new THREE.CircleGeometry(0.38, 8).rotateZ(Math.PI / 8).rotateY(Math.PI).translate(0, 0, -0.02)
  ]);
  const lampHeadGeo = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.3, 0.16, 0.65);
  const hydrantGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.14, 0.17, 0.62, 10),
    new THREE.SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.31, 0),
    new THREE.CylinderGeometry(0.06, 0.06, 0.42, 6).rotateZ(Math.PI / 2).translate(0, 0.08, 0)
  ].map((g) => g.toNonIndexed()));

  const add = (geo, mat, list, name, cast = true, attr = null) => {
    if (!list.length) return null;
    if (attr) geo.setAttribute(attr.name, new THREE.InstancedBufferAttribute(new Float32Array(attr.data), attr.size));
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.name = name;
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    return mesh;
  };
  add(unitCyl, metal, mats.pole, 'SignalPoles');
  add(unitBox, metal, mats.arm, 'SignalArms');
  add(headGeo, housing, mats.head, 'SignalHeads');
  add(lensGeo, lensMat, mats.lens, 'SignalLenses', false, { name: 'signalBase', data: mats.lensBase, size: 3 });
  add(unitCyl, metal, mats.stopPole, 'StopSignPoles');
  add(plateGeo, stopRed, mats.stopPlate, 'StopSigns');
  add(unitCyl, metal, mats.lampPole, 'LampPoles');
  add(lampHeadGeo, lampGlow, mats.lampHead, 'LampHeads', false);
  add(hydrantGeo, hydrantMat, mats.hydrant, 'Hydrants');
  // Muni: a dark-grey pole with a yellow band; shelters: grey frame, see-through glass, an advert lit at night
  const muniYellow = new THREE.MeshStandardNodeMaterial({ color: 0xf2c230, roughness: 0.5 });
  const frame = new THREE.MeshStandardNodeMaterial({ color: 0x45494e, roughness: 0.45, metalness: 0.6 });
  const glass = new THREE.MeshStandardNodeMaterial({ color: 0xbcd0d8, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.28, depthWrite: false });
  const advert = new THREE.MeshStandardNodeMaterial({ roughness: 0.3 });
  advert.colorNode = color(0xd8d2c4);
  advert.emissiveNode = color(0xfff3dc).mul(smoothstep(0.4, 1.1, cityUniforms.uInteriorGlow).mul(0.9).add(0.08));
  const wireMat = new THREE.LineBasicNodeMaterial({ color: 0x2a2c2e });
  const meterMat = new THREE.MeshStandardNodeMaterial({ color: 0x3a3e42, roughness: 0.5, metalness: 0.5 });
  add(unitCyl, frame, mats.muniPole, 'MuniStopPoles');
  add(unitCyl, muniYellow, mats.muniBand, 'MuniStopBands');
  add(unitBox, frame, mats.shelterFrame, 'MuniShelterFrames');
  add(unitBox, glass, mats.shelterGlass, 'MuniShelterGlass', false);
  add(unitBox, advert, mats.shelterAd, 'MuniShelterAdverts');
  if (mats.wire.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(mats.wire, 3));
    const lines = new THREE.LineSegments(g, wireMat);
    lines.name = 'TrolleyWires';
    group.add(lines);
  }
  add(unitCyl, metal, mats.trolleyPole, 'TrolleyPoles');
  add(unitCyl, meterMat, mats.meterPost, 'ParkingMeterPosts', false);
  add(unitBox, meterMat, mats.meterHead, 'ParkingMeterHeads', false);

  const sceneObstacles = footprints.concat(sites.map(p => ({ minX:p.x-.65,maxX:p.x+.65,minZ:p.z-.65,maxZ:p.z+.65 })));
  for (const matrix of [...mats.hydrant,...mats.meterPost]) {
    const x=matrix.elements[12],z=matrix.elements[14];
    sceneObstacles.push({minX:x-.3,maxX:x+.3,minZ:z-.3,maxZ:z+.3});
  }
  const sidewalkScenes = window.NYC.buildSidewalkScenes(group, network, buildingColliders, sceneObstacles);

  scene.add(group);
  console.info(`[details] ${sites.length} street trees (${snapped} moved up to ${TREE_SNAP} m onto the sidewalk, ${offSidewalk} further off left out)`);
  console.info(`[details] ${signals} signal masts, ${stops} stop signs, ${lamps} lamps, ${mats.hydrant.length} hydrants, ${muniStops} Muni stops (${shelters} shelters), ${wireKm.toFixed(1)} km of trolley wire pairs on ${trolleyPoles} poles, ${mats.meterHead.length} parking meters`);
  return { group, footprints, signalClock, trees: treeField, sidewalkScenes };
}

Object.assign(window.NYC, { buildSFStreetDetails });
})();
