import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, toWorld, fromWorld } from '../tools/geo-base.mjs';
import { readBin } from '../tools/geo-terrain.mjs';
import { orientedBox, splitBoxes, encodeRLE, coastRows } from '../tools/geo-region.mjs';
const M=JSON.parse(fs.readFileSync(path.join(ROOT,'data/region/manifest.json')));

test('region assets are bounded, complete and below 50 MB; the whole-city snapshot is represented',()=>{
 assert.equal(M.buildings.stats.input,177023);
 assert.ok(M.buildings.stats.buildings>150000);
 assert.ok(M.trees.counts.inventory>100000);
 assert.equal(M.city.step,8);assert.equal(M.horizon.step,32);
 assert.equal(M.city.missing,0);assert.equal(M.horizon.missing,0);
 for(const f of [...M.city.files,...M.horizon.files,...M.buildings.files,M.mask,M.trees,M.roads]){
  assert.ok(fs.statSync(path.join(ROOT,f.url)).size<50e6,f.url);
  assert.ok(readBin(path.join(ROOT,f.url)).header.version===1);
 }
});

test('region terrain has continuous tile edges and real SF, Marin and East Bay elevations',()=>{
 for(const tier of [M.city,M.horizon]){
  const tiles=new Map();
  for(const f of tier.files){const {header:h,payload}=readBin(path.join(ROOT,f.url));const q=new Uint16Array(payload.buffer,payload.byteOffset,payload.byteLength/2);tiles.set(`${h.originX},${h.originZ}`,{h,q});}
  for(const {h,q}of tiles.values()){
   const right=tiles.get(`${h.originX+tier.size},${h.originZ}`),below=tiles.get(`${h.originX},${h.originZ+tier.size}`);
   if(right)for(let j=0;j<h.h;j++)assert.equal(q[j*h.w+h.w-1],right.q[j*h.w]);
   if(below)for(let i=0;i<h.w;i++)assert.equal(q[(h.h-1)*h.w+i],below.q[i]);
  }
 }
 // Approximate test viewpoints, not new rendered geographic features.
 for(const [lon,lat,min,max] of [[-122.4477,37.7544,250,300],[-122.499,37.828,200,300],[-122.432,37.861,100,250],[-122.19,37.84,100,600]]){
  const [x,z]=toWorld(lon,lat),tier=lon< -122.35&&lat<37.84?M.city:M.horizon;
  const f=tier.files.find(f=>x>=f.x&&x<=f.x+tier.size&&z>=f.z&&z<=f.z+tier.size);assert.ok(f,'terrain tile at viewpoint');
  const {header:h,payload}=readBin(path.join(ROOT,f.url)),q=new Uint16Array(payload.buffer,payload.byteOffset,payload.byteLength/2);
  const y=h.minH+q[Math.round((z-h.originZ)/h.cell)*h.w+Math.round((x-h.originX)/h.cell)]*h.scale;
  assert.ok(y>min&&y<max,`${lon},${lat}: ${y}`);
 }
});

test('quantized region building boxes avoid the detailed core and retain finite base and roof heights',()=>{
 const c=M.buildings.exclusion;let count=0;
 for(const f of M.buildings.files){const {header:h,payload}=readBin(path.join(ROOT,f.url)),q=new Int32Array(payload.buffer,payload.byteOffset,payload.byteLength/4);assert.equal(q.length,h.count*7);
  for(let k=0;k<q.length;k+=7){const x=h.originX+q[k]*.1,z=h.originZ+q[k+1]*.1,w=q[k+4]*.1,d=q[k+5]*.1,a=q[k+6]*.0001,ex=(Math.abs(Math.cos(a))*w+Math.abs(Math.sin(a))*d)/2,ez=(Math.abs(Math.sin(a))*w+Math.abs(Math.cos(a))*d)/2;
   assert.ok(w>0&&d>0&&q[k+3]>q[k+2]);assert.ok(x+ex<c.x0+.2||x-ex>c.x1-.2||z+ez<c.z0+.2||z-ez>c.z1-.2);count++;
  }
 }
 assert.equal(count,M.buildings.stats.boxes);
});

test('region mask run lengths fill the declared grid exactly and only use known classes',()=>{
 const {header:h,payload}=readBin(path.join(ROOT,M.mask.url)),runs=new Uint32Array(payload.buffer,payload.byteOffset,payload.byteLength/4);let total=0;const counts=new Array(h.classes.length).fill(0);
 for(const r of runs){const n=r>>>8,v=r&255;assert.ok(n>0&&v<h.classes.length);total+=n;counts[v]+=n;}
 assert.equal(total,h.w*h.h);assert.deepEqual(counts,h.counts);assert.ok(counts[5]>0&&counts[3]>0&&counts[1]>0);
 const encoded=encodeRLE(new Uint8Array([0,0,2,2,2,8]));assert.deepEqual([...encoded],[512,770,264]);
});

test('minimum rectangles rotate with footprints and split a concave L into two tighter boxes',()=>{
 const ring=[[0,0],[12,0],[12,3],[3,3],[3,12],[0,12]];assert.equal(splitBoxes(ring).length,2);
 assert.ok(splitBoxes(ring).reduce((n,b)=>n+b.area,0)<orientedBox(ring).area*.6);
 const a=.42,rotated=ring.map(([x,z])=>[100+x*Math.cos(a)-z*Math.sin(a),200+x*Math.sin(a)+z*Math.cos(a)]);
 assert.ok(Math.abs(orientedBox(rotated).area-144)<1e-6);
});

test('horizon bay water is normalized even when the source DEM has a positive tidal elevation',()=>{
 const [x,z]=[8491,-414];
 const f=M.horizon.files.find(f=>x>=f.x&&x<f.x+4000&&z>=f.z&&z<f.z+4000);
 if(!f)return; // All-water tiles are intentionally omitted.
 const {header:h,payload}=readBin(path.join(ROOT,f.url)),q=new Uint16Array(payload.buffer,payload.byteOffset,payload.byteLength/2);
 const y=h.minH+q[Math.round((z-h.originZ)/h.cell)*h.w+Math.round((x-h.originX)/h.cell)]*h.scale;
 assert.ok(Math.abs(y-M.waterLevel)<.051,`Oakland ferry channel must be water, got ${y}`);
 assert.ok(M.cargo.length>0,'water-tested cargo anchorage scenery');
});


test('directed coastlines preserve low mainland and separate an island from surrounding water',()=>{
 const way=points=>({tags:{natural:'coastline'},geometry:points.map(p=>{const [lon,lat]=fromWorld(...p);return {lon,lat};})});
 // Southbound shore has mainland to the east. Clockwise world-x/z island has land to its left.
 const coast=way([[35,-20],[35,40]]),island=way([[5,0],[5,20],[25,20],[25,0],[5,0]]);
 const mask=coastRows([coast,island],0,10,10,5,1);
 assert.deepEqual([...mask],[0,1,1,0,1]);
});


test('regional street paint uses finite mapped centreline segments',()=>{
 const {header:h,payload}=readBin(path.join(ROOT,M.roads.url));
 const q=new Float32Array(payload.buffer,payload.byteOffset,payload.byteLength/4);
 assert.equal(q.length,h.count*4);assert.ok(h.count>10000);
 for(let i=0;i<q.length;i+=4){assert.ok(Number.isFinite(q[i]+q[i+1]+q[i+2]+q[i+3]));assert.ok(Math.hypot(q[i+2]-q[i],q[i+3]-q[i+1])>0);}
});
