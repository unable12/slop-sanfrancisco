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
  console.info(`[ground] ${BLOCKS.length} curb islands (${cells.size} cells, ${islandTris} triangles), ${piers.length} piers (box ${GEO.box.name})`);
  return { group, terrain, sidewalks, footprints: [], colliders: [], highwayLanes: [] };
}

Object.assign(window.NYC, { buildSFGround });
})();
