// The generated San Francisco geodata (js/sf-geodata.js, tools/build-geodata.mjs): structural invariants of the curb
// islands, the road graph and the data files it points at. Fast: loads the committed output, doesn't rebuild it
// (tests/geodata-build.test.mjs does, when data/raw exists).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const ctx = vm.createContext({ window: { NYC: {} } });
vm.runInContext(fs.readFileSync(new URL('js/sf-geodata.js', root), 'utf8'), ctx);
const GEO = ctx.window.NYC.GEO;
const FLAGS = { freeway: 1, tunnel: 2, ramp: 4, pedestrian: 8, private: 16, alley: 32, crooked: 64 };
const ringArea = (f) => {
  let a = 0;
  for (let i = 0, j = f.length - 2; i < f.length; j = i, i += 2) a += f[j] * f[i + 1] - f[i] * f[j + 1];
  return a / 2;
};
const inRing = (f, x, z) => {
  let c = false;
  for (let i = 0, j = f.length - 2; i < f.length; j = i, i += 2) {
    if ((f[i + 1] > z) !== (f[j + 1] > z) && x < ((f[j] - f[i]) * (z - f[i + 1])) / (f[j + 1] - f[i + 1]) + f[i]) c = !c;
  }
  return c;
};

test('geodata names its frame, box and data files, and the files exist', () => {
  assert.equal(GEO.version, 2);
  assert.ok(Number.isFinite(GEO.frame.lat0) && Number.isFinite(GEO.frame.lon0));
  assert.ok(GEO.box.x1 > GEO.box.x0 && GEO.box.z1 > GEO.box.z0);
  for (const d of Object.values(GEO.data)) assert.ok(fs.existsSync(new URL(d.url, root)), `${d.url} exists`);
});

test('curb islands are valid, NYC-oriented polygons that do not overlap', () => {
  assert.ok(GEO.blocks.length > 100);
  for (const [flat, , park, , , frames, kind] of GEO.blocks) {
    assert.ok(flat.length >= 6 && flat.every(Number.isFinite));
    assert.ok(ringArea(flat) < 0, 'negative ringArea like every NYC ring');
    assert.ok(park >= 0 && park <= 1);
    assert.ok(Array.isArray(frames) && frames.length >= 1);
    assert.ok(kind === 'block' || kind === 'island');
  }
  const B = GEO.box;
  let multi = 0;
  for (let i = 0; i < 3000; i++) {
    const x = B.x0 + Math.random() * (B.x1 - B.x0), z = B.z0 + Math.random() * (B.z1 - B.z0);
    let n = 0;
    for (const [flat] of GEO.blocks) if (inRing(flat, x, z)) n++;
    if (n > 1) multi++;
  }
  assert.equal(multi, 0, 'no point lies in two curb islands');
});

test('road graph links are sane and the drivable network inside the box is strongly connected', () => {
  const RG = GEO.roadGraph;
  const n = RG.nodes.length / 2;
  assert.equal(RG.control.length, n);
  assert.equal(RG.stopMask.length, n);
  for (const c of RG.control) assert.ok([0, 1, 2, 3].includes(c));
  for (const [a, b, ni, w, lanes, dir, inner, flags] of RG.links) {
    assert.ok(a >= 0 && a < n && b >= 0 && b < n && a !== b);
    assert.ok(typeof RG.names[ni] === 'string');
    assert.ok([-1, 0, 1].includes(dir));
    assert.ok(inner.length % 2 === 0);
    if (!(flags & FLAGS.freeway)) assert.ok(w >= 3 && w <= 45, `width ${w}`);
    assert.ok(lanes >= 1 && lanes <= 8, `lanes ${lanes}`);
  }
  // Kosaraju on drivable links with both ends inside the box
  const B = GEO.box;
  const inBox = (i) => RG.nodes[2 * i] >= B.x0 && RG.nodes[2 * i] <= B.x1 && RG.nodes[2 * i + 1] >= B.z0 && RG.nodes[2 * i + 1] <= B.z1;
  const drive = RG.links.filter(([a, b, , , , , , f]) => !(f & (FLAGS.freeway | FLAGS.pedestrian | FLAGS.private)) && inBox(a) && inBox(b));
  const adj = Array.from({ length: n }, () => []), radj = Array.from({ length: n }, () => []);
  for (const [a, b, , , , dir] of drive) {
    if (dir >= 0) { adj[a].push(b); radj[b].push(a); }
    if (dir <= 0) { adj[b].push(a); radj[a].push(b); }
  }
  const seen = new Uint8Array(n), order = [];
  const dfs = (s) => {
    const st = [[s, 0]];
    seen[s] = 1;
    while (st.length) {
      const t = st[st.length - 1];
      if (t[1] < adj[t[0]].length) { const v = adj[t[0]][t[1]++]; if (!seen[v]) { seen[v] = 1; st.push([v, 0]); } } else { order.push(t[0]); st.pop(); }
    }
  };
  for (let s = 0; s < n; s++) if (!seen[s]) dfs(s);
  const comp = new Int32Array(n).fill(-1);
  let c = 0;
  for (let k = order.length - 1; k >= 0; k--) {
    if (comp[order[k]] >= 0) continue;
    const st = [order[k]];
    comp[order[k]] = c;
    while (st.length) { const u = st.pop(); for (const v of radj[u]) if (comp[v] < 0) { comp[v] = c; st.push(v); } }
    c++;
  }
  const size = new Map();
  for (const [a, b] of drive) if (comp[a] === comp[b]) size.set(comp[a], (size.get(comp[a]) || 0) + 1);
  const share = Math.max(...size.values()) / drive.length;
  assert.ok(share >= 0.95, `largest strongly connected component holds ${(share * 100).toFixed(1)}% of links`);
});

test('land, piers, parks and landmarks parse', () => {
  assert.ok(GEO.land.length >= 1 && GEO.land.every((r) => r.length >= 6));
  for (const p of GEO.piers) assert.ok(p.len > 0 && p.wid > 0 && p.ring.length >= 6);
  for (const p of GEO.parks) assert.ok(p.rings.length && p.rings.every((r) => r.length >= 6));
  // footprints, or named points (attractions, monuments, neighbourhoods: no footprint)
  for (const [name, l] of Object.entries(GEO.landmarks)) assert.ok(name && Number.isFinite(l.x) && (l.ring.length >= 6 || (l.area === 0 && !l.ring.length)));
});
