// The baked height field (data/terrain-<box>.bin, tools/geo-terrain.mjs) against an independent lidar product: the
// building footprints' own ground statistics (DataSF ynuv-fyni gnd_min_m / gnd_mediancm, NAVD88). Agreement guards against
// CRS, datum and axis mistakes. Needs the raw footprints (data/raw); skips without them.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { readBin } from '../tools/geo-terrain.mjs';
import { toWorld, RAW } from '../tools/geo-base.mjs';

import geoBox from './helpers/geo-box.cjs';

const { BOX } = geoBox;
const binFile = new URL(`../data/terrain-${BOX}.bin`, import.meta.url);
const rawFile = `${RAW}/datasf/buildings-${BOX}.geojson`;

test('terrain header is sane', { skip: !fs.existsSync(binFile) && 'no baked terrain' }, () => {
  const { header, payload } = readBin(binFile);
  assert.equal(header.format, 'sf-terrain');
  assert.equal(payload.byteLength, header.w * header.h * 2);
  assert.ok(header.cell > 0 && header.scale > 0 && header.maxH > header.minH);
  assert.ok(header.waterLevel > -5 && header.waterLevel < 3, `water level ${header.waterLevel}`);
});

test('terrain agrees with the footprint lidar ground (median under each building)', { skip: !(fs.existsSync(binFile) && fs.existsSync(rawFile)) && 'needs data/raw' }, () => {
  const { header: H, payload } = readBin(binFile);
  const q = new Uint16Array(payload.buffer, payload.byteOffset, H.w * H.h);
  const at = (x, z) => {
    const fi = (x - H.originX) / H.cell, fj = (z - H.originZ) / H.cell;
    const i = Math.floor(fi), j = Math.floor(fj);
    if (i < 0 || j < 0 || i + 1 >= H.w || j + 1 >= H.h) return NaN;
    const tx = fi - i, ty = fj - j;
    const v = (ii, jj) => H.minH + q[jj * H.w + ii] * H.scale;
    return (v(i, j) * (1 - tx) + v(i + 1, j) * tx) * (1 - ty) + (v(i, j + 1) * (1 - tx) + v(i + 1, j + 1) * tx) * ty;
  };
  const feats = JSON.parse(fs.readFileSync(rawFile, 'utf8')).features;
  const inRing = (ring, x, z) => {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  };
  const signed = [];
  for (const f of feats) {
    const p = f.properties;
    const median = Number(p.gnd_mediancm) / 100;
    if (!Number.isFinite(median) || Number(p.gnd_cells50cm) < 40) continue;
    const g = f.geometry;
    const ring = (g.type === 'MultiPolygon' ? g.coordinates[0][0] : g.coordinates[0]).map(([lon, lat]) => toWorld(lon, lat));
    // terrain median over a 1 m grid inside the footprint (what the zonal statistic covers)
    const xs = ring.map((r) => r[0]), zs = ring.map((r) => r[1]);
    const samples = [];
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 1) {
      for (let z = Math.min(...zs); z <= Math.max(...zs); z += 1) if (inRing(ring, x, z)) samples.push(at(x, z));
    }
    const vals = samples.filter(Number.isFinite).sort((a, b) => a - b);
    if (vals.length < 10) continue;
    signed.push(vals[vals.length >> 1] - median);
  }
  const n = signed.length;
  const abs = signed.map(Math.abs).sort((a, b) => a - b);
  signed.sort((a, b) => a - b);
  const within = abs.filter((e) => e < 1).length / n;
  assert.ok(n > 1000, `only ${n} buildings compared`);
  // measured 2026-10-22 on the slice: bias -0.04 m, median |error| 0.19 m, 91.6% within 1 m
  assert.ok(Math.abs(signed[n >> 1]) < 0.15, `vertical bias ${signed[n >> 1].toFixed(2)} m`);
  assert.ok(abs[n >> 1] < 0.3, `median error ${abs[n >> 1].toFixed(2)} m`);
  assert.ok(within >= 0.9, `${(100 * within).toFixed(1)}% within 1 m`);
});
