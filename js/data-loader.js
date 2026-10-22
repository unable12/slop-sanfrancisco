(function () {
// js/data-loader.js
// Fetches the pipeline's binary data (docs/formats.md) named in GEO.data before the city is built (main.js):
//   window.NYC.DATA.terrain   { header, q: Uint16Array }                  height field (tools/geo-terrain.mjs)
//   window.NYC.DATA.buildings { header, table: Float32Array, verts: Float32Array } footprints (tools/geo-buildings.mjs)

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
  const step = () => onProgress && onProgress(++done / 2);
  const [t, b] = await Promise.all([fetchBin(d.terrain.url, step), fetchBin(d.buildings.url, step)]);
  const DATA = {
    terrain: { header: t.header, q: new Uint16Array(t.buf, t.offset, t.header.w * t.header.h) },
    buildings: {
      header: b.header,
      table: new Float32Array(b.buf, b.offset, b.header.tableFloats),
      verts: new Float32Array(b.buf, b.offset + b.header.tableFloats * 4, b.header.vertexFloats)
    }
  };
  window.NYC.DATA = DATA;
  return DATA;
}

Object.assign(window.NYC, { loadCityData });
})();
