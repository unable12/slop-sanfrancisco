// tools/geo-groundmask.mjs — the ground mask: what the terrain surface is made of, one byte per 1 m cell, read by the
// terrain material (js/terrain-mesh.js). Classes:
//   0 asphalt (the default: roadway and any other land)   1 sidewalk / plaza (under the curb islands, paved squares)
//   2 lawn (parks)   3 sand (none in the slice)   4 rock (slopes steeper than ROCK_SLOPE off the curb islands)
//   5 water edge (the bay and the land within SHORE m of it: the seawall face the terrain mesh drops into the water)
// Output: data/groundmask-<box>.bin (format: docs/formats.md, "sf-groundmask").
import path from 'node:path';
import { Raster, log, ROOT } from './geo-base.mjs';
import { readBin, writeBin } from './geo-terrain.mjs';

export const MASK = { asphalt: 0, sidewalk: 1, lawn: 2, sand: 3, rock: 4, waterEdge: 5 };
const CELL = 1;
const ROCK_SLOPE = 0.7; // rise over run (35 degrees): steeper than any street (SF's steepest are about 0.32)
const SHORE = 3; // metres of land next to the water painted as seawall
const PAVED = /plaza|square/i; // park categories that are paved (Union Square, Justin Herman Plaza...)

// blocks: curb island rings [[x, z], ...]; parks: [{ cat, rings: [[[x, z], ...]] }]
export function buildGroundMask(box, { blocks, parks }) {
  const { header: T, payload } = readBin(path.join(ROOT, `data/terrain-${box}.bin`));
  const q = new Uint16Array(payload.buffer, payload.byteOffset, T.w * T.h);
  const height = (i, j) => T.minH + q[j * T.w + i] * T.scale;
  const heightAt = (x, z) => {
    const fi = Math.min(T.w - 1.001, Math.max(0, (x - T.originX) / T.cell));
    const fj = Math.min(T.h - 1.001, Math.max(0, (z - T.originZ) / T.cell));
    const i = Math.floor(fi), j = Math.floor(fj), tx = fi - i, tz = fj - j;
    const a = height(i, j) + (height(i + 1, j) - height(i, j)) * tx;
    const b = height(i, j + 1) + (height(i + 1, j + 1) - height(i, j + 1)) * tx;
    return a + (b - a) * tz;
  };

  const x1 = T.originX + (T.w - 1) * T.cell, z1 = T.originZ + (T.h - 1) * T.cell;
  const R = new Raster(T.originX, T.originZ, x1 - CELL, z1 - CELL, CELL); // cells [x0 + i, x0 + i + 1)
  for (const ring of blocks) if (ring.length > 2) R.fillRing(ring, MASK.sidewalk);
  for (const p of parks) for (const ring of p.rings) R.fillRing(ring, PAVED.test(p.cat || '') ? MASK.sidewalk : MASK.lawn);

  // water, then the rock faces and the shore band
  const wet = new Uint8Array(R.w * R.h);
  for (let j = 0; j < R.h; j++) {
    for (let i = 0; i < R.w; i++) {
      const x = R.x0 + (i + 0.5) * CELL, z = R.z0 + (j + 0.5) * CELL;
      if (heightAt(x, z) <= T.waterLevel + 0.05) wet[j * R.w + i] = 1;
    }
  }
  const W = new Raster(T.originX, T.originZ, x1 - CELL, z1 - CELL, CELL);
  W.d = wet;
  const shore2 = W.edt((v) => v === 1); // squared distance in cells to the nearest water cell
  const counts = new Array(6).fill(0);
  for (let j = 0; j < R.h; j++) {
    for (let i = 0; i < R.w; i++) {
      const k = j * R.w + i;
      if (shore2[k] <= SHORE * SHORE) R.d[k] = MASK.waterEdge;
      else if (R.d[k] === MASK.asphalt) {
        const x = R.x0 + (i + 0.5) * CELL, z = R.z0 + (j + 0.5) * CELL;
        const gx = (heightAt(x + 1, z) - heightAt(x - 1, z)) / 2, gz = (heightAt(x, z + 1) - heightAt(x, z - 1)) / 2;
        if (Math.hypot(gx, gz) > ROCK_SLOPE) R.d[k] = MASK.rock;
      }
      counts[R.d[k]]++;
    }
  }
  const header = {
    format: 'sf-groundmask', version: 1, box, cell: CELL, originX: R.x0, originZ: R.z0, w: R.w, h: R.h,
    classes: Object.keys(MASK)
  };
  writeBin(path.join(ROOT, `data/groundmask-${box}.bin`), header, R.d);
  const share = counts.map((c, k) => `${Object.keys(MASK)[k]} ${((100 * c) / R.d.length).toFixed(1)}%`).join(', ');
  log(`ground mask ${box}: ${R.w}x${R.h} @ ${CELL} m: ${share}`);
  return { url: `data/groundmask-${box}.bin`, w: R.w, h: R.h };
}
