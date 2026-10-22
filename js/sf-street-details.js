(function () {
// js/sf-street-details.js
// San Francisco's street furniture from the road network (road-network.js), standing on the terrain (P2.10):
// - a signal mast on the near right corner of every signalised approach, its arm reaching over the lanes and its head
//   facing the drivers, lit by the junction's own phase (the lens material reads the mast's ground, the junction's
//   offset in the cycle and its right-of-way group: the same phases traffic.js obeys);
// - a stop sign on the near right corner of every approach with one (DataSF Stop Signs);
// - cobra-head lamps every LAMP_STEP m along the streets, on alternate sides, on the curb islands;
// - a fire hydrant on a corner of every junction.
// Returns what main.js expects of buildStreetDetails: { footprints (for traffic to keep clear of), signalClock }.

const { THREE } = window.NYC;
const { mergeGeometries } = window.NYC.Addons;
const { uniform, color, mix, smoothstep } = window.NYC.TSL;
const { blockAt, cityUniforms, CURB_H, createTrafficSignalLensMaterial } = window.NYC;

const LAMP_STEP = 30;
const POLE_H = 6.4; // signal mast
const HEAD_Y = 5.42; // signal head centre above the mast's ground (the lens material's red / amber / green heights)

function buildSFStreetDetails(scene, network) {
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
    hydrant: []
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

  scene.add(group);
  console.info(`[details] ${signals} signal masts, ${stops} stop signs, ${lamps} lamps, ${mats.hydrant.length} hydrants`);
  return { group, footprints, signalClock };
}

Object.assign(window.NYC, { buildSFStreetDetails });
})();
