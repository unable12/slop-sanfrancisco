// Facade floors count from each building's ground (P2.5.1): the production `vCoord` / `gridV` / plinth lines of
// facadeCell (js/tsl-materials.js), evaluated numerically, give a box standing at y = 0 and the same box at y = 87 the
// same floor index at every height on the wall, and a solid plinth below base + plinth; a box's own storey height
// (`boxBase.z`, P4.3) replaces the material's.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = readFileSync(join(__dirname, '../js/tsl-materials.js'), 'utf8');
const start = source.indexOf('  let vCoord = positionWorld.y;', source.indexOf('function facadeCell('));
const end = source.indexOf('\n', source.indexOf('const gridV = vCoord.div(floorHeight);', start));
const snippet = source.slice(start, end);
assert.ok(start > 0 && snippet.includes('boxBase'), 'facadeCell measures height from boxBase');

class N {
  constructor(v) { this.v = v; }
  get x() { return new N(this.v[0]); }
  get y() { return new N(this.v[1]); }
  get z() { return new N(this.v[2]); }
  sub(o) { return new N(this.v - val(o)); }
  add(o) { return new N(this.v + val(o)); }
  div(o) { return new N(this.v / val(o)); }
  mul(o) { return new N(this.v * val(o)); }
}
const val = (o) => (o instanceof N ? o.v : o);

function evaluate(worldY, base, plinth, floorHeight = 3.4, storeyH = 0) {
  const context = {
    positionWorld: { y: new N(worldY) },
    attribute: () => new N([base, plinth, storeyH]),
    float: (v) => new N(v),
    step: (edge, x) => new N(val(x) < val(edge) ? 0 : 1),
    mix: (a, b, t) => new N(val(a) * (1 - val(t)) + val(b) * val(t)),
    groundBase: true,
    floorHeight
  };
  return vm.runInNewContext(`${snippet.replace(/^\s*let /gm, 'var ').replace(/^\s*const /gm, 'var ')}; ({ gridV: gridV.v, plinth: plinthBand.v })`, context);
}

test('the same box at y = 0 and at y = 87 gets identical floor indices', () => {
  for (let h = 0.05; h < 60; h += 0.37) {
    const a = evaluate(h, 0, 0);
    const b = evaluate(87 + h, 87, 0);
    assert.equal(Math.floor(a.gridV), Math.floor(b.gridV), `floor at ${h} m`);
    assert.equal(a.plinth, 0);
    assert.equal(b.plinth, 0);
  }
});

test('a downhill plinth is solid below base + plinth and floors start above it', () => {
  const below = evaluate(87 + 1.5, 87, 2.4);
  const above = evaluate(87 + 2.5, 87, 2.4);
  assert.equal(below.plinth, 1);
  assert.equal(above.plinth, 0);
  assert.equal(Math.floor(above.gridV), 0);
  assert.equal(Math.floor(evaluate(87 + 2.4 + 3.5, 87, 2.4).gridV), 1);
});

test('a box’s own storey height replaces the material’s; 0 keeps it', () => {
  assert.equal(Math.floor(evaluate(87 + 3.6, 87, 0, 3.4, 0).gridV), 1);
  assert.equal(Math.floor(evaluate(87 + 3.6, 87, 0, 3.4, 3.9).gridV), 0);
  assert.equal(Math.floor(evaluate(87 + 3.95, 87, 0, 3.4, 3.9).gridV), 1);
});
