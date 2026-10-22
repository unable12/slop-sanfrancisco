(function () {
// js/sf-buildings.js
// San Francisco's buildings from the real footprints & lidar heights (DataSF, data/buildings-<box>.bin loaded by
// data-loader.js). Phase 1 (v0): every footprint extruded from the flat ground to its main roof, masonry facades below
// 40 m and curtain walls above, merged into one mesh per material. Returns what main.js and the map expect from
// buildings.js (colliders, update, allBlocks with footprints).

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

Object.assign(window.NYC, { buildSFBuildingsV0 });
})();
