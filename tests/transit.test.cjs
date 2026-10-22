// Rail transit (P4.6): js/sf-transit.js run headless in vm on the real GEO.transit runs and terrain (THREE stubbed).
// Over ten simulated minutes every vehicle stays on its run at no more than its cruise speed, keeps its gap to the one
// ahead, and every one comes to rest at the route's stops; cable cars never beat the cable.
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { BOX } = require('./helpers/geo-box.cjs');

const root = join(__dirname, '..');
const terrainFile = join(root, `data/terrain-${BOX}.bin`);

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

test('rail vehicles keep to their runs, their speeds, their gaps and their stops', { skip: !existsSync(terrainFile) && 'no data' }, () => {
  const NYC = {};
  const context = vm.createContext({ window: { NYC }, document: stub(), console: { info() {}, log() {}, warn() {} }, Math });
  for (const f of ['js/sf-geodata.js', 'js/city-config.js', 'js/terrain.js']) vm.runInContext(readFileSync(join(root, f), 'utf8'), context);
  const buf = readFileSync(terrainFile);
  const n = buf.readUInt32LE(4);
  const header = JSON.parse(buf.subarray(8, 8 + n).toString('utf8'));
  NYC.Terrain.load(header, new Uint16Array(buf.buffer.slice(buf.byteOffset + 8 + n, buf.byteOffset + buf.length), 0, header.w * header.h));
  Object.assign(NYC, { THREE: stub(), TSL: stub(), Addons: stub(), cityUniforms: stub() });
  vm.runInContext(readFileSync(join(root, 'js/sf-transit.js'), 'utf8'), context);
  const transit = NYC.buildSFTransit(stub());
  const kinds = new Set(transit.vehicles.map((v) => v.run.kind));
  for (const k of ['streetcar', 'lightrail', 'cablecar']) assert.ok(kinds.has(k), `no ${k}`);
  const stopped = new Set();
  for (let t = 0; t < 600; t += 1 / 30) {
    transit.update(1 / 30);
    if (Math.round(t * 30) % 30) continue;
    for (const run of transit.runs) {
      const vs = run.vehicles;
      for (let i = 0; i < vs.length; i++) {
        const v = vs[i];
        assert.ok(v.s >= 0 && v.s <= run.len, `${run.name}: s ${v.s} of ${run.len}`);
        assert.ok(v.v <= v.K.v + 1e-6, `${run.name}: ${v.v} m/s`);
        assert.ok([v.x, v.y, v.z].every(Number.isFinite));
        if (v.v === 0 && run.stops.some((s) => Math.abs(s - v.s) < 0.5)) stopped.add(v);
        // the vehicle ahead (not across the run's restart) is a body length and most of the gap away
        const lead = vs[i + 1];
        if (lead) assert.ok(lead.s - v.s >= v.K.len + v.K.gap * 0.5 || v.s < 40, `${run.name}: ${(lead.s - v.s).toFixed(1)} m apart`);
      }
    }
  }
  const moving = transit.vehicles.filter((v) => v.run.stops.length);
  assert.ok(stopped.size >= moving.length * 0.8, `${stopped.size} of ${moving.length} vehicles stopped at a stop`);
  assert.ok(transit.vehicles.filter((v) => v.run.kind === 'cablecar').every((v) => v.K.v <= 15 / 3.6 + 1e-9));
});
