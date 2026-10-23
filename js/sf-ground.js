(function () {
// js/sf-ground.js
// San Francisco's ground: the bay at the terrain's water level, the terrain surface itself (js/terrain-mesh.js: roadway,
// seawall & all), every real curb island (DataSF curbs, js/city-config.js BLOCKS) as a sidewalk draped CURB_H above the
// terrain behind granite curb faces (js/drape.js), with parkland lawns on top, and the piers. Replaces city-grid.js's Manhattan ground; returns the same shape (sidewalks, footprints,
// colliders, highwayLanes) for main.js, plus the terrain.

const { THREE } = window.NYC;
const { mergeGeometries } = window.NYC.Addons;
const { BLOCKS, WATERFRONT_PIERS, GEO } = window.NYC;
const { createSidewalkMaterial, createCurbMaterial, createWaterMaterial, createParkLawnMaterial, buildTerrainMesh, Terrain, Drape, CURB_H } = window.NYC;

const CELL = 512; // curb islands are merged per CELL x CELL m square (one draw per material per cell, frustum culled)
const OUTLINE_STEP = 2; // metres between outline points: curbs follow the grade at the height field's spacing
const CURB_BURY = 0.3; // curb faces reach this far below the road surface (coarser terrain levels sag between samples)

const shapeOf = (pts) => {
  const s = new THREE.Shape();
  pts.forEach((p, i) => (i ? s.lineTo(p.x, -p.z) : s.moveTo(p.x, -p.z)));
  s.closePath();
  return s;
};
// Prism over a ring from y0 to y1 (world xz), flat-shaded
function prism(pts, y0, y1) {
  const g = new THREE.ExtrudeGeometry(shapeOf(pts), { depth: y1 - y0, bevelEnabled: false, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  return g;
}
const merged = (geos, mat, name, { cast = false } = {}) => {
  const mesh = new THREE.Mesh(mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)), false), mat);
  mesh.name = name;
  mesh.receiveShadow = true;
  mesh.castShadow = cast;
  return mesh;
};

// Arrays from js/drape.js as a mesh
function drapedMesh(out, mat, name) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(out.nrm, 3));
  g.setIndex(out.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(out.idx, 1) : new THREE.Uint16BufferAttribute(out.idx, 1));
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = name;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return mesh;
}

// Interim ground outside the core (PLAN P5-1): the 16 m DEM grid (data/terrain-region.bin) as 2 km chunks, so the
// landmarks beyond the core (Sutro Tower, the Palace of Fine Arts, the Golden Gate's south end) stand on their real
// hills until phase 6's region terrain. Bare ground, coloured by slope; quads all on the water or all inside the core's
// own terrain are skipped, vertices on the water drop 4 m under it (the seawall rule, P2-2) and those under the core's
// terrain 1.5 m (no z-fighting where the two overlap). Receives shadows, casts none
function buildRegionGround(region) {
  const group = new THREE.Group();
  group.name = 'SFRegionGround';
  // finer DEM patches over some sites (GEO.landmarks[...].detail: Alcatraz's cliffs), checked before the region's
  const details = Object.values(window.NYC.GEO.landmarks).filter((s) => s.detail).map((s) => {
    const d = s.detail, h = new Float32Array(d.h.length);
    for (let k = 0; k < h.length; k++) h[k] = d.h[k] / 10;
    const patch = { x0: d.x0, z0: d.z0, step: d.step, nx: d.nx, nz: d.nz, h, rect: true };
    Terrain.patches.unshift(patch);
    return patch;
  });
  const inDetail = (x, z) => details.some((d) => x > d.x0 + region.step && z > d.z0 + region.step && x < d.x0 + (d.nx - 1) * d.step - region.step && z < d.z0 + (d.nz - 1) * d.step - region.step);
  for (const d of details) addGroundMesh(group, d, () => false, null);
  addGroundMesh(group, region, inDetail, details.length ? (x, z) => details.some((d) => x >= d.x0 && z >= d.z0 && x <= d.x0 + (d.nx - 1) * d.step && z <= d.z0 + (d.nz - 1) * d.step) : null);
  return group;
}
// A ground patch as 2 km chunks (CH cells): `skip(x, z)` cells (all four corners) are left out, `under(x, z)` vertices
// sit 0.5 m low (under a finer patch's edge)
function addGroundMesh(group, p, skip, under) {
  const mat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
  const water = Terrain.waterLevel;
  const cx0 = Terrain.originX + Terrain.cell, cz0 = Terrain.originZ + Terrain.cell;
  const cx1 = Terrain.originX + (Terrain.w - 2) * Terrain.cell, cz1 = Terrain.originZ + (Terrain.h - 2) * Terrain.cell;
  const inCore = (x, z) => x > cx0 && x < cx1 && z > cz0 && z < cz1;
  const lowland = new THREE.Color(0x6f6c56), upland = new THREE.Color(0x5e6a45), rock = new THREE.Color(0x6e6558), c = new THREE.Color();
  const CH = 128;
  for (let cj = 0; cj < p.nz - 1; cj += CH) {
    for (let ci = 0; ci < p.nx - 1; ci += CH) {
      const nx = Math.min(CH, p.nx - 1 - ci) + 1, nz = Math.min(CH, p.nz - 1 - cj) + 1;
      const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3);
      const wet = new Uint8Array(nx * nz), core = new Uint8Array(nx * nz);
      for (let j = 0; j < nz; j++) {
        for (let i = 0; i < nx; i++) {
          const gi = ci + i, gj = cj + j, k = j * nx + i, y = p.h[gj * p.nx + gi];
          const x = p.x0 + gi * p.step, z = p.z0 + gj * p.step;
          wet[k] = y <= water + 0.05 ? 1 : 0;
          core[k] = inCore(x, z) || skip(x, z) ? 1 : 0;
          pos[k * 3] = x; pos[k * 3 + 1] = wet[k] ? water - 4 : inCore(x, z) ? y - 1.5 : under && under(x, z) ? y - 0.5 : y; pos[k * 3 + 2] = z;
          const gx = p.h[gj * p.nx + Math.min(p.nx - 1, gi + 1)] - p.h[gj * p.nx + Math.max(0, gi - 1)];
          const gz = p.h[Math.min(p.nz - 1, gj + 1) * p.nx + gi] - p.h[Math.max(0, gj - 1) * p.nx + gi];
          const slope = Math.hypot(gx, gz) / (2 * p.step);
          const n = (Math.sin(x * 0.0131 + z * 0.0097) + Math.sin(x * 0.0043 - z * 0.0061)) * 0.25 + 0.5;
          c.copy(lowland).lerp(upland, Math.min(1, Math.max(0, (y - 40) / 120)) * 0.7 + n * 0.3).lerp(rock, Math.min(1, Math.max(0, (slope - 0.35) * 2.5)));
          col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
        }
      }
      const idx = [];
      for (let j = 0; j + 1 < nz; j++) {
        for (let i = 0; i + 1 < nx; i++) {
          const k = j * nx + i, q = [k, k + 1, k + nx, k + nx + 1];
          if (q.every((v) => wet[v]) || q.every((v) => core[v])) continue;
          idx.push(k, k + nx, k + 1, k + 1, k + nx, k + nx + 1);
        }
      }
      if (!idx.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'SFRegionGroundChunk';
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }
}

function buildSFGround(scene) {
  const group = new THREE.Group();
  group.name = 'SFGround';

  // 1. The bay
  const water = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000, 1, 1).rotateX(-Math.PI / 2), createWaterMaterial());
  water.position.y = Terrain.waterLevel;
  water.name = 'SFBay';
  group.add(water);

  // 2. Land: the terrain surface (its own group, outside the static culling: its tiles rebuild as the camera moves)
  const terrain = buildTerrainMesh(scene);

  // 3. Curb islands (blocks, medians & traffic islands): sidewalk tops draped CURB_H above the terrain, granite curb
  //    faces down to the roadway, lawns on the park blocks; merged per CELL square
  const ground = (x, z) => Terrain.groundAt(x, z);
  const normal = (x, z, o) => Terrain.normalAt(x, z, o);
  const cells = new Map();
  const cellOf = (b) => {
    const key = Math.floor((b.minX + b.maxX) / 2 / CELL) + ',' + Math.floor((b.minZ + b.maxZ) / 2 / CELL);
    let c = cells.get(key);
    if (!c) cells.set(key, (c = { top: { pos: [], nrm: [], idx: [] }, curb: { pos: [], nrm: [], idx: [] }, lawn: { pos: [], nrm: [], idx: [] } }));
    return c;
  };
  const sidewalks = [];
  for (const b of BLOCKS) {
    if (b.poly.length < 3) continue;
    const ring = Drape.densify(b.poly, OUTLINE_STEP);
    const c = cellOf(b);
    Drape.polygon(ring, ground, normal, CURB_H, c.top);
    Drape.wall(ring, ground, -CURB_BURY, CURB_H, c.curb);
    if (b.park > 0.5 && !b.median) Drape.polygon(ring, ground, normal, CURB_H + 0.012, c.lawn);
    sidewalks.push({ minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, block: b });
  }
  const sidewalkMat = createSidewalkMaterial();
  const curbMat = createCurbMaterial();
  const lawnMat = createParkLawnMaterial(false);
  let islandTris = 0;
  for (const c of cells.values()) {
    if (c.top.idx.length) group.add(drapedMesh(c.top, sidewalkMat, 'SFCurbIslands'));
    if (c.curb.idx.length) group.add(drapedMesh(c.curb, curbMat, 'SFCurbs'));
    if (c.lawn.idx.length) group.add(drapedMesh(c.lawn, lawnMat, 'SFParkLawns'));
    islandTris += (c.top.idx.length + c.curb.idx.length + c.lawn.idx.length) / 3;
  }

  // 4. Piers (OSM outlines): concrete decks on the bay, level with the shore they leave from (the highest ground under
  //    their outline)
  const deck = new THREE.MeshStandardNodeMaterial({ color: 0x8c8880, roughness: 0.8, metalness: 0.04 });
  const pierTop = (ring) => Math.max(...ring.map((p) => Terrain.groundAt(p.x, p.z))) + 0.1;
  const piers = WATERFRONT_PIERS.filter((p) => p.ring && p.ring.length > 2).map((p) => prism(p.ring, Terrain.waterLevel - 0.3, pierTop(p.ring)));
  if (piers.length) group.add(merged(piers, deck, 'SFPiers', { cast: true }));

  scene.add(group);
  // ?region=0: without the interim region ground (A/B for the perf log)
  if (window.NYC.DATA && window.NYC.DATA.region && new URLSearchParams(location.search).get('region') !== '0') scene.add(buildRegionGround(window.NYC.DATA.region));
  console.info(`[ground] ${BLOCKS.length} curb islands (${cells.size} cells, ${islandTris} triangles), ${piers.length} piers (box ${GEO.box.name})`);
  return { group, terrain, sidewalks, footprints: [], colliders: [], highwayLanes: [] };
}

Object.assign(window.NYC, { buildSFGround });
})();
