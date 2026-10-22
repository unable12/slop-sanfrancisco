// The road network on the San Francisco slice (P2.7): js/road-network.js built in vm from the generated geodata, the
// curb islands (city-config.js BLOCKS) and the baked terrain.
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = join(__dirname, '..');
const terrainFile = join(root, 'data/terrain-slice.bin');
const skip = !existsSync(terrainFile) && 'no terrain';

function build({ keepCreated = false } = {}) {
  let src = readFileSync(join(root, 'js/road-network.js'), 'utf8');
  // every edge with clear lanes, before the connectivity cut (for the coverage test)
  if (keepCreated) src = src.replace('  const genCreated = edges.filter', '  window.NYC._created = edges.slice();\n  const genCreated = edges.filter');
  const context = vm.createContext({ window: { NYC: { DEBUG_ROADS: false } } });
  for (const f of ['js/sf-geodata.js', 'js/city-config.js', 'js/terrain.js']) vm.runInContext(readFileSync(join(root, f), 'utf8'), context);
  vm.runInContext(src, context);
  const NYC = context.window.NYC;
  const buf = readFileSync(terrainFile);
  const n = buf.readUInt32LE(4);
  const header = JSON.parse(buf.subarray(8, 8 + n).toString('utf8'));
  NYC.Terrain.load(header, new Uint16Array(buf.buffer.slice(buf.byteOffset + 8 + n, buf.byteOffset + buf.length), 0, header.w * header.h));
  const sidewalks = NYC.BLOCKS.map((b) => ({ minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, block: b }));
  const t0 = Date.now();
  const net = NYC.buildRoadNetwork(sidewalks, []);
  return { NYC, net, ms: Date.now() - t0 };
}

test('builds in under 2 s; the connected network covers 95% of the streets it can', { skip }, () => {
  const { NYC, net, ms } = build({ keepCreated: true });
  assert.ok(ms < 2000, `${ms} ms`);
  // Streets the data box cuts off (within 60 m of its edge) and alleys under 6 m wide (no room to turn round at
  // their dead ends) can't all join a strongly connected network: the rest must (PLAN.md P2-10)
  const B = NYC.GEO.box;
  const border = (n) => n.x < B.x0 + 60 || n.x > B.x1 - 60 || n.z < B.z0 + 60 || n.z > B.z1 - 60;
  const kept = new Set(net.edges);
  const counted = NYC._created.filter((e) => e.len > 4 && !border(e.from) && !border(e.to) && e.half >= 3);
  const share = counted.filter((e) => kept.has(e)).length / counted.length;
  assert.ok(share >= 0.95, `${(share * 100).toFixed(1)}% of ${counted.length} edges`);
  assert.ok(net.edges.length > 800, `${net.edges.length} edges`);
});

test('every edge has a finite height profile on the terrain; curves are under twice their chord', { skip }, () => {
  const { NYC, net } = build();
  for (const e of net.edges) {
    assert.ok(e.prof.length >= 2 && e.prof.every(Number.isFinite), `edge ${e.id}`);
    assert.equal(e.laneProf.length, e.lanes.length);
    const mid = e.len / 2;
    const g = NYC.Terrain.groundAt(e.sx + e.dx * mid, e.sz + e.dz * mid);
    assert.ok(Math.abs(net.edgeY(e, mid) - g) < 0.3, `edge ${e.id}: ${net.edgeY(e, mid)} vs ${g}`);
    assert.ok(e.len3[e.len3.length - 1] >= e.len - 1e-3);
    for (const m of e.moves) {
      for (let i = 0; i < e.lanes.length; i++) {
        if (m.out[i] < 0) continue;
        const c = net.connector(e, i, m.to, m.out[i]);
        const chord = Math.hypot(c.x3 - c.x0, c.z3 - c.z0);
        if (m.turn !== 'U') assert.ok(c.len < 2 * chord + 1e-6, `curve ${e.id}/${i} -> ${m.to.id}: ${c.len} vs chord ${chord}`);
        // heights join the lanes at both ends
        assert.ok(Math.abs(net.curveY(c, 0) - net.edgeY(e, e.len, i)) < 1e-6);
        assert.ok(Math.abs(net.curveY(c, c.len) - net.edgeY(m.to, 0, m.out[i])) < 1e-6);
      }
    }
  }
});

test('4- and 5-way junctions have through movements both ways where one-way rules allow', { skip }, () => {
  const { net } = build();
  const missing = [];
  for (const n of net.nodes) {
    if (n.shape || n.arms.filter((a) => a.lead === a).length < 4) continue;
    // every arriving edge with a road going on straight ahead (an out edge within 30° of its direction) drives it
    for (const e of n.in) {
      const ahead = n.out.filter((f) => f.to !== e.from && e.dx * f.dx + e.dz * f.dz > Math.cos(Math.PI / 6));
      if (ahead.length && !e.moves.some((m) => ahead.includes(m.to))) missing.push(`node ${n.id} (${n.x.toFixed(0)}, ${n.z.toFixed(0)}) edge ${e.id}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('control comes from the data: signals, and stop signs on the approaches facing them', { skip }, () => {
  const { NYC, net } = build();
  const RG = NYC.GEO.roadGraph;
  const signals = net.nodes.filter((n) => n.signal).length;
  const stops = net.nodes.filter((n) => n.stop).length;
  assert.ok(signals > 100, `${signals} signalised junctions`);
  assert.ok(stops > 50, `${stops} junctions with stop signs`);
  for (const n of net.nodes) {
    if (n.signal) assert.ok(n.rg.some((i) => RG.control[i] === 1));
    if (n.signal) assert.ok(n.in.every((e) => !e.stop));
    if (n.allWay) assert.ok(n.in.every((e) => e.stop));
  }
});
