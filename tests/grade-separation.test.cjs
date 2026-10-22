// Roads off the ground (P3.3): js/grade-separation.js built in vm on the real road network, terrain and freeway data.
// The tunnels (Broadway, Stockton) run under their hills with a floor the player finds from inside and the hill from
// above; the Mission Creek bridges carry a deck over the water; the freeways' decks and highway lanes stand on the
// ground or above it.
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { BOX } = require('./helpers/geo-box.cjs');

const root = join(__dirname, '..');
const terrainFile = join(root, `data/terrain-${BOX}.bin`);
const skip = (!existsSync(terrainFile) || BOX === 'slice') && 'needs the core terrain';

// Just enough of THREE for the builder: geometry kept as arrays, materials as plain objects
class Vector3 { constructor(x = 0, y = 0, z = 0) { Object.assign(this, { x, y, z }); } }
class Group { constructor() { this.children = []; } add(...o) { this.children.push(...o); } }
class BufferAttribute { constructor(array, size) { Object.assign(this, { array, size }); } }
class BufferGeometry {
  constructor() { this.attributes = {}; }
  setAttribute(k, a) { this.attributes[k] = a; }
  computeVertexNormals() {}
  computeBoundingSphere() {}
}
class Mesh { constructor(geometry, material) { Object.assign(this, { geometry, material }); } }
class Material { constructor(o) { Object.assign(this, o); } }
const THREE = { Vector3, Group, BufferAttribute, BufferGeometry, Mesh, MeshStandardNodeMaterial: Material, MeshBasicNodeMaterial: Material, DoubleSide: 2 };

function build() {
  const context = vm.createContext({ window: { NYC: { DEBUG_ROADS: false } }, console: { info() {}, log: console.log } });
  for (const f of ['js/sf-geodata.js', 'js/city-config.js', 'js/terrain.js', 'js/road-network.js']) vm.runInContext(readFileSync(join(root, f), 'utf8'), context);
  const NYC = context.window.NYC;
  const buf = readFileSync(terrainFile);
  const n = buf.readUInt32LE(4);
  const header = JSON.parse(buf.subarray(8, 8 + n).toString('utf8'));
  NYC.Terrain.load(header, new Uint16Array(buf.buffer.slice(buf.byteOffset + 8 + n, buf.byteOffset + buf.length), 0, header.w * header.h));
  Object.assign(NYC, { THREE, createRoadSurfaceMaterial: () => new Material({}), createMarbleAshlarMaterial: () => new Material({}) });
  vm.runInContext(readFileSync(join(root, 'js/grade-separation.js'), 'utf8'), context);
  const sidewalks = NYC.BLOCKS.map((b) => ({ minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, block: b }));
  const network = NYC.buildRoadNetwork(sidewalks, []);
  const scene = new Group();
  const grade = NYC.buildGradeSeparation(scene, network);
  return { NYC, network, grade, scene };
}

test('tunnels: AI lanes through both bores, a floor found from inside the bore and the hill from above it', { skip }, () => {
  const { NYC, network, grade } = build();
  const T = NYC.Terrain;
  for (const name of ['STOCKTON TUNL', 'ROBERT C LEVY TUNL']) {
    const edges = network.edges.filter((e) => e.name === name && e.bore && e.bore.kind === 'tunnel');
    assert.ok(edges.length >= 2, `${name}: ${edges.length} edges driven both ways`);
    // deepest point of the bore: the hill well over the floor, the floor where the lanes run
    let best = null;
    for (const e of edges) {
      for (let s = 0; s <= e.len; s += 4) {
        const x = e.sx + e.dx * s, z = e.sz + e.dz * s;
        const cover = T.groundAt(x, z) - network.edgeY(e, s);
        if (!best || cover > best.cover) best = { e, s, x, z, cover };
      }
    }
    assert.ok(best.cover > 10, `${name}: ${best.cover.toFixed(1)} m of hill over the deepest point`);
    const y = network.edgeY(best.e, best.s);
    assert.ok(Math.abs(grade.floorAt(best.x, best.z, y + 1) - y) < 0.05, `${name}: floor from inside`);
    assert.equal(grade.floorAt(best.x, best.z, T.groundAt(best.x, best.z)), null, `${name}: the hill from above`);
    assert.ok(Math.abs(grade.roofAt(best.x, best.z, y + 1) - (y + 5.2)) < 0.05);
    assert.ok(grade.carveAt(best.x, best.z) === null, `${name}: the hill stays over the deep bore`);
  }
  // pedestrians can't walk in: no tunnel lane ends on a curb island's sidewalk mid-bore
  for (const e of network.edges.filter((e) => e.bore && e.bore.kind === 'tunnel')) {
    const mid = e.len / 2;
    assert.equal(network.onSidewalk(e.sx + e.dx * mid, e.sz + e.dz * mid) && !e.bore, false);
  }
});

test('bridges: the 3rd and 4th St decks carry their lanes over Mission Creek', { skip }, () => {
  const { NYC, network, grade } = build();
  const T = NYC.Terrain;
  for (const name of ['03RD ST', '04TH ST']) {
    const edges = network.edges.filter((e) => e.name === name && e.bore && e.bore.kind === 'bridge');
    assert.ok(edges.length >= 2, `${name}: ${edges.length} bridge edges`);
    let wet = 0;
    for (const e of edges) {
      for (let s = 0; s <= e.len; s += 2) {
        const x = e.sx + e.dx * s, z = e.sz + e.dz * s;
        if (T.heightAt(x, z) > T.waterLevel + 0.05) continue;
        wet++;
        const y = network.edgeY(e, s);
        assert.ok(y > T.waterLevel + 2, `${name}: deck ${y.toFixed(2)} over the water`);
        assert.ok(Math.abs(grade.floorAt(x, z, y + 0.5) - y) < 0.05, `${name}: deck floor`);
      }
    }
    assert.ok(wet > 5, `${name}: ${wet} samples over the water`);
  }
});

test('freeways: decks on or over the ground, highway lanes along them, finite colliders', { skip }, () => {
  const { NYC, grade } = build();
  const T = NYC.Terrain;
  assert.ok(grade.highwayLanes.length >= 4, `${grade.highwayLanes.length} lanes`);
  let over = 0;
  for (const lane of grade.highwayLanes) {
    assert.ok(lane.pts.length > 10 && lane.speed > 0);
    for (const p of lane.pts) {
      assert.ok(Number.isFinite(p.x + p.y + p.z));
      assert.ok(p.y >= T.groundAt(p.x, p.z) - 0.5, `lane at ${p.x.toFixed(0)}, ${p.z.toFixed(0)}: ${(p.y - T.groundAt(p.x, p.z)).toFixed(2)} m under the ground`);
      if (p.y > T.groundAt(p.x, p.z) + 5) over++;
    }
  }
  assert.ok(over > 100, `${over} lane points on viaducts`);
  for (const c of grade.colliders) {
    assert.ok([c.minX, c.maxX, c.minZ, c.maxZ, c.minY, c.maxY].every(Number.isFinite) && c.maxY > c.minY);
  }
});
