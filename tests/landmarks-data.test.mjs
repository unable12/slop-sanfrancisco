// The landmark sites and bridges in the generated geodata (P5.1, tools/geo-landmarks.mjs): every modelled landmark
// resolves to one site on land with its ground and height, the bridges' structure is where the data puts it, and the
// interim region ground (PLAN P5-1) agrees with the sites' own ground. Loads the committed output, doesn't rebuild it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { SITES } from '../tools/geo-landmarks.mjs';

const root = new URL('../', import.meta.url);
const ctx = vm.createContext({ window: { NYC: {} } });
vm.runInContext(fs.readFileSync(new URL('js/sf-geodata.js', root), 'utf8'), ctx);
const GEO = ctx.window.NYC.GEO;
const water = GEO.data.terrain.waterLevel;

function readBin(url) {
  const buf = fs.readFileSync(new URL(url, root));
  assert.equal(buf.toString('ascii', 0, 4), 'SFB1');
  const n = buf.readUInt32LE(4);
  const header = JSON.parse(buf.toString('utf8', 8, 8 + n));
  return { header, payload: buf.subarray(8 + n) };
}

test('every modelled landmark resolves to one site on land, with its ground and OSM height', () => {
  const unresolved = Object.keys(SITES).filter((name) => !GEO.landmarks[name]);
  assert.deepEqual(unresolved, [], `unresolved: ${unresolved.join(', ')}`);
  for (const [name, spec] of Object.entries(SITES)) {
    const s = GEO.landmarks[name];
    assert.equal(s.slug, spec.slug, name);
    assert.ok(s.ring.length >= 6 && s.ring.length % 2 === 0, `${name}: an outline`);
    assert.ok(Number.isFinite(s.base) && Number.isFinite(s.groundTop) && s.groundTop >= s.base, `${name}: ground ${s.base} - ${s.groundTop}`);
    assert.ok(s.groundTop > water + 1, `${name} stands on land (ground up to ${s.groundTop} m)`);
    if (s.topH != null) assert.ok(s.topH > 0 && s.topH < 400, `${name}: height ${s.topH}`);
    // the DEM under the outline agrees with OSM's ele where OSM has one (within 3 m; an island's ele is a summit)
    if (s.ele != null && !/^(island|islet)$/.test(s.kind)) assert.ok(Math.abs(s.ele - s.base) < 3, `${name}: ele ${s.ele} vs ground ${s.base}`);
  }
});

test('the bridges: Golden Gate towers 1280 m apart and 225 m tall, the Bay Bridge west span towers and anchorage', () => {
  const gg = GEO.bridges.goldenGate;
  assert.equal(gg.towers.length, 2);
  const [a, b] = gg.towers;
  const span = Math.hypot(a.c[0] - b.c[0], a.c[1] - b.c[1]);
  assert.ok(span > 1270 && span < 1290, `main span ${span.toFixed(0)} m`);
  for (const t of gg.towers) assert.equal(t.top, 225);
  assert.ok(gg.supports.some((s) => s.name === 'South Anchorage') && gg.supports.some((s) => s.name === 'North Anchor'));
  assert.ok(gg.decks.length > 0);
  const bb = GEO.bridges.bayBridge;
  const tall = bb.towers.filter((t) => t.top === 160);
  assert.equal(tall.length, 5, 'four west span towers and the east span tower');
  assert.ok(bb.supports.some((s) => s.name === 'Center Anchorage' && s.h === 67));
  // the two west suspension spans: 704 m between the tower pairs either side of the centre anchorage
  const ca = bb.supports.find((s) => s.name === 'Center Anchorage').c;
  const west = tall.map((t) => t.c).filter(([x]) => x < 3200).sort((p, q) => p[0] - q[0]);
  assert.equal(west.length, 4);
  for (const [i, j] of [[0, 1], [2, 3]]) {
    const d = Math.hypot(west[i][0] - west[j][0], west[i][1] - west[j][1]);
    assert.ok(d > 690 && d < 720, `west span ${i}: ${d.toFixed(0)} m`);
  }
  assert.ok(west[1][0] < ca[0] && ca[0] < west[2][0], 'the centre anchorage between the spans');
});

test('the interim region ground (P5-1) covers the sites outside the core and agrees with their ground', () => {
  const { header, payload } = readBin(GEO.data.region.url);
  assert.equal(header.format, 'sf-terrain');
  const q = new Uint16Array(payload.buffer, payload.byteOffset, header.w * header.h);
  const at = (x, z) => {
    const fi = (x - header.originX) / header.cell, fj = (z - header.originZ) / header.cell;
    const i = Math.floor(fi), j = Math.floor(fj), tx = fi - i, tz = fj - j;
    const H = (ii, jj) => header.minH + q[jj * header.w + ii] * header.scale;
    return (H(i, j) * (1 - tx) + H(i + 1, j) * tx) * (1 - tz) + (H(i, j + 1) * (1 - tx) + H(i + 1, j + 1) * tx) * tz;
  };
  const B = GEO.box;
  for (const [name, s] of Object.entries(GEO.landmarks)) {
    if (!s.slug || (s.x > B.x0 && s.x < B.x1 && s.z > B.z0 && s.z < B.z1) || /^(island|islet)$/.test(s.kind)) continue;
    // a 16 m grid of the 8 m overview: within 10 m of the 1 m DEM's ground range under the outline
    const g = at(s.x, s.z);
    assert.ok(g > s.base - 10 && g < s.groundTop + 10, `${name}: region ground ${g.toFixed(1)} vs ${s.base} - ${s.groundTop}`);
  }
});
