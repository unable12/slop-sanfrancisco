(function () {
// js/sf-buildings.js
// San Francisco's buildings from the real footprints & lidar heights (DataSF, data/buildings-<box>.bin loaded by
// data-loader.js). Phase 1 (v0): every footprint extruded from the flat ground to its main roof, masonry facades below
// 40 m and curtain walls above, merged into one mesh per material. Returns what main.js and the map expect from
// buildings.js (colliders, update, allBlocks with footprints). Phase 4: the fronts of row houses, flats and apartment
// houses for buildings.js's v1 path (sfFrontDetails, buildSFDetailMeshes).

const { THREE } = window.NYC;
const { mergeGeometries } = window.NYC.Addons;
const { createPreWarBuildingMaterial, createCurtainWallMaterial } = window.NYC;

const TALL = 40; // metres: curtain walls from here up

function buildSFBuildingsV0(scene) {
  const { header, table, verts } = window.NYC.DATA.buildings;
  const group = new THREE.Group();
  group.name = 'SFBuildings';
  const low = [];
  const tall = [];
  const colliders = [];
  const footprints = [];
  const F = header.fields.length;
  for (let i = 0; i < header.count; i++) {
    const [base, roof, , start, count] = table.subarray(i * F, i * F + 5);
    const h = roof - base;
    const pts = [];
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let k = 0; k < count; k++) {
      const x = verts[2 * (start + k)], z = verts[2 * (start + k) + 1];
      pts.push({ x, z });
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    const shape = new THREE.Shape();
    pts.forEach((p, k) => (k ? shape.lineTo(p.x, -p.z) : shape.moveTo(p.x, -p.z)));
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 1 });
    g.rotateX(-Math.PI / 2);
    (h >= TALL ? tall : low).push(g.index ? g.toNonIndexed() : g);
    colliders.push({ minX, maxX, minZ, maxZ, maxY: h });
    footprints.push({ pts, h });
  }
  const add = (geos, mat, name) => {
    if (!geos.length) return;
    const mesh = new THREE.Mesh(mergeGeometries(geos, false), mat);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  add(low, createPreWarBuildingMaterial({ stoneColor: 0xd9cdb8, trimColor: 0xa39780, floorHeight: 3.4, windowWidth: 2.4 }), 'SFBuildingsLow');
  add(tall, createCurtainWallMaterial({ glassTint: 0x1c3044, floorHeight: 3.9 }), 'SFBuildingsTall');
  scene.add(group);
  console.info(`[buildings] v0: ${header.count} footprints (${tall.length} >= ${TALL} m)`);
  return {
    group,
    colliders,
    quadtree: null,
    allBlocks: [{ footprints }],
    update() {}
  };
}

// P4.2: the front of a row house, flats or apartment house (buildings.js buildSFMasses, on its largest mass `box`, a
// createFacadeBoxes box). Walls are in createFacadeBoxes `faces` order (local -x, +x, -z, +z); the front is its longest
// entrance wall (else its longest shop front: bay windows only). The facade shader's window bays are laid out the same
// way here (corner piers, whole bays), so the details line up with them:
// - bay windows: `bays` boxes 0.85 m deep from the second storey to under the cornice, square or angled (a front and
//   two 45-ish degree sides), in the same facade material (they get windows) -> details.bays;
// - a garage door at the downhill end of the front where the ground drops along it (`garage`), the entrance moved to
//   the uphill end (the shader's door bay follows the box's tone) -> details.garages;
// - a stoop under the entrance when the floors start more than 0.5 m above the sidewalk there, as many treads as the
//   sidewalk in front has room for (risers up to 0.22 m) -> details.steps; a front higher than that gets a street-level
//   door instead, and a garage under the floors in another bay where the front stands 2.3 m or more above the sidewalk
//   (SF's garages under the house on the hills) -> details.garages;
// - a false-front gable on top of the front wall (`gable`) -> details.gables.
// o: { i, roof, bays, garage, storey, windowWidth, cornerPier, groundAt, roadAt(x, z), gable, hash(seed) -> [0, 1) }
const WALL_ENTRY = 1, WALL_SHOP = 0;
const WALLS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const ryOf = (u) => Math.atan2(-u[1], u[0]); // the turn about +y that lays a box's local +x along world (u[0], u[1])
// The front of a facade box: its longest entrance wall, else its longest shop front. W: its width; at(a, out): the world
// point a m along it (from its middle, in the facade shader's along-wall direction A) and out m in front of it
function frontOf(box) {
  const cs = Math.cos(box.ry || 0), sn = Math.sin(box.ry || 0);
  let f = -1;
  const len = (k) => (WALLS[k][0] ? box.d : box.w);
  for (const kind of [WALL_ENTRY, WALL_SHOP]) {
    for (let k = 0; k < 4; k++) if (box.faces[k] === kind && (f < 0 || len(k) > len(f))) f = k;
    if (f >= 0) break;
  }
  if (f < 0) return null;
  const [lx, lz] = WALLS[f];
  const half = lx ? box.w * 0.5 : box.d * 0.5;
  const N = [lx * cs + lz * sn, -lx * sn + lz * cs];
  const A = lx ? [sn, cs] : [cs, -sn]; // the shader's along-wall direction (local z on +-x walls, local x on +-z walls)
  const at = (a, out) => [box.x + N[0] * (half + out) + A[0] * a, box.z + N[1] * (half + out) + A[1] * a];
  return { entry: box.faces[f] === WALL_ENTRY, W: len(f), N, A, at };
}
function sfFrontDetails(details, box, o) {
  const fr = frontOf(box);
  if (!fr) return;
  const { entry, W, A, at } = fr;
  const datum = box.base + box.plinth;
  // the facade shader's bays on this wall
  const pier = Math.min(o.cornerPier, W * 0.2);
  const nb = Math.max(Math.floor((W - 2 * pier) / o.windowWidth + 0.5), 1);
  const bw = (W - 2 * pier) / nb;
  const bayAt = (k) => -W * 0.5 + pier + (k + 0.5) * bw;
  const ground = (a) => o.groundAt(...at(a, 0.6));

  let doorBay = Math.min(Math.floor(box.tone * nb), nb - 1);
  let garageBay = -1;
  const downLeft = ground(-W * 0.5 + 0.5) < ground(W * 0.5 - 0.5);
  const garageColor = [0xe8e4dc, 0x8a8478, 0x5a4a3c, 0xb8b2a6][Math.floor(o.hash(17.1) * 4)];
  const garageAt = (k) => {
    const gw = Math.min(2.6, Math.max(bw, W * 0.4));
    const a = Math.max(-W * 0.5 + gw * 0.5 + 0.1, Math.min(W * 0.5 - gw * 0.5 - 0.1, bayAt(k)));
    const g = ground(a);
    const [x, z] = at(a, 0.06);
    details.garages.push({ x, y: g + 1.1, z, w: gw, h: 2.3, d: 0.12, ry: ryOf(A), color: garageColor });
  };
  if (entry && o.garage && nb >= 2) {
    garageBay = downLeft ? 0 : nb - 1;
    doorBay = downLeft ? nb - 1 : 0;
    box.tone = (doorBay + 0.5) / nb;
    garageAt(garageBay);
  }
  // stoop: steps out from the entrance down to the sidewalk, as many 0.28 m treads as fit before the roadway
  if (entry) {
    const a = bayAt(doorBay);
    const g = ground(a);
    const rise = datum - g;
    let room = 0;
    for (let out = 0.3; out < 8 && !o.roadAt(...at(a, out)); out += 0.28) room++;
    const n = Math.min(12, Math.max(1, room - 1), Math.ceil(rise / 0.18));
    if (rise > 0.5 && rise / n <= 0.22) {
      const sh = rise / n;
      const sw = Math.min(bw * 0.9, 1.6);
      const stone = o.hash(31.3) < 0.6 ? 0x8f8a82 : box.paint[1];
      for (let j = 0; j < n; j++) {
        const top = datum - j * sh;
        const [x, z] = at(a, 0.14 + j * 0.28);
        details.steps.push({ x, y: (top + g - 0.3) * 0.5, z, w: sw, h: top - g + 0.3, d: 0.28, ry: ryOf(A), color: stone });
      }
    } else if (rise > 0.5) {
      // too high for a stoop: a street-level door, and a garage under the floors where they stand high enough
      const [x, z] = at(a, 0.05);
      details.garages.push({ x, y: g + 1.05, z, w: Math.min(1.2, bw * 0.8), h: 2.2, d: 0.1, ry: ryOf(A), color: 0x4a3426 });
      const k = downLeft ? 0 : nb - 1;
      if (garageBay < 0 && k !== doorBay && datum - ground(bayAt(k)) >= 2.3) { garageBay = k; garageAt(k); }
    }
  }
  // bay windows from the second storey to under the cornice
  const y0 = datum + o.storey, y1 = o.roof - 0.45;
  const count = Math.min(o.bays, 4);
  if (count > 0 && y1 - y0 > o.storey * 0.9) {
    const bwid = Math.min(2.6, W / count - 0.7);
    const centres = count === 1 ? [nb >= 2 ? bayAt(garageBay >= 0 ? garageBay : doorBay === 0 ? nb - 1 : 0) : 0] : Array.from({ length: count }, (_, k) => -W * 0.5 + (W * (k + 0.5)) / count);
    const DEPTH = 0.85;
    const bay = (cx, cz, u, w, d) => ({
      x: cx, y: (y0 + y1) * 0.5, z: cz, w, h: y1 - y0, d, ry: ryOf(u), tone: box.tone,
      base: box.base, plinth: box.plinth, storeyH: box.storeyH, paint: box.paint, faces: [WALL_ENTRY, WALL_ENTRY, WALL_ENTRY, WALL_ENTRY]
    });
    if (bwid >= 1.3) {
      const angled = o.hash(23.9) < 0.5 && bwid >= 2.0;
      for (const c of centres) {
        if (!angled) {
          const [x, z] = at(c, DEPTH * 0.5);
          details.bays.push(bay(x, z, A, bwid, DEPTH));
          continue;
        }
        const inset = 0.55;
        const [x, z] = at(c, DEPTH * 0.5);
        details.bays.push(bay(x, z, A, bwid - 2 * inset, DEPTH));
        for (const side of [-1, 1]) {
          const p0 = at(c + side * bwid * 0.5, 0), p1 = at(c + side * (bwid * 0.5 - inset), DEPTH);
          const u = [p1[0] - p0[0], p1[1] - p0[1]];
          const L = Math.hypot(u[0], u[1]);
          u[0] /= L; u[1] /= L;
          // its thickness goes in towards the bay's middle
          let v = [-u[1], u[0]];
          const mid = at(c, DEPTH * 0.5);
          const m = [(p0[0] + p1[0]) * 0.5, (p0[1] + p1[1]) * 0.5];
          if (v[0] * (mid[0] - m[0]) + v[1] * (mid[1] - m[1]) < 0) v = [-v[0], -v[1]];
          const T = 0.35;
          details.bays.push(bay(m[0] + v[0] * T * 0.5, m[1] + v[1] * T * 0.5, u, L, T));
        }
      }
    }
  }
  // false-front gable over the front wall, in the wall's paint
  if (o.gable && W >= 4) {
    const [x, z] = at(0, -0.175);
    details.gables.push({ x, y: o.roof, z, w: W, h: Math.max(1.0, Math.min(2.4, W * 0.28)), d: 0.35, ry: ryOf(A), color: box.paint[0] });
  }
}

// Instanced meshes for the garage & roll-up doors (panelled), stoop steps, docks & colonnades, gables and spires: four
// draws for the whole city
function buildSFDetailMeshes(group, details) {
  const { Fn, positionGeometry, float, vec3, fract, smoothstep, abs } = window.NYC.TSL;
  const prism = new THREE.BufferGeometry();
  {
    // a unit triangular prism: triangle (-0.5, 0) (0.5, 0) (0, 1) in x-y, from z -0.5 to 0.5
    const P = [[-0.5, 0], [0.5, 0], [0, 1]];
    const pos = [];
    const tri = (a, b, c) => pos.push(...a, ...b, ...c);
    const v = (k, z) => [P[k][0], P[k][1], z];
    tri(v(0, 0.5), v(1, 0.5), v(2, 0.5));
    tri(v(1, -0.5), v(0, -0.5), v(2, -0.5));
    for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
      tri(v(a, -0.5), v(b, -0.5), v(b, 0.5));
      tri(v(a, -0.5), v(b, 0.5), v(a, 0.5));
    }
    prism.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    prism.computeVertexNormals();
  }
  const garageMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.6, metalness: 0.15 });
  // four horizontal panels with dark joints between them
  garageMat.colorNode = Fn(() => {
    const t = fract(positionGeometry.y.add(0.5).mul(4.0));
    const joint = float(1.0).sub(smoothstep(0.02, 0.05, float(0.5).sub(abs(t.sub(0.5)))));
    return vec3(1.0).mul(float(1.0).sub(joint.mul(0.45)));
  })();
  const spire = new THREE.ConeGeometry(0.5, 1, 4, 1);
  spire.translate(0, 0.5, 0);
  spire.rotateY(Math.PI / 4);
  const sets = [
    ['SFSpires', details.spires, spire, new THREE.MeshStandardNodeMaterial({ roughness: 0.35, metalness: 0.7 })],
    ['SFGarageDoors', details.garages, new THREE.BoxGeometry(1, 1, 1), garageMat],
    ['SFStoops', details.steps, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0.0 })],
    ['SFGables', details.gables, prism, new THREE.MeshStandardNodeMaterial({ roughness: 0.8, metalness: 0.0 })]
  ];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), scl = new THREE.Vector3();
  const col = new THREE.Color();
  for (const [name, items, geo, mat] of sets) {
    if (!items.length) continue;
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    items.forEach((it, k) => {
      mesh.setMatrixAt(k, m.compose(pos.set(it.x, it.y, it.z), q.setFromAxisAngle(up, it.ry), scl.set(it.w, it.h, it.d)));
      mesh.setColorAt(k, col.setHex(it.color));
    });
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  console.info(`[buildings] fronts: ${details.bays.length} bay boxes, ${details.garages.length} doors, ${details.steps.length} steps / docks / columns, ${details.gables.length} gables, ${details.spires.length} spires`);
}

// P4.3 warehouses: roll-up doors along the front (one per 18 m, 3.6 x 3.8 m, on the ground) and, where the front
// looks onto an alley (roadway under 9 m across), a 1.2 m loading dock 1.6 m deep along most of it, the doors on top
function sfWarehouseFront(details, box, o) {
  const fr = frontOf(box);
  if (!fr || fr.W < 8) return;
  const { W, A, at } = fr;
  let road = 0, across = 0;
  for (let out = 0.5; out < 30; out += 0.5) {
    const r = o.roadAt(...at(0, out));
    if (r) road++;
    else if (road) break;
    across = out;
  }
  const alley = road > 0 && road * 0.5 < 9 && across < 29.5;
  const g = o.groundAt(...at(0, 0.6));
  const dockH = alley ? 1.2 : 0;
  if (alley) {
    const [x, z] = at(0, 0.8);
    details.steps.push({ x, y: g + dockH * 0.5 - 0.15, z, w: W * 0.7, h: dockH + 0.3, d: 1.6, ry: ryOf(A), color: 0x9a968e });
  }
  const n = Math.max(1, Math.floor(W / 18));
  for (let k = 0; k < n; k++) {
    const a = -W * 0.5 + (W * (k + 0.5)) / n;
    const gk = alley ? g : o.groundAt(...at(a, 0.6));
    const [x, z] = at(a, 0.06);
    details.garages.push({ x, y: gk + dockH + 1.9, z, w: 3.6, h: 3.8, d: 0.12, ry: ryOf(A), color: [0x8c8f92, 0x6e7378, 0xa8a49a][Math.floor(o.hash(41.3 + k) * 3)] });
  }
}

// P4.3 civic buildings: a colonnade band on the front, engaged columns every ~3.5 m under an entablature, two storeys
// tall (at most 40% of the building); they stand on the wall, not on the sidewalk
function sfCivicFront(details, box, o) {
  const fr = frontOf(box);
  if (!fr || fr.W < 10) return;
  const { W, A, at } = fr;
  const datum = box.base + box.plinth;
  const H = Math.min(2 * o.storey, (o.roof - datum) * 0.4);
  if (H < 4) return;
  const stone = box.paint[0];
  const n = Math.max(3, Math.floor((W - 2) / 3.5) + 1);
  for (let k = 0; k < n; k++) {
    const a = -W * 0.5 + 1 + ((W - 2) * k) / (n - 1);
    const g = Math.min(datum, o.groundAt(...at(a, 0.6)));
    const [x, z] = at(a, 0.2);
    details.steps.push({ x, y: (g + datum + H) * 0.5, z, w: 0.8, h: datum + H - g, d: 0.4, ry: ryOf(A), color: stone });
  }
  const [x, z] = at(0, 0.25);
  details.steps.push({ x, y: datum + H + 0.5, z, w: W, h: 1.0, d: 0.5, ry: ryOf(A), color: stone });
}

// P4.3 crowns over a tower's (or midrise's) top box, from how far the lidar's highest return rises over its main roof
// (o.crown m): a mechanical penthouse up to 12 m (blk.hvacUnits); up to 45 m a setback block of the building's own facade
// (65% of the plan) with a penthouse on it; higher a setback of a third of it (50% of the plan) and a spire to the peak
// (details.spires). The lidar can't tell a spire from an antenna mast; both are drawn as a spire
function sfCrown(details, blk, box, o) {
  const top = o.roof;
  const pent = (w, d, y, h) => blk.hvacUnits.push({ x: box.x, y, z: box.z, w, h, d });
  if (o.crown <= 12) { pent(box.w * 0.45, box.d * 0.45, top, o.crown); return; }
  const tall = o.crown <= 45;
  const f = tall ? 0.65 : 0.5;
  const h = tall ? Math.max(o.storey, o.crown - 3) : Math.min(o.crown / 3, 20);
  o.bucket.push({ ...box, y: top + h * 0.5, w: box.w * f, h, d: box.d * f, faces: [WALL_ENTRY, WALL_ENTRY, WALL_ENTRY, WALL_ENTRY] });
  if (tall) { pent(box.w * f * 0.6, box.d * f * 0.6, top + h, Math.min(3, o.crown - h)); return; }
  const r = Math.max(0.6, Math.min(box.w, box.d) * 0.04);
  details.spires.push({ x: box.x, y: top + h, z: box.z, w: r * 2, h: o.crown - h, d: r * 2, ry: box.ry || 0, color: 0xb8bcc0 });
}

Object.assign(window.NYC, { buildSFBuildingsV0, sfFrontDetails, buildSFDetailMeshes, sfWarehouseFront, sfCivicFront, sfCrown });
})();
