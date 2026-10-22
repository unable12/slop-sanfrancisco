const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const read = (path) => readFileSync(join(__dirname, '..', path), 'utf8');
const context = vm.createContext({ window: { NYC: {} } });
for (const path of ['js/sf-geodata.js', 'js/city-config.js']) vm.runInContext(read(path), context);
const { TELEPORT_LOCATIONS, LANDMARK_SITES, blockAt, nearestRoads, getIslandBoundsAtZ } = context.window.NYC;

test('every teleport button has a destination on a real roadway inside the detailed land', () => {
  const buttons = [...read('index.html').matchAll(/data-teleport="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(Object.keys(TELEPORT_LOCATIONS).sort(), buttons.sort());
  for (const [name, point] of Object.entries(TELEPORT_LOCATIONS)) {
    assert.ok(Number.isFinite(point.heading), `${name} has a heading`);
    assert.equal(blockAt(point.x, point.z), null, `${name} lands outside building blocks`);
    const shore = getIslandBoundsAtZ(point.z);
    assert.ok(point.x > shore.westX + 8 && point.x < shore.eastX - 8, `${name} stays on the land`);
    const nearby = nearestRoads(point.x, point.z, 20);
    assert.ok(nearby.some(({ road, dist }) => dist < road.w / 2), `${name} lands within a street's width`);
  }
});

test('the core\'s landmark arrivals: a street junction near each OSM landmark, facing it; Lombard\'s at its top', () => {
  const names = {
    ferry: 'San Francisco Ferry Building', transamerica: 'Transamerica Pyramid', coit: 'Coit Tower', lombard: 'Lombard Street',
    wharf: "Fisherman's Wharf", unionsquare: 'Union Square', chinatown: 'Dragon Gate', civiccenter: 'San Francisco City Hall',
    oraclepark: 'Oracle Park', nobhill: 'Grace Cathedral'
  };
  for (const [key, name] of Object.entries(names)) {
    const point = TELEPORT_LOCATIONS[key];
    const lm = LANDMARK_SITES[name];
    assert.ok(point && lm, `${key}: ${name}`);
    assert.equal(point.landmark, name);
    const d = Math.hypot(lm.x - point.x, lm.z - point.z);
    assert.ok(d < 160, `${key}: ${d.toFixed(0)} m from ${name}`);
    assert.ok(Math.abs(Math.atan2(lm.x - point.x, lm.z - point.z) - point.heading) < 1e-9, `${key} faces ${name}`);
  }
  const top = nearestRoads(TELEPORT_LOCATIONS.lombard.x, TELEPORT_LOCATIONS.lombard.z, 5).map(({ road }) => road.name);
  assert.ok(top.includes('Hyde St') && top.includes('Lombard St'), top.join(', '));
});

test('the Transamerica arrival is on Montgomery St, near the pyramid', () => {
  const point = TELEPORT_LOCATIONS.transamerica;
  const tower = LANDMARK_SITES['Transamerica Pyramid'];
  assert.ok(nearestRoads(point.x, point.z, 20).some(({ road, dist }) => road.name === 'Montgomery St' && dist < 1));
  assert.ok(Math.hypot(tower.x - point.x, tower.z - point.z) < 150, 'within sight of the pyramid');
});

test('the Ferry Building arrival is on the roadway of The Embarcadero', () => {
  const point = TELEPORT_LOCATIONS.ferry;
  assert.ok(nearestRoads(point.x, point.z, 20).some(({ road, dist }) => road.name === 'The Embarcadero' && dist < road.w / 2 + 6));
  assert.equal(blockAt(point.x, point.z), null);
});

test('preset and map teleports share arrival resets and mark the resolved landing point', () => {
  const main = read('js/main.js');
  const start = main.indexOf('  function teleportTo(');
  const end = main.indexOf('  const openMapBtn', start);
  const handlers = new Map();
  const calls = [];
  const landed = { x: -305.7, z: 5210 };
  let map;
  const environment = {
    window: { NYC: { TELEPORT_LOCATIONS } },
    controllerManager: {
      teleportActiveTo: (...args) => { calls.push(['teleport', ...args]); return landed; }
    },
    touchControls: { reset: () => calls.push(['touch']) },
    cameraSystem: { resetForTeleport: () => calls.push(['camera']) },
    selectCamera: (...args) => calls.push(['selectCamera', ...args]),
    getLocationLabel: (x, z) => `${x}, ${z}`,
    trafficSystem: {},
    NYCMapSystem: class {
      constructor(options) { this.onTeleport = options.onTeleport; map = this; }
    },
    teleportButtons: Object.keys(TELEPORT_LOCATIONS).map((key) => ({
      getAttribute: () => key,
      addEventListener: (_event, handler) => handlers.set(key, handler)
    })),
    closePopovers: () => {}
  };
  vm.runInNewContext(main.slice(start, end), environment);
  for (const [name, point] of Object.entries(TELEPORT_LOCATIONS)) {
    calls.length = 0;
    handlers.get(name)();
    assert.deepEqual(calls, [
      ['teleport', point.x, point.z, point.heading], ['touch'], ['camera'], ['selectCamera', 'chase', true]
    ]);
    assert.equal(map.waypoint.x, landed.x);
    assert.equal(map.waypoint.z, landed.z);
  }
  map.waypoint = { x: 100, z: 200, name: 'inside a building' };
  map.onTeleport(100, 200);
  assert.equal(map.waypoint.x, landed.x, 'map marker follows the safe position returned by the controller');
  assert.equal(map.waypoint.z, landed.z);
  assert.equal(map.waypoint.name, `${landed.x}, ${landed.z}`);
});
