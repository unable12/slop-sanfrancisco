// js/drape.js on the real curbs (tests/helpers/geo-box.cjs): every curb island draped on the terrain (P2.4) — the curb
// tops stand CURB_H above the ground at the outline, the sidewalk surface follows the grade between its vertices, and the
// build is fast enough.
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = join(__dirname, '..');
const { BOX } = require('./helpers/geo-box.cjs');
const terrainFile = join(root, `data/terrain-${BOX}.bin`);
const CURB_H = 0.15; // js/city-config.js

function setup() {
  const context = vm.createContext({ window: { NYC: {} } });
  for (const f of ['js/sf-geodata.js', 'js/terrain.js', 'js/drape.js']) vm.runInContext(readFileSync(join(root, f), 'utf8'), context);
  const buf = readFileSync(terrainFile);
  const n = buf.readUInt32LE(4);
  const header = JSON.parse(buf.subarray(8, 8 + n).toString('utf8'));
  const ab = buf.buffer.slice(buf.byteOffset + 8 + n, buf.byteOffset + buf.length);
  const NYC = context.window.NYC;
  NYC.Terrain.load(header, new Uint16Array(ab, 0, header.w * header.h));
  const rings = NYC.GEO.blocks.map(([flat]) => {
    const r = [];
    for (let i = 0; i < flat.length; i += 2) r.push({ x: flat[i], z: flat[i + 1] });
    return r;
  }).filter((r) => r.length > 2);
  return { NYC, rings };
}

test('curb islands drape on the terrain: outline tops at ground + CURB_H, surfaces within tolerance', { skip: !existsSync(terrainFile) && 'no terrain' }, () => {
  const { NYC, rings } = setup();
  const { Terrain: T, Drape } = NYC;
  const ground = (x, z) => T.groundAt(x, z);
  const normal = (x, z, o) => T.normalAt(x, z, o);
  const t0 = Date.now();
  const top = { pos: [], nrm: [], idx: [] };
  const curb = { pos: [], nrm: [], idx: [] };
  for (const r of rings) {
    const ring = Drape.densify(r, 2);
    Drape.polygon(ring, ground, normal, CURB_H, top);
    Drape.wall(ring, ground, -0.3, CURB_H, curb);
  }
  const ms = Date.now() - t0;
  assert.ok(ms < 10000, `drape took ${ms} ms`); // about 0.4 s in Chrome; vm is several times slower

  // 5,000 outline vertices: the top edge of the curb faces (vertices 2 and 3 of each quad)
  const quads = curb.pos.length / 12;
  assert.ok(quads > 5000);
  const stride = Math.floor(quads / 5000);
  let checked = 0;
  for (let q = 0; q < quads && checked < 5000; q += stride, checked++) {
    for (const v of [2, 3]) {
      const o = q * 12 + v * 3;
      const [x, y, z] = [curb.pos[o], curb.pos[o + 1], curb.pos[o + 2]];
      assert.ok(Math.abs(y - ground(x, z) - CURB_H) < 0.01, `outline vertex at ${x},${z}: ${y - ground(x, z)}`);
    }
  }
  assert.equal(checked, 5000);

  // every top vertex at ground + CURB_H; triangle centroids within the drape tolerance (+ a centimetre) of it
  for (let k = 0; k < top.pos.length; k += 3) {
    assert.ok(Math.abs(top.pos[k + 1] - ground(top.pos[k], top.pos[k + 2]) - CURB_H) < 0.01);
  }
  // triangle centroids within the drape tolerance of the grade, except where the smallest leaves (2 m, the data's own
  // spacing: two triangles) can't follow the ground (PLAN.md P3-1): on retaining walls (slope > 1), in height-field
  // cells creased more than the tolerance (twist |h00 - h10 - h01 + h11| / 4 > TOL: terrace edges on the core's
  // waterfront) and in cells the waterline crosses (the ground is the height clamped at the water: a curved crease along
  // the seawall's top edge). Those only count towards the percentiles
  const creased = (x, z) => {
    const i = Math.floor((x - T.originX) / T.cell), j = Math.floor((z - T.originZ) / T.cell), k = j * T.w + i;
    const c = [k, k + 1, k + T.w, k + T.w + 1].map((n) => T.heights[n]);
    const wet = c.filter((h) => h <= T.waterLevel).length;
    return (wet > 0 && wet < 4) || Math.abs(c[0] - c[1] - c[2] + c[3]) / 4 > Drape.TOL;
  };
  const devs = [];
  let worst = 0;
  for (let t = 0; t < top.idx.length; t += 3) {
    let x = 0, y = 0, z = 0;
    for (let k = 0; k < 3; k++) {
      const o = top.idx[t + k] * 3;
      x += top.pos[o] / 3; y += top.pos[o + 1] / 3; z += top.pos[o + 2] / 3;
    }
    const d = Math.abs(y - ground(x, z) - CURB_H);
    devs.push(d);
    if (T.slopeAt(x, z) < 1 && !creased(x, z)) worst = Math.max(worst, d);
  }
  devs.sort((a, b) => a - b);
  assert.ok(devs[Math.floor(devs.length * 0.99)] <= Drape.TOL, `p99 ${devs[Math.floor(devs.length * 0.99)]}`);
  assert.ok(worst < 2 * Drape.TOL + 0.01, `worst centroid ${worst.toFixed(3)} m off the grade`);
  // triangles face up
  let down = 0;
  for (let t = 0; t < top.idx.length; t += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => top.idx[t + k] * 3);
    const ux = top.pos[b] - top.pos[a], uz = top.pos[b + 2] - top.pos[a + 2];
    const vx = top.pos[c] - top.pos[a], vz = top.pos[c + 2] - top.pos[a + 2];
    if (uz * vx - ux * vz < -1e-6) down++;
  }
  assert.equal(down, 0);
});
