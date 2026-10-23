(function () {
// js/data-loader.js
// Fetches the pipeline's binary data (docs/formats.md) named in GEO.data before the city is built (main.js):
//   window.NYC.DATA.terrain   { header, q: Uint16Array }                  height field (tools/geo-terrain.mjs)
//   window.NYC.DATA.buildings { header, table, verts, masses: Float32Array }   footprints (tools/geo-buildings.mjs)
//   window.NYC.DATA.groundMask { header, mask: Uint8Array }                 ground classes, 1 m (tools/geo-groundmask.mjs)
//   window.NYC.DATA.region    Terrain patch of the interim 16 m ground outside the core (tools/geo-landmarks.mjs, P5-1)

const { GEO } = window.NYC;

async function fetchBin(url, onBytes) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  if (onBytes) onBytes(buf.byteLength);
  const magic = new TextDecoder().decode(new Uint8Array(buf, 0, 4));
  if (magic !== 'SFB1') throw new Error(`${url}: not an SFB1 file`);
  const n = new DataView(buf).getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, n)));
  return { header, buf, offset: 8 + n };
}

async function loadCityData(onProgress) {
  const d = GEO.data;
  let done = 0;
  const step = () => onProgress && onProgress(++done / 3);
  const [t, b, m, r] = await Promise.all([fetchBin(d.terrain.url, step), fetchBin(d.buildings.url, step), fetchBin(d.groundMask.url, step), d.region ? fetchBin(d.region.url) : null]);
  const DATA = {
    terrain: { header: t.header, q: new Uint16Array(t.buf, t.offset, t.header.w * t.header.h) },
    buildings: {
      header: b.header,
      table: new Float32Array(b.buf, b.offset, b.header.tableFloats),
      verts: new Float32Array(b.buf, b.offset + b.header.tableFloats * 4, b.header.vertexFloats),
      masses: new Float32Array(b.buf, b.offset + (b.header.tableFloats + b.header.vertexFloats) * 4, b.header.massFloats || 0)
    },
    groundMask: { header: m.header, mask: new Uint8Array(m.buf, m.offset, m.header.w * m.header.h) }
  };
  window.NYC.DATA = DATA;
  window.NYC.Terrain.load(DATA.terrain.header, DATA.terrain.q);
  if (r) {
    // the interim region ground (PLAN P5-1): heights outside the core's data
    const q = new Uint16Array(r.buf, r.offset, r.header.w * r.header.h);
    const h = new Float32Array(q.length);
    for (let k = 0; k < q.length; k++) h[k] = r.header.minH + q[k] * r.header.scale;
    DATA.region = window.NYC.Terrain.addPatch({ x0: r.header.originX, z0: r.header.originZ, step: r.header.cell, nx: r.header.w, nz: r.header.h, h, rect: true });
  }
  return DATA;
}

Object.assign(window.NYC, { loadCityData });
})();
