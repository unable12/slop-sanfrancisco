// Ten minutes of traffic on the San Francisco slice (P2.8), simulated headless (tests/helpers/traffic-harness.cjs):
// 60 cars & 6 buses around Chinatown & Nob Hill, on hills, through real signals and stop signs.
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTraffic, available } = require('./helpers/traffic-harness.cjs');

test('10 minutes of slice traffic: no overlaps, no stuck vehicles, all-way stops flow, wheels on the road', { skip: !available && 'no terrain', timeout: 120000 }, () => {
  const { NYC, system } = loadTraffic();
  const vehicles = system.cars.concat(system.buses);
  assert.equal(system.cars.length, 60);
  assert.equal(system.buses.length, 6);
  const { edgeY } = system.network;
  const focus = { x: -330, y: 0, z: -560 }; // Grant Ave & Clay St: Chinatown, between downtown and Nob Hill
  const dt = 1 / 20;
  const STEPS = 10 * 60 * 20;
  const WINDOW = 2 * 60 * 20; // 2 minutes

  const stuck = new Map(); // vehicle -> seconds standing
  let worstStuck = 0;
  let worstStuckAt = null;
  const overlaps = [];
  const yErr = [];
  // all-way stops: per window, whether someone waited at a stop line and whether anyone went through
  const allWay = new Map(); // node -> { waited, passed }
  const wasIn = new Map(); // vehicle -> its connector last step
  const failedWindows = [];
  let t = 0;
  for (let step = 1; step <= STEPS; step++) {
    const before = vehicles.map((v) => [v.edge, v.x, v.z]);
    t += dt;
    system.update(dt, t, focus, null, 'car', null);
    // standing still (respawned vehicles start afresh)
    vehicles.forEach((v, k) => {
      const jumped = before[k][0] && Math.hypot(v.x - before[k][1], v.z - before[k][2]) > 5;
      const standing = v.edge && v.speed < 0.3 && !jumped;
      const s = standing ? (stuck.get(v) || 0) + dt : 0;
      stuck.set(v, s);
      if (s > worstStuck) {
        worstStuck = s;
        worstStuckAt = { x: Math.round(v.x), z: Math.round(v.z), signal: v.edge.to.signal, stop: v.edge.stop, conn: !!v.conn };
      }
    });
    // no two vehicles in one lane overlap (both on the edge itself, not crossing a junction)
    if (step % 10 === 0) {
      const lanes = new Map();
      for (const v of vehicles) {
        if (!v.edge || v.conn || Math.abs(v.dl) > 0.3) continue;
        const key = v.edge.id * 8 + v.lane;
        if (!lanes.has(key)) lanes.set(key, []);
        lanes.get(key).push(v);
      }
      for (const list of lanes.values()) {
        list.sort((a, b) => a.s - b.s);
        for (let i = 1; i < list.length; i++) {
          const gap = list[i].s - list[i - 1].s - list[i].half - list[i - 1].half;
          if (gap < -0.2) overlaps.push(`edge ${list[i].edge.id} lane ${list[i].lane}: ${gap.toFixed(2)} m at t ${t.toFixed(1)}`);
        }
      }
      for (const v of vehicles) {
        if (!v.edge || v.conn) continue;
        yErr.push(Math.abs(v.y - edgeY(v.edge, v.s, v.lane)));
      }
    }
    // all-way stops
    for (const v of vehicles) {
      const e = v.edge;
      if (!e) continue;
      if (!v.conn && e.stop && e.to.allWay && v.stopDone) {
        if (!allWay.has(e.to)) allWay.set(e.to, { waited: false, passed: 0 });
        allWay.get(e.to).waited = true;
      }
      if (v.conn && wasIn.get(v) !== v.conn && e.to.allWay) {
        if (!allWay.has(e.to)) allWay.set(e.to, { waited: false, passed: 0 });
        allWay.get(e.to).passed++;
      }
      wasIn.set(v, v.conn);
    }
    if (step % WINDOW === 0) {
      for (const [n, w] of allWay) if (w.waited && w.passed === 0) failedWindows.push(`all-way stop at (${n.x.toFixed(0)}, ${n.z.toFixed(0)}) min ${step / 1200}`);
      allWay.clear();
    }
  }
  assert.deepEqual(overlaps.slice(0, 5), []);
  assert.ok(worstStuck <= 90, `a vehicle stood ${worstStuck.toFixed(0)} s at ${JSON.stringify(worstStuckAt)}`);
  assert.deepEqual(failedWindows, []);
  yErr.sort((a, b) => a - b);
  assert.ok(yErr[Math.floor(yErr.length * 0.99)] < 0.03, `p99 |y - edgeY| ${yErr[Math.floor(yErr.length * 0.99)]}`);
  assert.ok(yErr[yErr.length - 1] < 0.15, `max |y - edgeY| ${yErr[yErr.length - 1]}`);
  assert.ok(vehicles.filter((v) => v.edge).length === 66);
});

test('pedestrians walk the sidewalks and enter the roadway only on crosswalks (P2.9)', { skip: !available && 'no terrain', timeout: 120000 }, () => {
  const { NYC, system } = loadTraffic();
  const focus = { x: -330, y: 0, z: -560 };
  const dt = 1 / 20;
  const off = [];
  let onCrosswalks = 0;
  let crossed = 0;
  const sideOf = new Map();
  let t = 0;
  for (let step = 1; step <= 3 * 60 * 20; step++) {
    t += dt;
    system.update(dt, t, focus, null, 'car', null);
    for (const p of system.peds) {
      if (!p.placed) continue;
      if (p.node) onCrosswalks++;
      // in the roadway (no curb island under it): only on a crosswalk, past its curbs
      if (!NYC.blockAt(p.x, p.z)) {
        const inside = p.node && p.t > 1 && p.t < p.len - 1;
        if (!inside) off.push(`(${p.x.toFixed(1)}, ${p.z.toFixed(1)}) ${p.node ? `crosswalk t ${p.t.toFixed(1)}/${p.len.toFixed(1)}` : 'sidewalk track'}`);
      }
      // reached the far curb of its crosswalk
      if (p.node) {
        const s = p.t < p.len / 2 ? 0 : 1;
        if (sideOf.has(p) && sideOf.get(p) !== s && p.t > 0.5 && p.t < p.len - 0.5) crossed++;
        sideOf.set(p, s);
      } else {
        sideOf.delete(p);
      }
    }
  }
  assert.ok(onCrosswalks > 0, 'nobody on a crosswalk');
  assert.ok(crossed > 10, `${crossed} crossings`);
  assert.deepEqual(off.slice(0, 5), [], `${off.length} pedestrian-steps off the sidewalks outside crosswalks`);
});
