(function () {
// js/sf-ground.js
// San Francisco's ground: the bay at the terrain's water level, the terrain surface itself (js/terrain-mesh.js: roadway,
// seawall & all), every real curb island (DataSF curbs, js/city-config.js BLOCKS) as a raised sidewalk slab with parkland
// lawns on top, and the piers. Replaces city-grid.js's Manhattan ground; returns the same shape (sidewalks, footprints,
// colliders, highwayLanes) for main.js, plus the terrain.

const { THREE } = window.NYC;
const { mergeGeometries } = window.NYC.Addons;
const { BLOCKS, LAND_RINGS, ISLAND_BOUNDS, WATERFRONT_PIERS, GEO } = window.NYC;
const { createSidewalkMaterial, createWaterMaterial, createParkLawnMaterial, buildTerrainMesh, Terrain } = window.NYC;

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
function flat(pts, y) {
  const g = new THREE.ShapeGeometry(shapeOf(pts), 1);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}
const merged = (geos, mat, name, { cast = false } = {}) => {
  const mesh = new THREE.Mesh(mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)), false), mat);
  mesh.name = name;
  mesh.receiveShadow = true;
  mesh.castShadow = cast;
  return mesh;
};

function buildSFGround(scene) {
  const group = new THREE.Group();
  group.name = 'SFGround';
  const H = ISLAND_BOUNDS.sidewalkHeight;

  // 1. The bay
  const water = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000, 1, 1).rotateX(-Math.PI / 2), createWaterMaterial());
  water.position.y = Terrain.waterLevel;
  water.name = 'SFBay';
  group.add(water);

  // 2. Land: the terrain surface (its own group, outside the static culling: its tiles rebuild as the camera moves)
  const terrain = buildTerrainMesh(scene);

  // 3. Curb islands: raised sidewalk slabs (medians & traffic islands too), lawns on the park blocks
  const slabs = [];
  const lawns = [];
  const sidewalks = [];
  for (const b of BLOCKS) {
    if (b.poly.length < 3) continue;
    slabs.push(prism(b.poly, -0.05, H));
    if (b.park > 0.5 && !b.median) lawns.push(flat(b.poly, H + 0.012));
    sidewalks.push({ minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, block: b });
  }
  group.add(merged(slabs, createSidewalkMaterial(), 'SFCurbIslands'));
  if (lawns.length) group.add(merged(lawns, createParkLawnMaterial(false), 'SFParkLawns'));

  // 4. Piers (OSM outlines): concrete decks on the bay, level with the shore they leave from (the highest ground under
  //    their outline)
  const deck = new THREE.MeshStandardNodeMaterial({ color: 0x8c8880, roughness: 0.8, metalness: 0.04 });
  const pierTop = (ring) => Math.max(...ring.map((p) => Terrain.groundAt(p.x, p.z))) + 0.1;
  const piers = WATERFRONT_PIERS.filter((p) => p.ring && p.ring.length > 2).map((p) => prism(p.ring, Terrain.waterLevel - 0.3, pierTop(p.ring)));
  if (piers.length) group.add(merged(piers, deck, 'SFPiers', { cast: true }));

  scene.add(group);
  console.info(`[ground] ${BLOCKS.length} curb islands, ${LAND_RINGS.length} land polygons, ${piers.length} piers (box ${GEO.box.name})`);
  return { group, terrain, sidewalks, footprints: [], colliders: [], highwayLanes: [] };
}

Object.assign(window.NYC, { buildSFGround });
})();
