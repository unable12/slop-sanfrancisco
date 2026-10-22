const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = readFileSync(join(__dirname, '../js/traffic.js'), 'utf8');
// Exercise the production lane query and player snapshot without creating the WebGPU scene.
const laneQuery = source.match(/  function playerInLane\(lane, pl\) \{[\s\S]*?\n  \}/)?.[0];
const playerSnapshot = source.match(/    const pl = entity[\s\S]*?\n    \} : null;/)?.[0];
assert.ok(laneQuery, 'traffic lane query is present');
assert.ok(playerSnapshot, 'traffic player snapshot is present');
const { playerInLane, snapshot } = vm.runInNewContext(`
  ${laneQuery}
  function snapshot(entity, mode) {
    ${playerSnapshot}
    return pl;
  }
  ({ playerInLane, snapshot });
`);

function lane(points) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
  }
  return {
    pts: points,
    cum,
    box: [Math.min(...points.map((p) => p.x)), Math.max(...points.map((p) => p.x)),
      Math.min(...points.map((p) => p.z)), Math.max(...points.map((p) => p.z))]
  };
}

function player(x, y, z, mode = 'car') {
  return snapshot({ position: { x, y, z }, heading: Math.PI / 2, speed: 10 }, mode);
}

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} should equal ${expected}`);
}

test('street traffic recognizes players on its own road, including sidewalk height', () => {
  const road = lane([{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }]);
  for (const y of [0, 0.22]) {
    const result = playerInLane(road, player(50, y, 0));
    close(result.u, 50);
    close(result.v, 10);
  }
  assert.equal(playerInLane(road, player(50, 7.6, 0)), null);
  assert.equal(playerInLane(road, player(50, 0, 2.1)), null);
});

test('viaduct traffic ignores players below it and recognizes players at deck height', () => {
  const road = lane([{ x: 0, y: 7.6, z: 0 }, { x: 100, y: 7.6, z: 0 }]);
  assert.equal(playerInLane(road, player(50, 0, 0)), null);
  const result = playerInLane(road, player(50, 7.6, 0));
  close(result.u, 50);
  close(result.v, 10);
});

test('sloped lanes use horizontal projection and compare interpolated road height', () => {
  const road = lane([{ x: 0, y: 0, z: 0 }, { x: 100, y: 7.6, z: 0 }]);
  for (const t of [0, 0.5, 1]) {
    const result = playerInLane(road, player(100 * t, 7.6 * t, 0));
    close(result.u, road.cum[1] * t);
    close(result.v, road.cum[1] / 10);
  }
  assert.equal(playerInLane(road, player(50, 0, 0)), null);
  assert.equal(playerInLane(road, player(100.1, 7.6, 0)), null);
  assert.equal(playerInLane(road, player(50, 3.8, 2.001)), null);
});

test('overlapping road segments select the matching elevation', () => {
  const road = lane([{ x: 0, y: 7.6, z: 0 }, { x: 100, y: 7.6, z: 0 },
    { x: 100, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }]);
  const result = playerInLane(road, player(50, 0, 0));
  close(result.u, 157.6);
  close(result.v, 0);
});

test('underground lanes and helicopters remain excluded', () => {
  const road = lane([{ x: 0, y: -4.5, z: 0 }, { x: 100, y: -4.5, z: 0 }]);
  assert.equal(playerInLane(road, player(50, -4.5, 0)), null);
  assert.equal(player(50, 0, 0, 'helicopter'), null);
  assert.equal(snapshot(null, 'car'), null);
});
