// The landmarks and bridges at runtime (P5.6), built headless (tests/helpers/landmarks-build.cjs): every Tier 1 model is
// built, every collider is finite, oriented (OBB) and bounded in height by its landmark (minY / maxY), the generated
// building masses are left out only under a modelled outline, and the Bay Bridge hands its decks to the freeway.
const assert = require('node:assert/strict');
const test = require('node:test');
const { buildLandmarksHeadless, available } = require('./helpers/landmarks-build.cjs');

const skip = !available && 'no data';
const TIER1 = ['transamerica', 'salesforce-tower', 'ferry-building', 'coit-tower', 'city-hall', 'sutro-tower', 'palace-of-fine-arts', 'oracle-park'];

test('every Tier 1 landmark and both bridges are built', { skip }, () => {
  const { NYC } = buildLandmarksHeadless();
  const slugs = new Set(NYC.landmarkStats.map((s) => s.slug));
  for (const s of TIER1) assert.ok(slugs.has(s), `${s} built`);
  const bridges = new Set(NYC.bridgeStats.map((s) => s.name));
  assert.ok(bridges.has('golden-gate-bridge') && bridges.has('bay-bridge'));
});

test('landmark and bridge colliders are finite OBBs within their landmark\'s heights', { skip }, () => {
  const { landmarks, bridges, NYC } = buildLandmarksHeadless();
  const all = [...landmarks.colliders, ...bridges.colliders];
  assert.ok(landmarks.colliders.length > 40 && bridges.colliders.length > 60, `${landmarks.colliders.length} + ${bridges.colliders.length} colliders`);
  const water = NYC.Terrain.waterLevel;
  for (const c of all) {
    for (const k of ['minX', 'maxX', 'minZ', 'maxZ', 'minY', 'maxY']) assert.ok(Number.isFinite(c[k]), `collider ${k} ${c[k]}`);
    assert.ok(c.maxX > c.minX && c.maxZ > c.minZ && c.maxY > c.minY, 'collider has size');
    assert.ok(c.obb && Number.isFinite(c.obb.hx) && Number.isFinite(c.obb.cs), 'oriented');
    assert.ok(c.minY > water - 10 && c.maxY < 600, `heights ${c.minY.toFixed(1)} - ${c.maxY.toFixed(1)}`);
  }
  // the tallest reach no higher than the data says: Salesforce Tower 326 m, Sutro Tower 298 m over their ground
  const S = NYC.LANDMARK_SITES;
  for (const name of ['Salesforce Tower', 'Sutro Tower', 'Transamerica Pyramid']) {
    const s = S[name];
    const near = all.filter((c) => Math.abs((c.minX + c.maxX) / 2 - s.x) < 40 && Math.abs((c.minZ + c.maxZ) / 2 - s.z) < 40);
    assert.ok(near.length, `${name} has colliders`);
    const top = Math.max(...near.map((c) => c.maxY));
    assert.ok(Math.abs(top - (s.base + s.topH)) < 1, `${name} top ${top.toFixed(1)} vs ${s.base + s.topH}`);
  }
});

test('generated masses are left out under modelled outlines only', { skip }, () => {
  const { NYC } = buildLandmarksHeadless();
  const S = NYC.LANDMARK_SITES;
  for (const name of ['Transamerica Pyramid', 'Salesforce Tower', 'San Francisco City Hall', 'Oracle Park']) assert.ok(NYC.landmarkCovers(S[name].x, S[name].z), `${name} covered`);
  assert.ok(!NYC.landmarkCovers(0, 0), 'Market & Montgomery is not');
  assert.ok(!NYC.landmarkCovers(S['Ghirardelli Square'].x, S['Ghirardelli Square'].z), 'Ghirardelli keeps its buildings (a sign on them)');
});

test('the Bay Bridge carries the I-80 decks: upper westbound over the lower, high over the water, none off the bridge', { skip }, () => {
  const { bridges, NYC } = buildLandmarksHeadless();
  const water = NYC.Terrain.waterLevel;
  const W = NYC.GEO.bridges.bayBridge.towers.map((t) => t.c).sort((p, q) => p[0] - q[0]);
  // mid-span between the first two towers
  const x = (W[0][0] + W[1][0]) / 2, z = (W[0][1] + W[1][1]) / 2;
  const up = bridges.bridgeDeckAt(x, z, true), low = bridges.bridgeDeckAt(x, z, false);
  assert.ok(up.onBridge && low.onBridge);
  assert.ok(up.y - low.y > 8, 'upper over lower');
  assert.ok(low.y - water > 67, `lower deck ${(low.y - water).toFixed(1)} m over the water (67 m clearance below it)`);
  assert.equal(bridges.bridgeDeckAt(0, 0, true), null);
});
