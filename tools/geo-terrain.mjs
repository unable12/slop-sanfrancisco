// tools/geo-terrain.mjs — bakes the USGS 1 m lidar DEM (data/raw/dem/*.tif, NAD83 / UTM 10N, NAVD88 metres) into the
// world-frame height field the game uses: a 2 m grid over the box (+ margin), 2 x 2 box-filtered, lightly smoothed,
// quantised to uint16. The bay is hydro-flattened in the DEM: its constant surface is measured as the water level.
// Output: data/terrain-<box>.bin (format: docs/formats.md) + docs/reports/terrain-<box>.md
//
// usage: node tools/geo-terrain.mjs [box]          (box from tools/boxes.json, default "slice")
import fs from 'node:fs';
import path from 'node:path';
import { fromFile } from 'geotiff';
import proj4 from 'proj4';
import { fromWorld, boxWorld, datasf, worldLines, log, ROOT, RAW } from './geo-base.mjs';

proj4.defs('EPSG:26910', '+proj=utm +zone=10 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
const toUTM = proj4('WGS84', 'EPSG:26910'); // NAD83 ~ WGS84 (null transform), like the DataSF lat/lon

const CELL = 2; // metres
const MARGIN = 120; // metres of terrain around the box
const NODATA_MIN = -1000;

export async function bakeTerrain(boxName = 'slice') {
  const B = boxWorld(boxName);
  const x0 = Math.floor((B.x0 - MARGIN) / CELL) * CELL;
  const z0 = Math.floor((B.z0 - MARGIN) / CELL) * CELL;
  const w = Math.ceil((B.x1 + MARGIN - x0) / CELL) + 1;
  const h = Math.ceil((B.z1 + MARGIN - z0) / CELL) + 1;

  // UTM coordinates of every sample (cell centres are at x0 + i * CELL)
  const ux = new Float64Array(w * h);
  const uy = new Float64Array(w * h);
  let umin = [Infinity, Infinity], umax = [-Infinity, -Infinity];
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const [lon, lat] = fromWorld(x0 + i * CELL, z0 + j * CELL);
      const [e, n] = toUTM.forward([lon, lat]);
      const k = j * w + i;
      ux[k] = e;
      uy[k] = n;
      umin = [Math.min(umin[0], e), Math.min(umin[1], n)];
      umax = [Math.max(umax[0], e), Math.max(umax[1], n)];
    }
  }

  // Read the DEM windows that cover the box (one or more 10 km tiles)
  const tiles = fs.readdirSync(path.join(RAW, 'dem')).filter((f) => /\.tif$/i.test(f));
  const heights = new Float32Array(w * h).fill(NaN);
  for (const f of tiles) {
    const tiff = await fromFile(path.join(RAW, 'dem', f));
    const img = await tiff.getImage();
    const [ox, oy] = img.getOrigin();
    const [rx, ry] = img.getResolution();
    const W = img.getWidth(), H = img.getHeight();
    const nodata = Number(img.getGDALNoData());
    const c0 = Math.max(0, Math.floor((umin[0] - ox) / rx) - 3), c1 = Math.min(W, Math.ceil((umax[0] - ox) / rx) + 3);
    const r0 = Math.max(0, Math.floor((umax[1] - oy) / ry) - 3), r1 = Math.min(H, Math.ceil((umin[1] - oy) / ry) + 3);
    if (c1 <= c0 || r1 <= r0) continue;
    const [data] = await img.readRasters({ window: [c0, r0, c1, r1] });
    const ww = c1 - c0;
    const at = (c, r) => {
      const v = data[(r - r0) * ww + (c - c0)];
      return v === nodata || v < NODATA_MIN ? NaN : v;
    };
    // bilinear on pixel centres
    const bil = (e, n) => {
      const fc = (e - ox) / rx - 0.5, fr = (n - oy) / ry - 0.5;
      const c = Math.floor(fc), r = Math.floor(fr);
      if (c < c0 || r < r0 || c + 1 >= c1 || r + 1 >= r1) return NaN;
      const tx = fc - c, ty = fr - r;
      return (at(c, r) * (1 - tx) + at(c + 1, r) * tx) * (1 - ty) + (at(c, r + 1) * (1 - tx) + at(c + 1, r + 1) * tx) * ty;
    };
    for (let k = 0; k < w * h; k++) {
      if (!Number.isNaN(heights[k])) continue;
      // 2 x 2 box filter of the 1 m source: mean of 4 bilinear samples half a metre around the cell centre
      let s = 0, n = 0;
      for (const [dx, dy] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
        const v = bil(ux[k] + dx, uy[k] + dy);
        if (!Number.isNaN(v)) { s += v; n++; }
      }
      if (n) heights[k] = s / n;
    }
    log(`${f}: read window ${c1 - c0} x ${r1 - r0} px`);
  }

  // Water level: the hydro-flattened bay surface is the most common exact low value
  const counts = new Map();
  for (const v of heights) if (v < 5) { const key = Math.round(v * 100); counts.set(key, (counts.get(key) || 0) + 1); }
  let waterKey = null, best = 0;
  for (const [key, c] of counts) if (c > best) { best = c; waterKey = key; }
  if (waterKey === null) throw new Error('no low cells: cannot measure the water level');
  const waterLevel = waterKey / 100;
  let missing = 0;
  for (let k = 0; k < heights.length; k++) if (Number.isNaN(heights[k])) { heights[k] = waterLevel; missing++; }

  // Light separable Gaussian (sigma = 1 cell) on land only; water stays exactly flat
  const isWater = (v) => Math.abs(v - waterLevel) < 0.005;
  const K = [0.0545, 0.2442, 0.4026, 0.2442, 0.0545];
  const tmp = new Float32Array(heights.length);
  const blur = (src, dst, step, len, lines, lineStep) => {
    for (let l = 0; l < lines; l++) {
      for (let i = 0; i < len; i++) {
        const k = l * lineStep + i * step;
        if (isWater(src[k])) { dst[k] = src[k]; continue; }
        let s = 0, ws = 0;
        for (let d = -2; d <= 2; d++) {
          const ii = i + d;
          if (ii < 0 || ii >= len) continue;
          const v = src[l * lineStep + ii * step];
          if (isWater(v)) continue;
          s += v * K[d + 2]; ws += K[d + 2];
        }
        dst[k] = s / ws;
      }
    }
  };
  blur(heights, tmp, 1, w, h, w); // along x
  blur(tmp, heights, w, h, w, 1); // along z

  let minH = Infinity, maxH = -Infinity, waterCells = 0;
  for (const v of heights) { if (v < minH) minH = v; if (v > maxH) maxH = v; if (isWater(v)) waterCells++; }
  minH = Math.floor(minH) - 1;
  maxH = Math.ceil(maxH) + 1;
  const scale = (maxH - minH) / 65535;
  const q = new Uint16Array(w * h);
  for (let k = 0; k < q.length; k++) q[k] = Math.round((heights[k] - minH) / scale);

  const header = { format: 'sf-terrain', version: 1, box: boxName, cell: CELL, originX: x0, originZ: z0, w, h, minH, maxH, scale, waterLevel, datum: 'NAVD88 m', source: tiles };
  const out = path.join(ROOT, `data/terrain-${boxName}.bin`);
  writeBin(out, header, q);

  // Report: grades along street centrelines over 15 m windows
  const sample = (x, z) => {
    const fi = (x - x0) / CELL, fj = (z - z0) / CELL;
    const i = Math.max(0, Math.min(w - 2, Math.floor(fi))), j = Math.max(0, Math.min(h - 2, Math.floor(fj)));
    const tx = fi - i, ty = fj - j;
    const v = (ii, jj) => minH + q[jj * w + ii] * scale;
    return (v(i, j) * (1 - tx) + v(i + 1, j) * tx) * (1 - ty) + (v(i, j + 1) * (1 - tx) + v(i + 1, j + 1) * tx) * ty;
  };
  const grades = [];
  for (const f of datasf('streets', boxName)) {
    const p = f.properties;
    // freeways, ramps & tunnels don't follow the bare earth (viaducts, bores): they are graded separately (P3.3)
    if (/^PAPER|PSEUDO/.test(p.layer) || String(p.classcode) === '1' || /\b(TUNL|RAMP)\b/.test(p.streetname)) continue;
    for (const line of worldLines(f.geometry)) {
      const pts = [];
      for (let a = 0; a + 1 < line.length; a++) {
        const [ax, az] = line[a], [bx, bz] = line[a + 1];
        const L = Math.hypot(bx - ax, bz - az);
        for (let s = 0; s < L; s += 1) pts.push([ax + ((bx - ax) * s) / L, az + ((bz - az) * s) / L]);
      }
      let maxG = 0;
      for (let a = 0; a + 15 < pts.length; a++) {
        const g = Math.abs(sample(...pts[a + 15]) - sample(...pts[a])) / 15;
        if (g > maxG) maxG = g;
      }
      grades.push({ name: p.streetname, from: p.f_st, to: p.t_st, grade: maxG });
    }
  }
  grades.sort((a, b) => b.grade - a.grade);
  const share = (t) => ((100 * grades.filter((g) => g.grade > t).length) / grades.length).toFixed(1);
  const report = [
    `# Terrain report: ${boxName}`,
    '',
    `Generated by \`tools/geo-terrain.mjs\` from ${tiles.join(', ')}.`,
    '',
    '| Item | Value |',
    '|---|---|',
    `| Grid | ${w} x ${h} cells of ${CELL} m, origin (${x0}, ${z0}) |`,
    `| Elevation range (quantised) | ${minH} to ${maxH} m NAVD88 |`,
    `| Quantisation step | ${(scale * 100).toFixed(3)} cm |`,
    `| Water level (mode of hydro-flattened surface) | ${waterLevel.toFixed(2)} m, ${waterCells} cells (${((100 * waterCells) / q.length).toFixed(1)}%) |`,
    `| Cells without DEM coverage (set to water level) | ${missing} |`,
    `| File | data/terrain-${boxName}.bin, ${(fs.statSync(out).size / 1e6).toFixed(2)} MB |`,
    `| Street links measured | ${grades.length}; max 15 m-window grade > 10%: ${share(0.1)}%, > 15%: ${share(0.15)}%, > 20%: ${share(0.2)}%, > 25%: ${share(0.25)}% |`,
    '',
    '## Steepest 10 street links (max grade over a 15 m window)',
    '',
    '| Street | From | To | Grade |',
    '|---|---|---|---|',
    ...grades.slice(0, 10).map((g) => `| ${g.name} | ${g.from} | ${g.to} | ${(g.grade * 100).toFixed(1)}% |`),
    ''
  ].join('\n');
  fs.mkdirSync(path.join(ROOT, 'docs/reports'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, `docs/reports/terrain-${boxName}.md`), report);
  log(`terrain ${boxName}: ${w}x${h} @ ${CELL} m, ${minH}..${maxH} m, water ${waterLevel} m, ${(fs.statSync(out).size / 1e6).toFixed(2)} MB`);
  return header;
}

// Binary container shared by the pipeline outputs: "SFB1", uint32 header bytes, JSON header (padded to 4), payload
export function writeBin(file, header, typed) {
  const json = Buffer.from(JSON.stringify(header));
  const pad = (4 - (json.length % 4)) % 4;
  const head = Buffer.alloc(8);
  head.write('SFB1', 0, 'ascii');
  head.writeUInt32LE(json.length + pad, 4);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([head, json, Buffer.alloc(pad, 0x20), Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength)]));
}
export function readBin(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString('ascii', 0, 4) !== 'SFB1') throw new Error(`${file}: not an SFB1 file`);
  const n = buf.readUInt32LE(4);
  const header = JSON.parse(buf.toString('utf8', 8, 8 + n));
  return { header, payload: buf.subarray(8 + n) };
}

if (import.meta.url === `file://${process.argv[1]}`) await bakeTerrain(process.argv[2] || 'slice');
