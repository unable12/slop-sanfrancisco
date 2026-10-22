// js/terrain.js (the runtime height API) over the baked slice terrain: continuity, normals, slope, water, and agreement
// with the building footprints' own lidar ground (data/buildings-<box>.bin `base` = gnd_min_m).
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = join(__dirname, '..');
const BOX = 'slice';
const terrainFile = join(root, `data/terrain-${BOX}.bin`);
const buildingsFile = join(root, `data/buildings-${BOX}.bin`);

function readBin(file) {
  const buf = readFileSync(file);
  const n = buf.readUInt32LE(4);
  const header = JSON.parse(buf.subarray(8, 8 + n).toString('utf8'));
  const ab = buf.buffer.slice(buf.byteOffset + 8 + n, buf.byteOffset + buf.length);
  return { header, payload: ab };
}

function loadTerrain() {
  const context = vm.createContext({ window: { NYC: {} } });
  vm.runInContext(readFileSync(join(root, 'js/terrain.js'), 'utf8'), context);
  const { header, payload } = readBin(terrainFile);
  return context.window.NYC.Terrain.load(header, new Uint16Array(payload, 0, header.w * header.h));
}

// seeded PRNG (D13)
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const skip = !existsSync(terrainFile) && 'no baked terrain';

test('heightAt is continuous: 20k pairs 0.1 m apart', { skip }, () => {
  const T = loadTerrain();
  // steepest bilinear gradient anywhere: max cell-edge rise over run, along both axes at once
  let maxEdge = 0;
  for (let j = 0; j < T.h; j++) {
    for (let i = 0; i < T.w; i++) {
      const k = j * T.w + i;
      if (i + 1 < T.w) maxEdge = Math.max(maxEdge, Math.abs(T.heights[k + 1] - T.heights[k]));
      if (j + 1 < T.h) maxEdge = Math.max(maxEdge, Math.abs(T.heights[k + T.w] - T.heights[k]));
    }
  }
  const maxGrade = (maxEdge / T.cell) * Math.SQRT2;
  const quant = T.header.scale;
  const r = rng(7);
  const x0 = T.originX + 1, x1 = T.originX + (T.w - 2) * T.cell, z0 = T.originZ + 1, z1 = T.originZ + (T.h - 2) * T.cell;
  let worst = 0;
  for (let n = 0; n < 20000; n++) {
    const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0), a = r() * Math.PI * 2;
    const dh = Math.abs(T.heightAt(x + 0.1 * Math.cos(a), z + 0.1 * Math.sin(a)) - T.heightAt(x, z));
    worst = Math.max(worst, dh);
    assert.ok(dh <= 0.1 * maxGrade + quant, `|dh| ${dh} at ${x},${z} (max grade ${maxGrade})`);
  }
  // no spikes: the steepest cells are real retaining walls (Telegraph and Russian Hill, about 4 m over one 2 m cell)
  assert.ok(maxGrade < 5, `max grade ${maxGrade}`);
});

test('normals are unit length and point up; slopeAt matches finite differences', { skip }, () => {
  const T = loadTerrain();
  const r = rng(11);
  const n = { x: 0, y: 0, z: 0 };
  const diffs = [];
  for (let k = 0; k < 5000; k++) {
    const x = T.originX + 10 + r() * (T.w * T.cell - 20), z = T.originZ + 10 + r() * (T.h * T.cell - 20);
    T.normalAt(x, z, n);
    assert.ok(Math.abs(Math.hypot(n.x, n.y, n.z) - 1) < 1e-9);
    assert.ok(n.y > 0);
    const e = 0.25;
    const gx = (T.heightAt(x + e, z) - T.heightAt(x - e, z)) / (2 * e);
    const gz = (T.heightAt(x, z + e) - T.heightAt(x, z - e)) / (2 * e);
    diffs.push(Math.abs(T.slopeAt(x, z) - Math.hypot(gx, gz)));
    // the normal is perpendicular to the surface's gradient direction
    const s = T.slopeAt(x, z);
    assert.ok(Math.abs(n.y - 1 / Math.hypot(1, s)) < 1e-9);
  }
  // central differences over one cell vs over half a metre: equal on planar cells, apart by the curvature within a cell
  diffs.sort((a, b) => a - b);
  assert.ok(diffs[2500] < 0.01, `median |slope diff| ${diffs[2500]}`);
  assert.ok(diffs[4950] < 0.08, `p99 |slope diff| ${diffs[4950]}`);
  assert.ok(diffs[4999] < 0.4, `max |slope diff| ${diffs[4999]}`);
});

test('water returns waterLevel; outside the data heightAt is below the water', { skip }, () => {
  const T = loadTerrain();
  // the bay east of the Ferry Building (x > 900 near z = -900 is water in the slice box)
  let wet = 0;
  for (let j = 0; j < T.h; j += 7) {
    for (let i = 0; i < T.w; i += 7) {
      const x = T.originX + i * T.cell, z = T.originZ + j * T.cell;
      if (T.heightAt(x, z) <= T.waterLevel + 0.01) {
        wet++;
        assert.equal(T.groundAt(x, z), Math.max(T.heightAt(x, z), T.waterLevel));
        assert.ok(Math.abs(T.groundAt(x, z) - T.waterLevel) < 0.01);
      }
    }
  }
  assert.ok(wet > 300, `wet samples ${wet}`);
  assert.equal(T.heightAt(T.originX - 50, T.originZ), T.waterLevel - 5);
  assert.equal(T.groundAt(T.originX - 50, T.originZ), T.waterLevel);
});

test('terrain agrees with the footprints’ lidar ground (gnd_min_m) at runtime resolution', { skip: (skip || !existsSync(buildingsFile)) && 'no data' }, () => {
  const T = loadTerrain();
  const { header, payload } = readBin(buildingsFile);
  const table = new Float32Array(payload, 0, header.tableFloats);
  const verts = new Float32Array(payload, header.tableFloats * 4, header.vertexFloats);
  const diffs = [];
  for (let b = 0; b < header.count; b++) {
    const F = header.fields.length;
    const [base, , , start, count] = table.subarray(b * F, b * F + 5);
    const ring = [];
    for (let k = 0; k < count; k++) ring.push([verts[2 * (start + k)], verts[2 * (start + k) + 1]]);
    const inside = (x, z) => {
      let c = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [ax, az] = ring[i], [bx, bz] = ring[j];
        if ((az > z) !== (bz > z) && x < ((bx - ax) * (z - az)) / (bz - az) + ax) c = !c;
      }
      return c;
    };
    const xs = ring.map((p) => p[0]), zs = ring.map((p) => p[1]);
    let lo = Infinity;
    for (let x = Math.min(...xs) + 0.5; x < Math.max(...xs); x += 1) {
      for (let z = Math.min(...zs) + 0.5; z < Math.max(...zs); z += 1) if (inside(x, z)) lo = Math.min(lo, T.heightAt(x, z));
    }
    if (Number.isFinite(lo)) diffs.push(lo - base);
  }
  diffs.sort((a, b) => a - b);
  const q = (p) => diffs[Math.floor(p * (diffs.length - 1))];
  const absMed = diffs.map(Math.abs).sort((a, b) => a - b)[diffs.length >> 1];
  // the 2 m grid is block-averaged and smoothed: its minima sit a little above the 50 cm lidar minimum
  assert.ok(diffs.length > 0.95 * header.count, `${diffs.length} of ${header.count} footprints sampled`);
  assert.ok(absMed < 0.5, `median |terrain min - gnd_min_m| ${absMed.toFixed(3)} m`);
  assert.ok(q(0.05) > -1.5 && q(0.95) < 2.0, `p5 ${q(0.05).toFixed(2)} p95 ${q(0.95).toFixed(2)}`);
});
