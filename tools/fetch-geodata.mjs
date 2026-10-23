// tools/fetch-geodata.mjs — downloads every raw input of the SF pipeline for a named box into data/raw/
// usage: node tools/fetch-geodata.mjs --box slice [--only datasf,osm,dem] [--osm coast,piers,...] [--force]
//        node tools/fetch-geodata.mjs --verify            re-hash every file in the manifest
// Sources (see docs/data-sources.md): DataSF (Socrata SoQL, paginated), OpenStreetMap (Overpass, via tools/overpass.sh),
// USGS 1 m DEM (TNM API). data/raw/MANIFEST.json records url, query hash, size, sha256, rows & license per file; a file
// whose query hash is unchanged is not fetched again.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const RAW = path.join(ROOT, 'data/raw');
const MANIFEST = path.join(RAW, 'MANIFEST.json');
const argv = process.argv.slice(2);
const opt = (name, def) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : def);
const FORCE = argv.includes('--force');
const log = (...a) => console.log('[fetch]', ...a);

const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : { files: {} };
const saveManifest = () => fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const hashOf = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);

if (argv.includes('--verify')) {
  let bad = 0;
  for (const [rel, m] of Object.entries(manifest.files)) {
    const f = path.join(RAW, rel);
    const ok = fs.existsSync(f) && sha256(f) === m.sha256;
    if (!ok) { bad++; log('MISMATCH', rel); }
  }
  log(bad ? `${bad} file(s) differ` : `all ${Object.keys(manifest.files).length} files verified`);
  process.exit(bad ? 1 : 0);
}

const BOXES = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/boxes.json'), 'utf8'));
const boxName = opt('box', 'slice');
const box = BOXES[boxName];
if (!box) throw new Error(`unknown box ${boxName}`);
const only = new Set((opt('only', 'datasf,osm,dem')).split(','));

// DataSF datasets: [id, short name, geometry column, extra where]
const DATASF = [
  ['ynuv-fyni', 'buildings', 'shape', ''],
  ['3psu-pn9h', 'streets', 'line', 'active=true'],
  ['emxt-b6yg', 'curbs', 'the_geom', ''],
  ['4g86-grxu', 'sidewalks', 'shape', ''],
  ['ybh5-27n2', 'signals', 'shape', ''],
  ['4542-gpa3', 'stops', 'shape', ''],
  ['tkzw-k3nq', 'trees', 'latlon', ''], // its `point` column is text: filter on latitude/longitude, build points here
  ['i28k-bkz6', 'muni-stops', 'shape', ''],
  ['9exe-acju', 'muni-routes', 'shape', ''],
  ['ygmz-vaxd', 'bikeways', 'shape', ''],
  ['c5ge-t6pj', 'landuse', 'the_geom', ''],
  ['gtr9-ntp6', 'parks', 'shape', ''],
  ['5kya-mfst', 'tall-buildings', 'polygon', '']
];
const OSM = opt('osm', 'coast,piers,landuse,landmarks,rail,roads-tags,peaks').split(','); // landmarks-named: --box landmarks only (P5.1)

function record(rel, entry) {
  const f = path.join(RAW, rel);
  manifest.files[rel] = { ...entry, retrievedAt: new Date().toISOString(), bytes: fs.statSync(f).size, sha256: sha256(f) };
  saveManifest();
}
const fresh = (rel, queryHash) => !FORCE && manifest.files[rel]?.queryHash === queryHash && fs.existsSync(path.join(RAW, rel));

async function getJSON(url, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'slop-sf-pipeline/0.1 (research build)' } });
      if (!r.ok) {
        const err = new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
        err.fatal = r.status >= 400 && r.status < 500 && r.status !== 429; // a bad query: retrying won't help
        throw err;
      }
      return await r.json();
    } catch (e) {
      if (e.fatal || i >= tries) throw e;
      log(`retry ${i} ${url.slice(0, 120)}: ${e.message}`);
      await new Promise((res) => setTimeout(res, 2000 * i));
    }
  }
}

async function fetchDataSF() {
  const dir = path.join(RAW, 'datasf');
  fs.mkdirSync(dir, { recursive: true });
  const PAGE = 50000;
  for (const [id, name, geom, extra] of DATASF) {
    const inBox = geom === 'latlon'
      ? `latitude between ${box.latS} and ${box.latN} AND longitude between ${box.lonW} and ${box.lonE}`
      : `intersects(${geom}, 'POLYGON((${box.lonW} ${box.latS}, ${box.lonE} ${box.latS}, ${box.lonE} ${box.latN}, ${box.lonW} ${box.latN}, ${box.lonW} ${box.latS}))')`; // intersects, not within_box: long lines (routes) cross the box edge
    const where = `${inBox}${extra ? ` AND ${extra}` : ''}`;
    const format = geom === 'latlon' ? 'json' : 'geojson';
    const rel = `datasf/${name}-${boxName}.geojson`;
    const queryHash = hashOf(`${id}|${where}`);
    if (fresh(rel, queryHash)) { log(`${rel} up to date`); continue; }
    const features = [];
    for (let offset = 0; ; offset += PAGE) {
      const q = new URLSearchParams({ $where: where, $order: ':id', $limit: String(PAGE), $offset: String(offset) });
      let page = await getJSON(`https://data.sf.gov/resource/${id}.${format}?${q}`);
      if (format === 'json') {
        page = { features: page.map(({ latitude, longitude, ...properties }) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [Number(longitude), Number(latitude)] }, properties })) };
      }
      if (!Array.isArray(page.features)) throw new Error(`${id}: no features array`);
      features.push(...page.features);
      if (page.features.length < PAGE) break;
    }
    // server-side count must agree with what we got (no silent truncation)
    const cq = new URLSearchParams({ $select: 'count(*) AS n', $where: where });
    const [{ n }] = await getJSON(`https://data.sf.gov/resource/${id}.json?${cq}`);
    if (Number(n) !== features.length) throw new Error(`${id}: got ${features.length} rows, server counts ${n}`);
    fs.writeFileSync(path.join(RAW, rel), JSON.stringify({ type: 'FeatureCollection', features }));
    record(rel, { source: `DataSF ${id}`, url: `https://data.sf.gov/resource/${id}.geojson`, where, queryHash, rows: features.length, license: 'PDDL / CC0 (see docs/data-sources.md)', box: boxName });
    log(`${rel}: ${features.length} rows`);
  }
}

function fetchOSM() {
  const dir = path.join(RAW, 'osm');
  fs.mkdirSync(dir, { recursive: true });
  const bbox = `${box.latS},${box.lonW},${box.latN},${box.lonE}`;
  for (const name of OSM) {
    const query = fs.readFileSync(path.join(ROOT, `tools/queries/${name}.overpassql`), 'utf8').replaceAll('{{bbox}}', bbox);
    const rel = `osm/${name}-${boxName}.json`;
    const queryHash = hashOf(query);
    if (fresh(rel, queryHash)) { log(`${rel} up to date`); continue; }
    const qfile = path.join(dir, `${name}-${boxName}.overpassql`);
    fs.writeFileSync(qfile, query);
    execFileSync('bash', [path.join(ROOT, 'tools/overpass.sh'), path.join(RAW, rel), qfile, '6'], { stdio: 'inherit' });
    const rows = JSON.parse(fs.readFileSync(path.join(RAW, rel), 'utf8')).elements.length;
    record(rel, { source: 'OpenStreetMap Overpass', url: 'https://overpass-api.de/api/interpreter', query, queryHash, rows, license: 'ODbL 1.0', box: boxName });
    log(`${rel}: ${rows} elements`);
  }
}

async function fetchDEM() {
  const dir = path.join(RAW, 'dem');
  fs.mkdirSync(dir, { recursive: true });
  const q = new URLSearchParams({ datasets: 'Digital Elevation Model (DEM) 1 meter', bbox: `${box.lonW},${box.latS},${box.lonE},${box.latN}`, max: '100' });
  const res = await getJSON(`https://tnmaccess.nationalmap.gov/api/v1/products?${q}`);
  const items = res.items.filter((it) => /CA_SanFrancisco_B23/.test(it.title) && /\.tif$/i.test(it.downloadURL));
  if (!items.length) throw new Error('no CA_SanFrancisco_B23 tiles for this box');
  for (const it of items) {
    const rel = `dem/${path.basename(new URL(it.downloadURL).pathname)}`;
    const queryHash = hashOf(it.downloadURL);
    if (fresh(rel, queryHash)) { log(`${rel} up to date`); continue; }
    log(`downloading ${rel} (${(it.sizeInBytes / 1e6).toFixed(1)} MB)`);
    const r = await fetch(it.downloadURL);
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${it.downloadURL}`);
    const tmp = path.join(RAW, `${rel}.tmp.part`);
    fs.writeFileSync(tmp, Buffer.from(await r.arrayBuffer()));
    if (it.sizeInBytes && Math.abs(fs.statSync(tmp).size - it.sizeInBytes) > 1024) throw new Error(`${rel}: size ${fs.statSync(tmp).size} != ${it.sizeInBytes}`);
    fs.renameSync(tmp, path.join(RAW, rel));
    record(rel, { source: `USGS TNM ${it.title}`, url: it.downloadURL, queryHash, publicationDate: it.publicationDate, license: 'USGS 3DEP (US government work; see docs/data-sources.md)', box: boxName });
  }
}

fs.mkdirSync(RAW, { recursive: true });
if (only.has('datasf')) await fetchDataSF();
if (only.has('osm')) fetchOSM();
if (only.has('dem')) await fetchDEM();
log('done');
