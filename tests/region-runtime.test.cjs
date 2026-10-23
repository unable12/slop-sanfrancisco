const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname,'..');
const source = fs.readFileSync(path.join(root,'js/region.js'),'utf8');
const helpers = source.slice(source.indexOf('function decodeRegionRLE'), source.indexOf('function buildSFRegion'));
function harness() {
  const patches=[];
  const context=vm.createContext({Uint8Array,Uint16Array,Uint32Array,Int32Array,Float32Array,Map,Promise,Error,Array,Math,
    window:{NYC:{}},Terrain:{addPatch:p=>patches.push(p)},fetch:async()=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,'data/region/manifest.json')))})});
  vm.runInContext(helpers,context);
  return {context,patches};
}
test('region loader reconstructs full terrain and limits concurrent asset requests',async()=>{
  const {context,patches}=harness();let active=0,peak=0;
  const data=await context.loadSFRegion(async url=>{
    active++;peak=Math.max(peak,active);await new Promise(r=>setImmediate(r));
    const b=fs.readFileSync(path.join(root,url));const n=b.readUInt32LE(4);
    active--;return {header:JSON.parse(b.toString('utf8',8,8+n)),buf:b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),offset:8+n};
  });
  assert.ok(peak<=8&&peak>1);assert.equal(data.mask.length,data.manifest.mask.w*data.manifest.mask.h);
  assert.equal(data.city.heights.length,data.city.w*data.city.h);
  assert.ok(data.city.heights.some(y=>y>270));assert.ok(data.horizon.heights.some(y=>y>500));
  context.installRegionTerrain(data);assert.equal(patches.length,2);assert.equal(patches[0].step,8);assert.equal(patches[1].step,32);
  assert.equal(context.window.NYC.FLIGHT_BOUNDS.minX,data.horizon.x0);
  assert.equal(context.window.NYC.FLIGHT_BOUNDS.maxZ,data.horizon.z1);
  assert.equal(data.buildings.reduce((n,b)=>n+b.header.count,0),data.manifest.buildings.stats.boxes);
});
test('region loader rejects corrupt mask lengths and unknown classes',()=>{
  const {context}=harness();
  for(const [runs,count]of[[[0],1],[[0x209],2],[[0x200],1],[[0x100],2]])assert.throws(()=>context.decodeRegionRLE(new Uint32Array(runs),count));
});
