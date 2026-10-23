// Phase 6 offline region: measured terrain, footprint boxes, land cover and trees.
// Run after fetch-geodata --box city and fetch-horizon: node --max-old-space-size=8192 tools/geo-region.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fromFile } from 'geotiff';
import proj4 from 'proj4';
import { ROOT, RAW, boxWorld, fromWorld, toWorld, datasf, worldPolygons, worldLines, ringArea, bbox, Raster, pointInRing } from './geo-base.mjs';
import { readBin, writeBin } from './geo-terrain.mjs';

export const CLASSES = ['urban', 'asphalt', 'park', 'sand', 'rock', 'forest', 'cemetery', 'industrial', 'water'];
const OUT = path.join(ROOT, 'data/region');
const log = (...v) => console.log('[region]', ...v);
const num = v => v === null || v === undefined || v === '' ? NaN : Number(v);
const round = v => Math.round(v * 10) / 10;

// Smallest rectangle over every outline edge orientation; world yaw follows Three.js' +y convention.
export function orientedBox(ring) {
  let best;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    if (len < 0.01) continue;
    const cs = dx / len, sn = -dz / len;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of ring) { const u = x * cs - z * sn, v = x * sn + z * cs; x0 = Math.min(x0, u); x1 = Math.max(x1, u); z0 = Math.min(z0, v); z1 = Math.max(z1, v); }
    const area = (x1 - x0) * (z1 - z0);
    if (!best || area < best.area) { const u = (x0 + x1) / 2, v = (z0 + z1) / 2; best = { x: u * cs + v * sn, z: -u * sn + v * cs, w: x1 - x0, d: z1 - z0, theta: Math.atan2(sn, cs), area, cs, sn }; }
  }
  return best;
}
export function splitBoxes(ring) {
  const whole = orientedBox(ring);
  if (!whole || whole.area < 1 || Math.abs(ringArea(ring)) / whole.area >= 0.75) return whole ? [whole] : [];
  const local = ring.map(([x, z]) => [(x - whole.x) * whole.cs - (z - whole.z) * whole.sn, (x - whole.x) * whole.sn + (z - whole.z) * whole.cs]);
  let best = [whole], area = whole.area;
  const clip = (axis, cut, side) => {
    const out = [];
    for (let i = 0; i < local.length; i++) {
      const a = local[i], b = local[(i + 1) % local.length], ka = (a[axis] - cut) * side >= 0, kb = (b[axis] - cut) * side >= 0;
      if (ka) out.push(a);
      if (ka !== kb) { const t = (cut - a[axis]) / (b[axis] - a[axis]); out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); }
    }
    // Remove collinear backtracking left by a cut exactly along an L's inside edge.
    // Such zero-area tails must not inflate the rectangle of the remaining polygon.
    let changed = true;
    while (changed && out.length > 3) {
      changed = false;
      for (let i = 0; i < out.length; i++) {
        const a=out[(i+out.length-1)%out.length],b=out[i],c=out[(i+1)%out.length];
        if (Math.abs((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]))<1e-7) { out.splice(i,1);changed=true;break; }
      }
    }
    return out.map(([u, v]) => [whole.x + u * whole.cs + v * whole.sn, whole.z - u * whole.sn + v * whole.cs]);
  };
  for (const axis of [0, 1]) for (const cut of [...new Set(local.map(p => round(p[axis])))]) {
    const parts = [-1, 1].map(side => clip(axis, cut, side));
    if (parts.some(p => p.length < 3 || Math.abs(ringArea(p)) < 3)) continue;
    const boxes = parts.map(orientedBox), sum = boxes[0].area + boxes[1].area;
    if (sum < area * 0.98) { area = sum; best = boxes; }
  }
  return best;
}

export function encodeRLE(values) {
  const runs = [];
  for (let i = 0; i < values.length;) { const value = values[i]; let count = 1; while (i + count < values.length && values[i + count] === value && count < 0xffffff) count++; runs.push((count << 8) | value); i += count; }
  return new Uint32Array(runs);
}

async function sourceTiles() {
  const tiles = [];
  const farFile = 'horizon/USGS_13_n38w123_20250826.tif';
  const farTiff = await fromFile(path.join(RAW, farFile));
  const farImage = await farTiff.getImage();
  const B = boxWorld('horizon');
  const nw = fromWorld(B.x0 - 5000, B.z0 - 5000), se = fromWorld(B.x1 + 5000, B.z1 + 5000);
  const [ox, oy] = farImage.getOrigin(), [rx, ry] = farImage.getResolution();
  const c0 = Math.max(0, Math.floor((nw[0] - ox) / rx)), c1 = Math.min(farImage.getWidth(), Math.ceil((se[0] - ox) / rx));
  const r0 = Math.max(0, Math.floor((nw[1] - oy) / ry)), r1 = Math.min(farImage.getHeight(), Math.ceil((se[1] - oy) / ry));
  const width = Math.ceil((c1 - c0) / 2), height = Math.ceil((r1 - r0) / 2);
  const [data] = await farImage.readRasters({ window: [c0, r0, c1, r1], width, height, resampleMethod: 'bilinear' });
  tiles.push({ source: farFile, ox: ox + c0 * rx, oy: oy + r0 * ry, rx: rx * (c1 - c0) / width, ry: ry * (r1 - r0) / height, width, height, data, geographic: true, nodata: Number(farImage.getGDALNoData()) });
  await farTiff.close();
  for (const name of fs.readdirSync(path.join(RAW, 'dem')).filter(f => /SanFrancisco_B23.*\.tif$/.test(f)).sort()) {
    const tiff = await fromFile(path.join(RAW, 'dem', name)), base = await tiff.getImage(), img = await tiff.getImage(3);
    const [ox, oy] = base.getOrigin(), [rx, ry] = base.getResolution();
    const width = img.getWidth(), height = img.getHeight(), [data] = await img.readRasters();
    tiles.push({ source: 'dem/' + name, ox, oy, rx: rx * base.getWidth() / width, ry: ry * base.getHeight() / height, width, height, data, nodata: Number(base.getGDALNoData()) });
    await tiff.close();
  }
  return tiles;
}
function sampleTile(t, a, b) {
  const fc = (a - t.ox) / t.rx - 0.5, fr = (b - t.oy) / t.ry - 0.5, c = Math.floor(fc), r = Math.floor(fr);
  if (c < 0 || r < 0 || c + 1 >= t.width || r + 1 >= t.height) return NaN;
  const k = r * t.width + c, vs = [t.data[k], t.data[k + 1], t.data[k + t.width], t.data[k + t.width + 1]];
  if (vs.some(v => !Number.isFinite(v) || v === t.nodata || v < -1000)) return NaN;
  const x = fc - c, y = fr - r;
  return (vs[0] * (1 - x) + vs[1] * x) * (1 - y) + (vs[2] * (1 - x) + vs[3] * x) * y;
}
function gridAt(g, x, z) {
  const u = Math.max(0, Math.min(g.w - 1, (x - g.x0) / g.step)), v = Math.max(0, Math.min(g.h - 1, (z - g.z0) / g.step));
  const i = Math.min(g.w - 2, Math.floor(u)), j = Math.min(g.h - 2, Math.floor(v)), a = u - i, b = v - j, k = j * g.w + i;
  return (g.values[k] * (1 - a) + g.values[k + 1] * a) * (1 - b) + (g.values[k + g.w] * (1 - a) + g.values[k + g.w + 1] * a) * b;
}
// OSM coastline ways have land on their left. In our south-positive frame a southbound
// crossing has land to its east. Scanline classification also preserves islands and low coastal land.
export function coastRows(elements, x0, z0, step, w, h) {
  const rows = Array.from({length:h},()=>[]);
  for (const e of elements) {
    if (e.tags?.natural !== 'coastline' || !e.geometry) continue;
    const points=e.geometry.map(p=>toWorld(p.lon,p.lat));
    for(let k=1;k<points.length;k++){
      const [ax,az]=points[k-1],[bx,bz]=points[k]; if(az===bz)continue;
      const j0=Math.max(0,Math.ceil((Math.min(az,bz)-z0)/step)),j1=Math.min(h-1,Math.ceil((Math.max(az,bz)-z0)/step)-1);
      for(let j=j0;j<=j1;j++)rows[j].push([ax+(z0+j*step-az)*(bx-ax)/(bz-az),bz>az]);
    }
  }
  const land=new Uint8Array(w*h);
  for(let j=0;j<h;j++){
    const crosses=rows[j].sort((a,b)=>a[0]-b[0]);let n=0,onLand=crosses.length?!crosses[0][1]:false;
    for(let i=0;i<w;i++){const x=x0+i*step;while(n<crosses.length&&crosses[n][0]<=x)onLand=crosses[n++][1];land[j*w+i]=onLand?1:0;}
  }
  return land;
}

async function terrainGrid(name, step, size, tiles, water) {
  const B = boxWorld(name), x0 = Math.floor(B.x0 / size) * size, z0 = Math.floor(B.z0 / size) * size;
  const x1 = Math.ceil(B.x1 / size) * size, z1 = Math.ceil(B.z1 / size) * size, w = Math.round((x1 - x0) / step) + 1, h = Math.round((z1 - z0) / step) + 1;
  const values = new Float32Array(w * h), utm = proj4('WGS84', '+proj=utm +zone=10 +ellps=GRS80 +units=m +no_defs');
  const coast=JSON.parse(fs.readFileSync(path.join(RAW,'osm/coast-horizon.json'))).elements;
  const land=coastRows(coast,x0,z0,step,w,h);
  let missing = 0;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const ll = fromWorld(x0 + i * step, z0 + j * step), en = utm.forward(ll);
    let y = sampleTile(tiles[0], ...ll);
    if (name === 'city') for (const t of tiles.slice(1)) { const v = sampleTile(t, ...en); if (Number.isFinite(v)) { y = v; break; } }
    if (!Number.isFinite(y)) { missing++; y = water; }
    values[j * w + i] = land[j * w + i] ? y : water;
  }
  const grid = { x0, z0, x1, z1, w, h, step, values }, files = [], n = size / step;
  for (let j = 0; j < h - 1; j += n) for (let i = 0; i < w - 1; i += n) {
    const q = new Uint16Array((n + 1) * (n + 1)); let land = false;
    for (let b = 0; b <= n; b++) for (let a = 0; a <= n; a++) { const y = values[(j + b) * w + i + a]; q[b * (n + 1) + a] = Math.round((y + 100) * 20); if (y > water + 0.05) land = true; }
    if (!land) continue;
    const url = `data/region/${name}-${(x0 + i * step) / size}-${(z0 + j * step) / size}.bin`;
    const header = { format: 'sf-terrain', version: 1, tier: name, originX: x0 + i * step, originZ: z0 + j * step, cell: step, w: n + 1, h: n + 1, minH: -100, scale: 0.05, waterLevel: water, datum: 'NAVD88 m' };
    writeBin(path.join(ROOT, url), header, q); files.push({ url, x: header.originX, z: header.originZ });
  }
  log(name, `${w}x${h} @ ${step}m`, files.length, 'land tiles', missing, 'missing samples');
  return { grid, manifest: { x0, z0, x1, z1, w, h, step, size, files, missing, source: tiles.filter(t => name === 'city' || t.geographic).map(t => t.source) } };
}

function osmRings(e) {
  const lines = e.type === 'way' ? [e.geometry] : (e.members || []).filter(m => m.type === 'way' && m.role !== 'inner').map(m => m.geometry);
  const work = lines.filter(Boolean).map(l => l.map(p => [p.lon, p.lat])), out = [];
  const same = (a, b) => a[0] === b[0] && a[1] === b[1];
  while (work.length) {
    let line = work.pop();
    while (!same(line[0], line.at(-1))) {
      const i = work.findIndex(l => same(l[0], line.at(-1)) || same(l.at(-1), line.at(-1)));
      if (i < 0) break;
      const next = work.splice(i, 1)[0]; if (!same(next[0], line.at(-1))) next.reverse(); line.push(...next.slice(1));
    }
    if (line.length > 3 && same(line[0], line.at(-1))) out.push(line.map(p => toWorld(...p)));
  }
  return out;
}
function curbWidthSampler() {
  const cells=new Map(),cell=64;
  for(const f of datasf('curbs','city'))for(const line of worldLines(f.geometry))for(let i=1;i<line.length;i++){
    const a=line[i-1],b=line[i];
    for(let x=Math.floor(Math.min(a[0],b[0])/cell);x<=Math.floor(Math.max(a[0],b[0])/cell);x++)for(let z=Math.floor(Math.min(a[1],b[1])/cell);z<=Math.floor(Math.max(a[1],b[1])/cell);z++){
      const key=x+','+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push([a,b]);
    }
  }
  return (x,z,dx,dz)=>{
    const nx=-dz,nz=dx;let left=Infinity,right=Infinity;
    for(let ix=Math.floor((x-30)/cell);ix<=Math.floor((x+30)/cell);ix++)for(let iz=Math.floor((z-30)/cell);iz<=Math.floor((z+30)/cell);iz++)for(const [a,b]of cells.get(ix+','+iz)||[]){
      const sx=b[0]-a[0],sz=b[1]-a[1],det=nx*sz-nz*sx;if(Math.abs(det)<1e-8)continue;
      const ax=a[0]-x,az=a[1]-z,t=(ax*sz-az*sx)/det,u=(ax*nz-az*nx)/det;
      if(u<0||u>1||Math.abs(t)>30)continue;if(t>0)left=Math.min(left,t);else right=Math.min(right,-t);
    }
    const width=left+right;return Number.isFinite(width)&&width>=3&&width<=60?width:null;
  };
}

function groundMask(grid) {
  const R = new Raster(grid.x0, grid.z0, grid.x1 - 4, grid.z1 - 4, 4), classes = Object.fromEntries(CLASSES.map((n, i) => [n, i]));
  for (const f of datasf('landuse', 'city')) if (Number(f.properties.pdr) > 0) for (const rings of worldPolygons(f.geometry)) R.fillRing(rings[0], classes.industrial);
  for (const f of datasf('parks', 'city')) for (const rings of worldPolygons(f.geometry)) { R.fillRing(rings[0], classes.park); for (const hole of rings.slice(1)) R.fillRing(hole, classes.urban); }
  const elements = JSON.parse(fs.readFileSync(path.join(RAW, 'osm/landuse-city.json'))).elements;
  for (const e of elements) {
    const t = e.tags || {}; let kind;
    if (/forest/.test(t.landuse) || t.natural === 'wood') kind = 'forest';
    else if (/beach|sand/.test(t.natural)) kind = 'sand';
    else if (t.landuse === 'cemetery') kind = 'cemetery';
    else if (t.natural === 'water' || t.water) kind = 'water';
    else if (/park|garden|golf_course/.test(t.leisure)) kind = 'park';
    if (kind) for (const ring of osmRings(e)) R.fillRing(ring, classes[kind]);
  }
  const coreRoads = new Map();
  const context = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/sf-geodata.js'), 'utf8'), context);
  const rg = context.window.NYC.GEO.roadGraph;
  for (const l of rg.links) { const name = rg.names[l[2]]; if (!coreRoads.has(name)) coreRoads.set(name, []); coreRoads.get(name).push(l[3]); }
  for (const widths of coreRoads.values()) widths.sort((a,b) => a-b);
  const measuredWidth=curbWidthSampler();
  let fallbackWidths = 0, measuredSegments = 0;
  const roadLines = [];
  for (const f of datasf('streets', 'city')) {
    const p = f.properties;
    if (/PAPER|PSEUDO/.test(p.layer || '') || /TUNL/.test(p.streetname || '')) continue;
    const known = coreRoads.get(p.streetname);
    // Outside the measured core, class-based widths are explicitly estimated; no fictitious curb measurements.
    const fallback = known ? known[Math.floor(known.length / 2)] : Number(p.classcode) === 1 ? 24 : /ALY/.test(p.streetname) ? 5 : Number(p.classcode) <= 3 && Number(p.classcode) > 0 ? 18 : 10;
    for (const line of worldLines(f.geometry)) for (let i = 1; i < line.length; i++) {
      const [ax, az] = line[i-1], [bx, bz] = line[i], L = Math.hypot(bx-ax,bz-az); if (!L) continue;
      const measured=measuredWidth((ax+bx)/2,(az+bz)/2,(bx-ax)/L,(bz-az)/L);
      const width=measured??fallback;if(measured===null)fallbackWidths++;else measuredSegments++;
      if (L >= 0.2 && width >= 7 && width <= 25 && !/FWY|RAMP/.test(p.streetname || '')) roadLines.push(round(ax), round(az), round(bx), round(bz));
      const rx = -(bz-az)/L * width/2, rz = (bx-ax)/L * width/2;
      R.fillRing([[ax+rx,az+rz],[bx+rx,bz+rz],[bx-rx,bz-rz],[ax-rx,az-rz]], classes.asphalt);
    }
  }
  const counts = new Array(CLASSES.length).fill(0);
  for (let j = 0; j < R.h; j++) for (let i = 0; i < R.w; i++) {
    const x = R.x0 + (i + 0.5)*4, z = R.z0 + (j+0.5)*4, k = j*R.w+i, y = gridAt(grid,x,z);
    if (y <= -0.9) R.d[k] = classes.water;
    else if (R.d[k] === classes.urban && Math.hypot(gridAt(grid,x+8,z)-gridAt(grid,x-8,z),gridAt(grid,x,z+8)-gridAt(grid,x,z-8))/16 > 1) R.d[k] = classes.rock;
    counts[R.d[k]]++;
  }
  const header = { format: 'sf-region-mask', version:1, cell:4, originX:R.x0, originZ:R.z0, w:R.w, h:R.h, classes:CLASSES, encoding:'rle-u32', counts, fallbackWidths, measuredSegments };
  writeBin(path.join(OUT,'groundmask.bin'),header,encodeRLE(R.d));
  log('mask',counts,'estimated road widths',fallbackWidths);
  const roads = {url:'data/region/roads.bin', count:roadLines.length/4};
  writeBin(path.join(ROOT,roads.url),{format:'sf-region-roads',version:1,count:roads.count,fields:['ax','az','bx','bz'],notes:'DataSF centreline geometry; dashed paint is a visual estimate.'},new Float32Array(roadLines));
  return { roads, raster:R, manifest:{url:'data/region/groundmask.bin',...header} };
}
function buildingData(core, landmarkSites) {
  const groups = new Map(), stats = { input:0, core:0, landmark:0, missingHeight:0, small:0, buildings:0, boxes:0, split:0 };
  const exclusion = { x0:core.x0-60,x1:core.x1+60,z0:core.z0-60,z1:core.z1+60 };
  const overlap = b => b.x1 >= exclusion.x0 && b.x0 <= exclusion.x1 && b.z1 >= exclusion.z0 && b.z0 <= exclusion.z1;
  const sites = Object.values(landmarkSites).filter(s => s.slug && s.ring?.length > 5).map(s => { const ring=[];for(let k=0;k<s.ring.length;k+=2)ring.push([s.ring[k],s.ring[k+1]]);return {ring,b:bbox(ring)}; });
  for (const f of datasf('buildings','city')) {
    stats.input++; const base=num(f.properties.gnd_min_m),roof=num(f.properties.median_1st_m);
    if (!Number.isFinite(base) || !Number.isFinite(roof)) { stats.missingHeight++;continue; }
    let included=false;
    for(const rings of worldPolygons(f.geometry)) {
      const ring=rings[0], b=bbox(ring); if(overlap(b)){stats.core++;continue;}
      if(Math.abs(ringArea(ring))<6 || roof-base<2.5){stats.small++;continue;}
      const cx=(b.x0+b.x1)/2,cz=(b.z0+b.z1)/2;
      if(sites.some(s=>cx>=s.b.x0&&cx<=s.b.x1&&cz>=s.b.z0&&cz<=s.b.z1&&pointInRing(cx,cz,s.ring))){stats.landmark++;continue;}
      const boxes=splitBoxes(ring);if(boxes.length>1)stats.split++;
      for(const box of boxes){
        // Boxes whose approximation protrudes into the core are excluded too.
        const ex=(Math.abs(box.cs)*box.w+Math.abs(box.sn)*box.d)/2,ez=(Math.abs(box.sn)*box.w+Math.abs(box.cs)*box.d)/2;
        if(overlap({x0:box.x-ex,x1:box.x+ex,z0:box.z-ez,z1:box.z+ez}))continue;
        const ix=Math.floor(box.x/1200),iz=Math.floor(box.z/1200),key=ix+','+iz;
        if(!groups.has(key))groups.set(key,[]);
        groups.get(key).push([Math.round((box.x-ix*1200)*10),Math.round((box.z-iz*1200)*10),Math.round(base*10),Math.round(roof*10),Math.round(box.w*10),Math.round(box.d*10),Math.round(box.theta*10000)]);
        stats.boxes++;included=true;
      }
    }
    if(included)stats.buildings++;
  }
  const files=[];
  for(const [key,records] of [...groups].sort(([a],[b])=>a.localeCompare(b))){const [ix,iz]=key.split(',').map(Number),url=`data/region/buildings-${ix}-${iz}.bin`;writeBin(path.join(ROOT,url),{format:'sf-region-buildings',version:1,count:records.length,originX:ix*1200,originZ:iz*1200,fields:['x','z','base','roof','width','depth','yaw'],scale:[0.1,0.1,0.1,0.1,0.1,0.1,0.0001]},new Int32Array(records.flat()));files.push({url,count:records.length});}
  log('buildings',stats);return {files,stats,exclusion};
}
function treeData(grid,mask,core){
  const records=[],count={inventory:0,forest:0,park:0},hash=(i)=>{let n=Math.imul(i^0x9e3779b9,0x85ebca6b);n^=n>>>13;return (n>>>0)/4294967296;};
  const excluded=(x,z)=>x>=core.x0-60&&x<=core.x1+60&&z>=core.z0-60&&z<=core.z1+60;
  for(const f of datasf('trees','city')){
    if(f.properties.planttype && f.properties.planttype !== 'Tree')continue;
    const [x,z]=toWorld(...f.geometry.coordinates);if(excluded(x,z))continue;
    const y=gridAt(grid,x,z);if(y<=0)continue;
    // Size is visual: inventory DBH influences it; no measured tree-height claim.
    const dbh=num(f.properties.mapdbh),height=Number.isFinite(dbh)?Math.max(4,Math.min(18,4+dbh*0.23)):8;
    records.push(round(x),round(y),round(z),round(height));count.inventory++;
  }
  for(let z=grid.z0+16;z<grid.z1;z+=32)for(let x=grid.x0+16;x<grid.x1;x+=32){
    const k=Math.floor((z-mask.z0)/4)*mask.w+Math.floor((x-mask.x0)/4),type=mask.d[k];
    if(type!==5 && type!==2)continue;
    const r=hash(k);if(type===2&&r>0.12)continue;
    const px=x+(r-0.5)*22,pz=z+(hash(k+1)-0.5)*22;if(excluded(px,pz))continue;
    const y=gridAt(grid,px,pz);if(y<=0)continue;
    records.push(round(px),round(y),round(pz),round(type===5?12+r*10:7+r*5));count[type===5?'forest':'park']++;
  }
  const url='data/region/trees.bin';writeBin(path.join(ROOT,url),{format:'sf-region-trees',version:1,count:records.length/4,fields:['x','base','z','height'],counts:count,notes:'Tree heights and deterministic canopy density are visual estimates.'},new Float32Array(records));return {url,counts:count};
}
export async function buildRegion(){
  fs.mkdirSync(OUT,{recursive:true});
  const core=readBin(path.join(ROOT,'data/terrain-core.bin')).header;
  const ctx={window:{}};vm.runInNewContext(fs.readFileSync(path.join(ROOT,'js/sf-geodata.js'),'utf8'),ctx);const GEO=ctx.window.NYC.GEO;
  const tiles=await sourceTiles();const city=await terrainGrid('city',8,1000,tiles,core.waterLevel),far=await terrainGrid('horizon',32,4000,tiles,core.waterLevel);
  const mask=groundMask(city.grid),buildings=buildingData(GEO.box,GEO.landmarks),trees=treeData(city.grid,mask.raster,GEO.box);
  const ferryElements=JSON.parse(fs.readFileSync(path.join(RAW,'osm/ferries-horizon.json'))).elements;
  const ferries=ferryElements.filter(e=>[31772645,98771919,662437195,27989500].includes(e.id)).map(e=>({id:e.id,name:e.tags.name,pts:e.geometry.map(p=>toWorld(p.lon,p.lat).map(round)),speed:9}));
  const cargo=[];
  const oakland=ferries.find(f=>f.id===662437195);
  const cargoCandidates=[];
  for(let i=1;i<(oakland?.pts.length||0);i++){
    const a=oakland.pts[i-1],b=oakland.pts[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    for(let d=0;d<length;d+=200)cargoCandidates.push([round(a[0]+(b[0]-a[0])*d/length),round(a[1]+(b[1]-a[1])*d/length)]);
  }
  for(const p of cargoCandidates) {
    if(p[0]<6000 || cargo.some(c=>Math.hypot(c[0]-p[0],c[1]-p[1])<800))continue;
    if([[-200,-200],[-200,200],[200,-200],[200,200]].every(([dx,dz])=>gridAt(far.grid,p[0]+dx,p[1]+dz)<=core.waterLevel+.05))cargo.push(p);
    if(cargo.length===2)break;
  }
  const manifest={version:1,ferries,cargo,roads:mask.roads,waterLevel:core.waterLevel,city:city.manifest,horizon:far.manifest,mask:mask.manifest,buildings,trees,notes:['OSM directed coastlines classify sea and islands; USGS tidal surfaces are normalized to the core water datum without deleting low land.','Region road widths are measured between citywide curb segments; unmatched segments use core street-name medians, then class-based estimates.','Region buildings and trees are scenery; traffic remains in the detailed core.']};
  fs.writeFileSync(path.join(OUT,'manifest.json'),JSON.stringify(manifest,null,1)+'\n');
  const wanted=new Set(['manifest.json','groundmask.bin','trees.bin','roads.bin',...city.manifest.files.map(f=>path.basename(f.url)),...far.manifest.files.map(f=>path.basename(f.url)),...buildings.files.map(f=>path.basename(f.url))]);
  // Only this builder's obsolete generated tiles are removed.
  for(const file of fs.readdirSync(OUT))if(/^(city|horizon|buildings)-.*\.bin$/.test(file)&&!wanted.has(file))fs.unlinkSync(path.join(OUT,file));
  const bytes=[...wanted].map(f=>[f,fs.statSync(path.join(OUT,f)).size]);
  if(bytes.some(([,n])=>n>=50e6))throw Error('region asset exceeds 50 MB');
  fs.writeFileSync(path.join(ROOT,'docs/reports/region.md'),`# Phase 6 region data\n\nGenerated from citywide DataSF, OSM and USGS snapshots.\n\n- Buildings: ${JSON.stringify(buildings.stats)}\n- Trees: ${JSON.stringify(trees.counts)}\n- Terrain: ${city.manifest.files.length} city tiles at 8 m, ${far.manifest.files.length} horizon tiles at 32 m.\n- Assets: ${bytes.length}; ${(bytes.reduce((s,[,n])=>s+n,0)/1e6).toFixed(2)} MB; largest ${(Math.max(...bytes.map(([,n])=>n))/1e6).toFixed(2)} MB.\n\n${manifest.notes.map(n=>'- '+n).join('\n')}\n`);
  log('done',bytes.length,'files');return manifest;
}
if(process.argv[1]===new URL(import.meta.url).pathname)await buildRegion();
