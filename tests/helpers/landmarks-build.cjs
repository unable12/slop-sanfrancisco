// Builds js/landmarks.js and js/sf-bridges.js headless in vm on the real geodata, terrain and buildings binary, with
// THREE and the materials stubbed (as tests/buildings-runtime.test.cjs): their colliders, cover test and stats. Shared
// by tests/landmarks-runtime.test.cjs and tests/controllers.test.cjs.
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const { BOX } = require('./geo-box.cjs');

const root = join(__dirname, '../..');
const binOf = (name) => join(root, `data/${name}-${BOX}.bin`);
const available = existsSync(binOf('terrain')) && existsSync(binOf('buildings'));

function stub() {
  const store = new Map();
  return new Proxy(function () {}, {
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
function buildLandmarksHeadless() {
  if (built) return built;
  const NYC = {};
  const window = { NYC };
  const context = vm.createContext({ window, document: stub(), console: { info() {}, log() {}, warn() {} }, Math, performance: { now: () => 0 } });
  for (const f of ['js/sf-geodata.js', 'js/city-config.js', 'js/terrain.js']) vm.runInContext(readFileSync(join(root, f), 'utf8'), context);
  const t = readBin(binOf('terrain'));
  NYC.Terrain.load(t.header, new Uint16Array(t.ab, 0, t.header.w * t.header.h));
  const r = readBin(join(root, NYC.GEO.data.region.url));
  const q = new Uint16Array(r.ab, 0, r.header.w * r.header.h);
  const h = new Float32Array(q.length);
  for (let k = 0; k < q.length; k++) h[k] = r.header.minH + q[k] * r.header.scale;
  NYC.Terrain.addPatch({ x0: r.header.originX, z0: r.header.originZ, step: r.header.cell, nx: r.header.w, nz: r.header.h, h, rect: true });
  const b = readBin(binOf('buildings'));
  const H = b.header;
  NYC.DATA = { buildings: { header: H, table: new Float32Array(b.ab, 0, H.tableFloats), verts: new Float32Array(b.ab, H.tableFloats * 4, H.vertexFloats) } };
  Object.assign(NYC, {
    THREE: stub(), TSL: stub(), Addons: stub(),
    createPreWarBuildingMaterial: (o) => ({ opts: o, userData: {} }), createCurtainWallMaterial: (o) => ({ opts: o, userData: {} })
  });
  for (const f of ['js/landmarks.js', 'js/sf-bridges.js']) vm.runInContext(readFileSync(join(root, f), 'utf8'), context);
  const landmarks = NYC.buildLandmarks(stub());
  const bridges = NYC.buildSFBridges(stub());
  built = { NYC, landmarks, bridges, context };
  return built;
}

module.exports = { buildLandmarksHeadless, available, stub, readBin };
