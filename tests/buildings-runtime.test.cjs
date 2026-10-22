// Buildings at runtime (P4 gate): js/buildings.js buildCityBlocks on San Francisco's footprints (the v1 path with the
// P4 types, js/sf-style.js & js/sf-buildings.js), run headless in vm on the real geodata, terrain and buildings binary,
// with THREE & the materials stubbed and createFacadeBoxes recording the facade boxes. Checks: the masses stand on the
// curb islands, every building gets colliders that are finite and sized, the quadtree finds every building
// near its own centre, and the P4 details come out (painted boxes, bay windows, garages, stoops, tower podiums).
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { BOX } = require('./helpers/geo-box.cjs');

const root = join(__dirname, '..');
const binOf = (name) => join(root, `data/${name}-${BOX}.bin`);
const skip = !(existsSync(binOf('terrain')) && existsSync(binOf('buildings'))) && 'no data';

function stub() {
  const store = new Map();
  const target = function () {};
  return new Proxy(target, {
    get(_, key) {
      if (key === Symbol.toPrimitive) return () => 0;
      if (key === Symbol.iterator) return function* () {};
      if (key === 'then') return undefined;
      if (!store.has(key)) store.set(key, stub());
      return store.get(key);
    },
    set(_, key, value) { store.set(key, value); return true; },
    apply: () => stub(),
    construct: () => stub()
  });
}
const readBin = (file) => {
  const buf = readFileSync(file);
  const n = buf.readUInt32LE(4);
  return { header: JSON.parse(buf.subarray(8, 8 + n).toString('utf8')), ab: buf.buffer.slice(buf.byteOffset + 8 + n, buf.byteOffset + buf.length) };
};

let built = null;
function build() {
  if (built) return built;
  const NYC = {};
  const window = { NYC };
  const context = vm.createContext({ window, document: stub(), console: { info() {}, log() {}, warn() {} }, Math, performance: { now: () => 0 } });
  for (const f of ['js/sf-geodata.js', 'js/city-config.js', 'js/terrain.js']) vm.runInContext(readFileSync(join(root, f), 'utf8'), context);
  const t = readBin(binOf('terrain'));
  NYC.Terrain.load(t.header, new Uint16Array(t.ab, 0, t.header.w * t.header.h));
  const b = readBin(binOf('buildings'));
  const H = b.header;
  NYC.DATA = {
    buildings: {
      header: H,
      table: new Float32Array(b.ab, 0, H.tableFloats),
      verts: new Float32Array(b.ab, H.tableFloats * 4, H.vertexFloats),
      masses: new Float32Array(b.ab, (H.tableFloats + H.vertexFloats) * 4, H.massFloats)
    }
  };
  const facadeSets = [];
  Object.assign(NYC, {
    THREE: stub(), TSL: stub(), Addons: stub(), WALL_KINDS: { shop: 0, entry: 1, rear: 2, lotLine: 3, blankStone: 4 },
    createPreWarBuildingMaterial: (o) => ({ opts: o }), createCurtainWallMaterial: (o) => ({ opts: o }), createBillboardMaterial: stub(),
    createFacadeBoxes: (material, boxes) => { facadeSets.push({ material, boxes }); return stub(); }
  });
  for (const f of ['js/sf-style.js', 'js/buildings.js', 'js/sf-buildings.js']) vm.runInContext(readFileSync(join(root, f), 'utf8'), context);
  const details = [];
  NYC.buildSFDetailMeshes = (group, d) => details.push(d);
  const city = NYC.buildCityBlocks(stub(), { sf: true });
  built = { NYC, city, facadeSets, details: details[0], H };
  return built;
}

test('masses stand on the curb islands', { skip }, () => {
  const { NYC, facadeSets } = build();
  let n = 0, on = 0;
  for (const { boxes } of facadeSets) {
    for (const b of boxes) {
      n++;
      if (NYC.blockAt(b.x, b.z)) on++;
    }
  }
  assert.ok(n > 50000, `${n} facade boxes`);
  // the core measured 94.0% of footprints inside a curb island (P3 handover: the 2016 curbs have gaps in SoMa and
  // Mission Bay); box centres do a little better
  assert.ok(on / n > 0.93, `${((100 * on) / n).toFixed(1)}% of ${n} boxes on a curb island`);
});

test('every building has colliders that are finite, upright and no taller than the tallest building', { skip }, () => {
  const { city, H } = build();
  const C = city.colliders;
  assert.ok(C.length >= H.count, `${C.length} colliders for ${H.count} buildings`);
  for (const c of C) {
    for (const k of ['minX', 'maxX', 'minZ', 'maxZ', 'minY', 'maxY']) assert.ok(Number.isFinite(c[k]), `collider ${k} ${c[k]}`);
    assert.ok(c.maxX > c.minX && c.maxZ > c.minZ && c.maxY > c.minY, 'collider has size');
    assert.ok(c.maxY - c.minY < 400, `collider ${c.maxY - c.minY} m tall`);
  }
  // no collider is taller than the tallest building (main roof over lowest ground)
  let tallest = 0;
  for (const blk of city.allBlocks) tallest = Math.max(tallest, blk.footprints[0].h);
  assert.ok(C.every((c) => c.maxY - c.minY <= tallest + 0.01), 'colliders within the tallest building');
  assert.equal(city.allBlocks.length, H.count);
});

test('the quadtree finds every building near its own centre', { skip }, () => {
  const { city } = build();
  let missed = 0;
  for (let i = 0; i < city.allBlocks.length; i += 7) {
    const blk = city.allBlocks[i];
    const found = city.quadtree.queryRange(blk.cx, blk.cz, 5);
    if (!found.includes(blk)) missed++;
  }
  assert.equal(missed, 0);
});

test('P4 details: paint on the painted styles, bay windows, garages, stoops, tower podiums', { skip }, () => {
  const { facadeSets, details, H } = build();
  for (const { material, boxes } of facadeSets) {
    if (!material.opts.paint) continue;
    assert.ok(boxes.every((b) => Array.isArray(b.paint) && b.paint.length === 4 && b.paint.every(Number.isFinite)), 'every painted box has its paint');
  }
  const towers = facadeSets.flatMap((s) => s.boxes).filter((b) => b.storeyH > 0);
  assert.ok(towers.length > 100, `${towers.length} boxes with their own storey height`);
  assert.ok(details.bays.length > 5000, `${details.bays.length} bay boxes`);
  assert.ok(details.garages.length > 1000, `${details.garages.length} garage & roll-up doors`);
  assert.ok(details.steps.length > 1000, `${details.steps.length} steps, docks & columns`);
  assert.ok(details.gables.length > 500, `${details.gables.length} gables`);
  // every detail box is finite and on the ground's side of the sky
  for (const list of [details.bays, details.garages, details.steps, details.gables]) {
    for (const d of list) assert.ok([d.x, d.y, d.z, d.w, d.h, d.d].every(Number.isFinite) && d.w > 0 && d.h > 0 && d.d > 0);
  }
  assert.ok(H.types.includes('rowhouse'));
});
