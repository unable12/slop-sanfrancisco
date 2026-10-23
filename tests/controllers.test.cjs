const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = readFileSync(join(__dirname, '../js/controllers.js'), 'utf8');

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    dispatch(type, event = {}) {
      for (const listener of listeners.get(type) || []) listener(event);
    }
  };
}

function keyboardHarness(nyc = {}) {
  const window = eventTarget();
  const document = { ...eventTarget(), hidden: false };
  window.NYC = {
    streetZ: () => 0,
    isTypingInField: (event) => ['INPUT', 'SELECT'].includes(event.target?.tagName),
    ...nyc
  };
  vm.runInNewContext(source, { window, document });
  // Exercise the production event handlers without constructing the scene's 3D models.
  const controller = Object.create(window.NYC.ThirdPersonControllerManager.prototype);
  controller.keys = Object.fromEntries(['forward', 'backward', 'left', 'right', 'up', 'down', 'boost'].map((action) => [action, false]));
  controller.bindKeyboard();
  return {
    controller,
    window,
    document,
    key(type, code, tagName = 'BODY') {
      window.dispatch(type, { code, target: { tagName } });
    }
  };
}

test('releasing a movement key after focusing search stops movement', () => {
  const { controller, key } = keyboardHarness();
  key('keydown', 'KeyW');
  assert.equal(controller.keys.forward, true);
  key('keyup', 'KeyW', 'INPUT');
  assert.equal(controller.keys.forward, false);

  key('keydown', 'KeyW', 'INPUT');
  assert.equal(controller.keys.forward, false, 'typing in search does not move the player');
});

test('releasing one movement binding preserves another held binding', () => {
  const { controller, key } = keyboardHarness();
  key('keydown', 'KeyW');
  key('keydown', 'ArrowUp');
  key('keyup', 'ArrowUp');
  assert.equal(controller.keys.forward, true);
  key('keyup', 'KeyW');
  assert.equal(controller.keys.forward, false);
});

test('either Shift key keeps boost active until both are released', () => {
  const { controller, key } = keyboardHarness();
  key('keydown', 'ShiftLeft');
  key('keydown', 'ShiftRight');
  key('keyup', 'ShiftLeft');
  assert.equal(controller.keys.boost, true);
  key('keyup', 'ShiftRight');
  assert.equal(controller.keys.boost, false);
});

test('keyboard and touch input remain active independently', () => {
  const { controller, key } = keyboardHarness();
  controller.setTouchInput('forward', 0.35);
  assert.equal(controller.keys.forward, 0.35);
  key('keydown', 'KeyW');
  assert.equal(controller.keys.forward, true);
  controller.setTouchInput('forward', 0.6);
  assert.equal(controller.keys.forward, true);
  key('keyup', 'KeyW');
  assert.equal(controller.keys.forward, 0.6);
  controller.setTouchInput('forward', 0);
  assert.equal(controller.keys.forward, false);
});

test('clearing touch input preserves held keyboard controls', () => {
  const { controller, key } = keyboardHarness();
  key('keydown', 'KeyW');
  controller.setTouchInput('forward', 0.4);
  controller.setTouchInput('left', 0.7);
  controller.setTouchInput('boost', true);
  controller.clearTouchInput();
  assert.equal(controller.keys.forward, true);
  assert.equal(controller.keys.left, false);
  assert.equal(controller.keys.boost, false);
  key('keyup', 'KeyW');
  assert.equal(controller.keys.forward, false);
});

test('touch strengths are clamped and unknown actions are ignored', () => {
  const { controller } = keyboardHarness();
  controller.setTouchInput('forward', 2);
  controller.setTouchInput('left', -0.5);
  controller.setTouchInput('up', true);
  controller.setTouchInput('unknown', 1);
  assert.equal(controller.keys.forward, 1);
  assert.equal(controller.keys.left, false);
  assert.equal(controller.keys.up, true);
  assert.equal(Object.hasOwn(controller.keys, 'unknown'), false);
});

for (const interruption of ['blur', 'hidden', 'reset']) {
  test(`${interruption} clears held controls and their physical key state`, () => {
    const { controller, window, document, key } = keyboardHarness();
    key('keydown', 'KeyW');
    key('keydown', 'KeyA');
    key('keydown', 'Space');
    key('keydown', 'ShiftLeft');
    controller.setTouchInput('forward', 0.4);
    controller.setTouchInput('backward', 0.8);
    controller.setTouchInput('down', true);
    if (interruption === 'blur') {
      window.dispatch('blur');
    } else if (interruption === 'hidden') {
      document.hidden = true;
      document.dispatch('visibilitychange');
    } else {
      controller.resetInput();
    }
    assert.equal(Object.values(controller.keys).some(Boolean), false);

    // A fresh use of the alias must not revive the old key whose keyup was lost.
    key('keydown', 'ArrowUp');
    key('keyup', 'ArrowUp');
    assert.equal(controller.keys.forward, false);
  });
}

function advanceWithTouch(mode, strength, reverse) {
  const { controller } = keyboardHarness();
  const entity = { position: { x: 0, y: 0, z: 0 }, heading: 0, speed: 0 };
  if (mode === 'Person') Object.assign(entity, { verticalVel: 0 });
  if (mode === 'Car') Object.assign(entity, {
    vx: 0, vz: 0, angularVel: 0, steerAngle: 0, pitchVel: 0, rollVel: 0, heaveVel: 0, heaveY: 0, wheelSpin: 0,
    chassisPivot: { rotation: { x: 0, z: 0 }, position: { y: 0 } }, wheels: []
  });
  if (mode === 'Cyclist') Object.assign(entity, {
    leanAngle: 0, leanPivot: { rotation: { z: 0 } },
    frontWheel: { rotation: { x: 0 } }, rearWheel: { rotation: { x: 0 } },
    pedalPhase: 0, crankPivot: { rotation: { x: 0 } }, pedals: []
  });
  if (mode === 'Helicopter') Object.assign(entity, {
    verticalSpeed: 0, pitchAngle: 0, rollAngle: 0,
    tiltPivot: { rotation: { x: 0, z: 0 }, position: { y: 0 } }
  });
  controller.entities = { [mode.toLowerCase()]: entity };
  controller.getGroundHeight = () => 0;
  controller.resolveHorizontalCollision = () => {};
  controller.setTouchInput(reverse ? 'backward' : 'forward', strength);
  controller.setTouchInput(reverse ? 'right' : 'left', strength);
  if (mode === 'Helicopter') controller.setTouchInput(reverse ? 'down' : 'up', strength);
  controller[`update${mode}`](0.1, 0);
  return entity;
}

for (const mode of ['Person', 'Car', 'Cyclist', 'Helicopter']) {
  test(`analog ${mode.toLowerCase()} input proportionally scales movement and turning`, () => {
    for (const reverse of [false, true]) {
      const full = advanceWithTouch(mode, 1, reverse);
      const partial = advanceWithTouch(mode, 0.4, reverse);
      assert.ok(Math.abs(partial.speed - full.speed * 0.4) < 1e-10, 'movement should scale with joystick strength');
      const turn = mode === 'Car' ? 'steerAngle' : 'heading';
      assert.ok(Math.abs(partial[turn] - full[turn] * 0.4) < 1e-10, 'turning should scale with joystick strength');
      if (mode === 'Helicopter') {
        assert.ok(Math.abs(partial.verticalSpeed - full.verticalSpeed * 0.4) < 1e-10);
      }
    }
  });
}

function teleportHarness(mode, colliders = [], shore = () => ({ westX: -500, eastX: 500 })) {
  const harness = keyboardHarness({
    ISLAND_BOUNDS: { minX: -500, maxX: 500, minZ: -500, maxZ: 500, sidewalkHeight: 0.22 },
    CENTRAL_PARK_BOUNDS: { minX: 1000, maxX: 1100, minZ: 1000, maxZ: 1100 },
    getIslandBoundsAtZ: shore,
    blockAt: () => null
  });
  const { controller } = harness;
  const position = (x = 0, y = 0, z = 0) => ({ x, y, z, copy(p) { this.x = p.x; this.y = p.y; this.z = p.z; } });
  const pivot = () => ({ position: position(), rotation: { x: 0.1, y: 0, z: -0.2 } });
  const chase = { person: [4.3, 1.95], car: [6.9, 2.12], cyclist: [4.8, 2.05], helicopter: [11.4, 3.3] };
  const ent = {
    type: mode, chaseDistance: chase[mode][0], chaseHeight: chase[mode][1],
    position: position(400, mode === 'helicopter' ? 120 : 0, 400), heading: 1, speed: 20,
    mesh: pivot(),
    verticalVel: 5, vx: 3, vz: -4, angularVel: 2, steerAngle: 0.4,
    pitchVel: 3, rollVel: 4, heaveY: 0.1, heaveVel: 2, chassisPivot: pivot(),
    lastCollisionSpark: { speed: 5 }, carState: { value: { x: 0 } }, wheelSpin: 1,
    wheels: [{ isFront: true, steerPivot: { rotation: { y: 0.4 } }, tire: { rotation: { x: 0 } } }],
    leanAngle: 0.3, leanPivot: pivot(), pedalPhase: 0.7,
    frontWheel: { rotation: { x: 0 } }, rearWheel: { rotation: { x: 0 } },
    crankPivot: { rotation: { x: 0 } }, pedals: [],
    verticalSpeed: -8, pitchAngle: 0.2, rollAngle: -0.2, tiltPivot: pivot(),
    rig: { reset(...args) { this.resetArgs = args; } },
    crowd: { begin() {}, add() {}, end() {} }
  };
  controller.activeMode = mode;
  controller.entities = { [mode]: ent };
  controller.colliders = colliders;
  controller._colliderCells = null;
  controller.getGroundHeight = (x, z, mode) => mode === 'person' ? (x < 0 ? 1.24 : 0.22) : 0;
  return { ...harness, ent };
}

for (const mode of ['person', 'car', 'cyclist', 'helicopter']) {
  test(`${mode} teleport stops carried motion and updates its arrival pose immediately`, () => {
    const { controller, ent, key } = teleportHarness(mode);
    key('keydown', 'KeyW');
    key('keydown', 'Space');
    controller.setTouchInput('left', 0.8);
    const result = controller.teleportActiveTo(30, 20, 0.7);
    assert.deepEqual({ ...result }, { x: 30, z: 20 }, 'an open destination is kept exactly');
    assert.equal(ent.heading, 0.7);
    assert.equal(ent.speed, 0);
    assert.equal(Object.values(controller.keys).some(Boolean), false);
    assert.equal(controller._pressedCodes.size, 0);
    assert.deepEqual([ent.mesh.position.x, ent.mesh.position.y, ent.mesh.position.z], [ent.position.x, ent.position.y, ent.position.z]);
    assert.equal(ent.mesh.rotation.y, 0.7);
    if (mode === 'person') {
      assert.equal(ent.verticalVel, 0);
      assert.equal(ent.position.y, 0.22);
      assert.deepEqual(ent.rig.resetArgs.slice(0, 3), [30, 20, 0.7]);
      assert.equal(ent.rig.resetArgs[3](ent.rig.resetArgs[4], 30, 20), 0.22);
    } else if (mode === 'car') {
      for (const field of ['vx', 'vz', 'angularVel', 'steerAngle', 'pitchVel', 'rollVel', 'heaveY', 'heaveVel']) assert.equal(ent[field], 0, field);
      assert.equal(ent.chassisPivot.rotation.x, 0);
      assert.equal(ent.chassisPivot.rotation.z, 0);
      assert.equal(ent.chassisPivot.position.y, 0);
      assert.equal(ent.wheels[0].steerPivot.rotation.y, 0);
      assert.equal(ent.lastCollisionSpark, null);
    } else if (mode === 'cyclist') {
      assert.equal(ent.leanAngle, 0);
      assert.equal(ent.leanPivot.rotation.z, 0);
    } else {
      for (const field of ['verticalSpeed', 'pitchAngle', 'rollAngle']) assert.equal(ent[field], 0, field);
      assert.equal(ent.tiltPivot.rotation.x, 0);
      assert.equal(ent.tiltPivot.rotation.z, 0);
      assert.equal(ent.tiltPivot.position.y, 0);
      assert.equal(ent.position.y, 120, 'keep the helicopter altitude when already above the minimum');
    }
    const before = [ent.position.x, ent.position.y, ent.position.z, ent.heading];
    controller[`update${mode[0].toUpperCase()}${mode.slice(1)}`](0.1, 0);
    assert.deepEqual([ent.position.x, ent.position.y, ent.position.z, ent.heading], before, 'the first neutral frame stays at the arrival');
  });
}

test('teleport checks all overlapping buildings instead of leaving a sequential push trap', () => {
  const colliders = [
    { minX: 0, maxX: 10, minZ: 0, maxZ: 10, maxY: 200 },
    { minX: 9, maxX: 20, minZ: 0, maxZ: 10, maxY: 200 }
  ];
  for (const mode of ['person', 'car', 'cyclist', 'helicopter']) {
    // Reverse order as well: a valid arrival must not rely on collider traversal order.
    for (const list of [colliders, colliders.slice().reverse()]) {
      const { controller, ent } = teleportHarness(mode, list.map(c => ({ ...c })));
      const result = controller.teleportActiveTo(11, 5, 0);
      assert.notDeepEqual({ ...result }, { x: 11, z: 5 });
      const before = [ent.position.x, ent.position.z];
      const radius = mode === 'helicopter' ? 4.5 : mode === 'person' ? 0.48 : 0.65;
      controller.resolveHorizontalCollision(ent.position, radius, mode === 'helicopter' ? ent.position.y : 1, mode === 'car' ? ent : null);
      assert.deepEqual([ent.position.x, ent.position.z], before, `${mode} must already be collision-free`);
      assert.equal(ent.position.y, mode === 'helicopter' ? 120 : controller.getGroundHeight(result.x, result.z, mode));
    }
  }
});

test('teleports use oriented building footprints without rejecting clear corners of their bounds', () => {
  const cs = Math.SQRT1_2;
  const box = { minX: -8, maxX: 8, minZ: -8, maxZ: 8, maxY: 200, obb: { cx: 0, cz: 0, hx: 8, hz: 2, cs, sn: cs } };
  for (const mode of ['person', 'car', 'cyclist', 'helicopter']) {
    const { controller, ent } = teleportHarness(mode, [{ ...box }]);
    assert.deepEqual({ ...controller.teleportActiveTo(7, 7, 0.6) }, { x: 7, z: 7 });
    const actual = controller.teleportActiveTo(0, 0, 0.6);
    const before = [actual.x, actual.z];
    controller.resolveHorizontalCollision(ent.position, mode === 'helicopter' ? 4.5 : mode === 'person' ? 0.48 : 0.65,
      mode === 'helicopter' ? ent.position.y : 1, mode === 'car' ? ent : null);
    assert.deepEqual([ent.position.x, ent.position.z], before);
  }
});

test('ground arrivals share movement shoreline limits while helicopters may remain above lower buildings', () => {
  const shore = z => ({ westX: -40 + z * 0.05, eastX: 40 + z * 0.05 });
  const { controller, ent } = teleportHarness('person', [], shore);
  const result = controller.teleportActiveTo(1000, -1000);
  assert.deepEqual({ ...result }, { x: 8.5, z: -470 });
  controller.resolveHorizontalCollision(ent.position, 0.48, ent.position.y + 1);
  assert.deepEqual([ent.position.x, ent.position.z], [result.x, result.z]);

  const heli = teleportHarness('helicopter', [{ minX: -30, maxX: 30, minZ: -30, maxZ: 30, maxY: 50 }]);
  heli.ent.position.y = 10;
  assert.deepEqual({ ...heli.controller.teleportActiveTo(0, 0) }, { x: 0, z: 0 });
  assert.equal(heli.ent.position.y, 92);
});

test('a displaced pedestrian samples ground and resets its feet at the resolved destination', () => {
  const { controller, ent } = teleportHarness('person', [{ minX: -4, maxX: 0, minZ: -10, maxZ: 10, maxY: 30 }]);
  assert.deepEqual({ ...controller.teleportActiveTo(-1, 0) }, { x: 3, z: 0 });
  assert.equal(ent.position.y, 0.22, 'the requested point was on the higher ground, but the clear arrival is lower');
  assert.deepEqual(ent.rig.resetArgs.slice(0, 2), [3, 0]);
});

test('failed or invalid teleports keep the current position and stop the player with bounded search', () => {
  const { controller, ent } = teleportHarness('car', [{ minX: -300, maxX: 300, minZ: -300, maxZ: 300, maxY: 500 }]);
  let checks = 0;
  const near = controller.nearColliders;
  controller.nearColliders = function (...args) { checks++; return near.apply(this, args); };
  assert.deepEqual({ ...controller.teleportActiveTo(0, 0) }, { x: 400, z: 400 });
  assert.ok(checks <= 2049, 'the search must be bounded even inside an enormous obstacle');
  assert.equal(ent.speed, 0);
  assert.equal(ent.vx, 0);
  assert.equal(ent.angularVel, 0);
  assert.deepEqual({ ...controller.teleportActiveTo(NaN, Infinity) }, { x: 400, z: 400 });
});

test('successive mode teleports keep parked players out of the arrival and default chase view', () => {
  const { controller, ent: car } = teleportHarness('car');
  const person = teleportHarness('person').ent;
  const cyclist = teleportHarness('cyclist').ent;
  controller.entities = { car, person, cyclist };
  person.position.x = 300;
  cyclist.position.x = 200;
  const heading = Math.PI / 2; // The first radial candidate is +X: its rear camera would sit on the parked car.
  assert.deepEqual({ ...controller.teleportActiveTo(0, 0, heading) }, { x: 0, z: 0 });
  const arrivals = [car];
  const radii = { car: 2.4, person: 0.48, cyclist: 1.0 };
  for (const mode of ['person', 'cyclist']) {
    controller.activeMode = mode;
    const ent = controller.entities[mode];
    const actual = controller.teleportActiveTo(0, 0, heading);
    assert.notDeepEqual({ ...actual }, { x: 0, z: 0 });
    for (const parked of arrivals) {
      const dx = parked.position.x - actual.x, dz = parked.position.z - actual.z;
      const cameraBack = Math.cos(0.09) * ent.chaseDistance;
      const along = Math.max(0, Math.min(cameraBack, -dx));
      assert.ok(Math.hypot(dx, dz) > radii[parked.type] + radii[mode], 'player bodies must not overlap');
      assert.ok(Math.hypot(dx + along, dz) > radii[parked.type] + 0.5, 'the complete default chase corridor must be clear');
    }
    assert.deepEqual([car.position.x, car.position.z], [0, 0], 'switching modes leaves the parked car in place');
    arrivals.push(ent);
  }
});

test('player clearance respects altitude and permits a ground arrival under an airborne helicopter', () => {
  const { controller, ent } = teleportHarness('person');
  const helicopter = teleportHarness('helicopter').ent;
  helicopter.position.x = helicopter.position.z = 0;
  helicopter.position.y = 120;
  controller.entities.helicopter = helicopter;
  assert.deepEqual({ ...controller.teleportActiveTo(0, 0) }, { x: 0, z: 0 });
  assert.equal(ent.position.y, 0.22);
  helicopter.position.y = 1;
  assert.notDeepEqual({ ...controller.teleportActiveTo(0, 0) }, { x: 0, z: 0 }, 'a helicopter parked at street level must be avoided');
});

// P5.6: the real landmark colliders (OBBs with minY / maxY, tests/helpers/landmarks-build.cjs): Salesforce Tower blocks
// a ground arrival on its site, and a helicopter over its 326 m top may stay there
test('landmark colliders block a ground arrival and let a helicopter hover over the top', { skip: !require('./helpers/landmarks-build.cjs').available && 'no data' }, () => {
  const { buildLandmarksHeadless } = require('./helpers/landmarks-build.cjs');
  const { landmarks, NYC } = buildLandmarksHeadless();
  const s = NYC.LANDMARK_SITES['Salesforce Tower'];
  const shore = () => ({ westX: -5000, eastX: 5000 });
  const { controller } = teleportHarness('person', landmarks.colliders, shore);
  controller.getGroundHeight = (x, z) => NYC.Terrain.groundAt(x, z);
  assert.notDeepEqual({ ...controller.teleportActiveTo(s.x, s.z) }, { x: s.x, z: s.z }, 'pushed off the tower');
  const heli = teleportHarness('helicopter', landmarks.colliders, shore);
  heli.ent.position.y = s.base + s.topH + 10;
  assert.deepEqual({ ...heli.controller.teleportActiveTo(s.x, s.z) }, { x: s.x, z: s.z }, 'above the crown');
});

// P2.6: a stub terrain rising 30% to the north (-z): ground = 0.3 * -z
function slopeHarness() {
  const ground = (x, z) => -0.3 * z;
  const harness = keyboardHarness({
    ISLAND_BOUNDS: { minX: -5000, maxX: 5000, minZ: -5000, maxZ: 5000, sidewalkHeight: 0.15 },
    getIslandBoundsAtZ: () => ({ westX: -5000, eastX: 5000 }),
    blockAt: () => null,
    Terrain: { loaded: true, groundAt: ground, heightAt: ground, waterLevel: -1000 }
  });
  harness.controller.colliders = [];
  harness.controller._colliderCells = null;
  return { ...harness, ground };
}

test('on a 30% slope the pedestrian keeps its feet on the ground walking up and down', () => {
  const { controller, ground, key } = slopeHarness();
  const p = { position: { x: 0, y: 0, z: 0 }, heading: Math.PI, speed: 0, verticalVel: 0 };
  controller.entities = { person: p };
  controller.activeMode = 'person';
  key('keydown', 'KeyW');
  for (const heading of [Math.PI, 0]) { // north = uphill, then back down
    p.heading = heading;
    for (let f = 0; f < 600; f++) {
      controller.updatePerson(1 / 60);
      assert.ok(Math.abs(p.position.y - ground(p.position.x, p.position.z)) < 0.02, `frame ${f}: ${p.position.y - ground(p.position.x, p.position.z)}`);
    }
  }
  // 10 s up at the uphill pace, 10 s down at full pace: it ends below where it started
  assert.ok(p.position.z > 5, `ended at z ${p.position.z}`);
});

test('a car on the slope pitches to the grade within 1 degree in 0.5 s', () => {
  const { controller, ground } = slopeHarness();
  const c = {
    type: 'car', position: { x: 0, y: 0, z: 0 }, heading: Math.PI, speed: 0,
    vx: 0, vz: 0, angularVel: 0, steerAngle: 0, pitchVel: 0, rollVel: 0, heaveVel: 0, heaveY: 0, wheelSpin: 0,
    chassisPivot: { rotation: { x: 0, z: 0 }, position: { y: 0 } }, wheels: [],
    mesh: { rotation: { x: 0, y: 0, z: 0 } }, terrainPitch: 0, terrainRoll: 0
  };
  controller.entities = { car: c };
  controller.activeMode = 'car';
  for (let f = 0; f < 30; f++) controller.updateCar(1 / 60);
  const slope = Math.atan(0.3);
  assert.ok(Math.abs(c.terrainPitch - slope) < Math.PI / 180, `pitch ${c.terrainPitch} vs ${slope}`);
  assert.ok(Math.abs(c.terrainRoll) < 1e-9);
  assert.ok(Math.abs(c.position.y - ground(c.position.x, c.position.z)) < 1e-9);
  assert.equal(c.mesh.rotation.x, -c.terrainPitch, 'nose up');
  assert.equal(c.speed, 0, 'a car left without throttle holds on the hill');
});

test('the helicopter cannot go below 2 m over the ground', () => {
  const { controller, ground, key } = slopeHarness();
  const h = {
    position: { x: 0, y: 50, z: 0 }, heading: Math.PI, speed: 0,
    verticalSpeed: 0, pitchAngle: 0, rollAngle: 0, tiltPivot: { rotation: { x: 0, z: 0 }, position: { y: 0 } }
  };
  controller.entities = { helicopter: h };
  controller.activeMode = 'helicopter';
  key('keydown', 'KeyC'); // descend
  key('keydown', 'KeyW'); // fly uphill into the slope
  for (let f = 0; f < 900; f++) {
    controller.updateHelicopter(1 / 60, f / 60);
    // the floor is the highest ground under the rotor disc (4.5 m around)
    assert.ok(h.position.y >= ground(h.position.x, h.position.z) + 2 - 1e-9, `frame ${f}`);
  }
});
