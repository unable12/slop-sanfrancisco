(function () {
// js/terrain.js
// The ground's height API over the baked height field (data/terrain-<box>.bin, docs/formats.md; loaded by
// data-loader.js). Pure JS, no THREE: every system that needs the ground (terrain mesh, curbs, buildings, controllers,
// cameras, road network, traffic, pedestrians, street details) asks here. Heights are metres NAVD88 = world y.
//
//   Terrain.load(header, q)        Uint16 samples, row-major, row j = z originZ + j * cell, column i = x originX + i * cell
//   Terrain.heightAt(x, z)         bilinear; outside the data -> waterLevel - 5
//   Terrain.groundAt(x, z)         max(heightAt, waterLevel): what stands on land or floats on the bay
//   Terrain.normalAt(x, z, out)    unit normal {x, y, z} from central differences of heightAt
//   Terrain.slopeAt(x, z)          |grad heightAt| (rise over run)
//   Terrain.waterLevel             the hydro-flattened bay surface

const Terrain = {
  loaded: false,
  waterLevel: 0,
  header: null,
  cell: 1,
  originX: 0,
  originZ: 0,
  w: 0,
  h: 0,
  heights: null, // Float32Array of decoded samples (decoding once keeps heightAt to 4 loads)

  load(header, q) {
    this.header = header;
    this.cell = header.cell;
    this.originX = header.originX;
    this.originZ = header.originZ;
    this.w = header.w;
    this.h = header.h;
    this.waterLevel = header.waterLevel;
    const heights = new Float32Array(header.w * header.h);
    for (let k = 0; k < heights.length; k++) heights[k] = header.minH + q[k] * header.scale;
    this.heights = heights;
    this.loaded = true;
    return this;
  },

  heightAt(x, z) {
    const fi = (x - this.originX) / this.cell;
    const fj = (z - this.originZ) / this.cell;
    if (!(fi >= 0 && fj >= 0 && fi <= this.w - 1 && fj <= this.h - 1)) return this.waterLevel - 5;
    const i = Math.min(this.w - 2, fi | 0);
    const j = Math.min(this.h - 2, fj | 0);
    const tx = fi - i;
    const tz = fj - j;
    const H = this.heights;
    const k = j * this.w + i;
    const a = H[k] + (H[k + 1] - H[k]) * tx;
    const b = H[k + this.w] + (H[k + this.w + 1] - H[k + this.w]) * tx;
    return a + (b - a) * tz;
  },

  groundAt(x, z) {
    const y = this.heightAt(x, z);
    return y > this.waterLevel ? y : this.waterLevel;
  },

  // central differences half a cell either side (smooth across cell borders)
  gradientAt(x, z, out = { x: 0, z: 0 }) {
    const e = this.cell * 0.5;
    out.x = (this.heightAt(x + e, z) - this.heightAt(x - e, z)) / (2 * e);
    out.z = (this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e);
    return out;
  },

  normalAt(x, z, out = { x: 0, y: 1, z: 0 }) {
    const g = this.gradientAt(x, z, _grad);
    const len = Math.hypot(g.x, 1, g.z);
    out.x = -g.x / len;
    out.y = 1 / len;
    out.z = -g.z / len;
    return out;
  },

  slopeAt(x, z) {
    const g = this.gradientAt(x, z, _grad);
    return Math.hypot(g.x, g.z);
  }
};
const _grad = { x: 0, z: 0 };

Object.assign(window.NYC, { Terrain });
})();
