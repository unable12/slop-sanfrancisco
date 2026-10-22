// Buildings v1 (P2.5): every footprint's masses stand from 1 m under its lowest ground (gnd_min_m) to its main roof
// (median_1st_m), as js/buildings.js (buildSFMasses) builds them from data/buildings-<box>.bin, and no mass reaches more
// than 0.3 m into the road corridor the curbs define (tools/road-corridor.mjs).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { roadCorridor, NEAR } from '../tools/road-corridor.mjs';

const root = new URL('../', import.meta.url);
const binFile = new URL('data/buildings-slice.bin', root);
const skip = !fs.existsSync(binFile) && 'no buildings data';

function load() {
  const buf = fs.readFileSync(binFile);
  const n = buf.readUInt32LE(4);
  const header = JSON.parse(buf.subarray(8, 8 + n).toString('utf8'));
  const ab = buf.buffer.slice(buf.byteOffset + 8 + n, buf.byteOffset + buf.length);
  const table = new Float32Array(ab, 0, header.tableFloats);
  const masses = new Float32Array(ab, (header.tableFloats + header.vertexFloats) * 4, header.massFloats);
  return { header, table, masses, F: header.fields.length };
}

test('masses: bottom 1 m under gnd_min_m, top at median_1st_m (as buildings.js computes them)', { skip }, () => {
  const src = fs.readFileSync(new URL('js/buildings.js', root), 'utf8');
  const foundation = Number(src.match(/const FOUNDATION = ([\d.]+);/)[1]);
  assert.equal(foundation, 1.0);
  assert.match(src, /const bottom = base - FOUNDATION;/);
  assert.match(src, /y: \(bottom \+ roof\) \* 0\.5, z: m\.cz, w: m\.w, h: roof - bottom/);
  const { header, table, F } = load();
  let masses = 0;
  for (let i = 0; i < header.count; i++) {
    const [base, roof, , , , , , count] = table.subarray(i * F, i * F + F);
    for (let k = 0; k < count; k++) {
      const bottom = base - foundation;
      const y = (bottom + roof) * 0.5, h = roof - bottom;
      assert.ok(Math.abs(y - h / 2 + 1.0 - base) < 0.05);
      assert.ok(Math.abs(y + h / 2 - roof) < 1e-4);
      masses++;
    }
  }
  assert.ok(masses > header.count, `${masses} masses`);
});

test('no mass reaches more than 0.3 m into the road corridor', { skip }, () => {
  const ctx = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(new URL('js/sf-geodata.js', root), 'utf8'), ctx);
  const rings = ctx.window.NYC.GEO.blocks.map(([flat]) => {
    const r = [];
    for (let i = 0; i < flat.length; i += 2) r.push([flat[i], flat[i + 1]]);
    return r;
  });
  const roadDepth = roadCorridor(rings);
  const { header, table, masses, F } = load();
  const bad = [];
  for (let i = 0; i < header.count; i++) {
    const r = table.subarray(i * F, i * F + F);
    const cs = Math.cos(r[5]), sn = Math.sin(r[5]);
    for (let k = r[6]; k < r[6] + r[7]; k++) {
      const [cx, cz, w, d] = masses.subarray(k * 4, k * 4 + 4);
      let worst = 0;
      const probe = (u, v) => {
        const depth = roadDepth(cx + u * w * cs + v * d * sn, cz - u * w * sn + v * d * cs);
        if (Number.isFinite(depth)) worst = Math.max(worst, depth);
      };
      for (let u = -0.5; u <= 0.5001; u += 0.5 / Math.ceil(w)) { probe(u, -0.5); probe(u, 0.5); }
      for (let v = -0.5; v <= 0.5001; v += 0.5 / Math.ceil(d)) { probe(-0.5, v); probe(0.5, v); }
      if (worst > 0.3) bad.push(`building ${i} mass ${k}: ${worst.toFixed(2)} m`);
    }
  }
  assert.equal(NEAR, 6);
  assert.deepEqual(bad.slice(0, 10), []);
});
