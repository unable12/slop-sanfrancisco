const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const c={window:{NYC:{}}};
for(const file of ['sf-geodata','sf-places','city-config','terrain'])vm.runInNewContext(fs.readFileSync(`js/${file}.js`,'utf8'),c);
const N=c.window.NYC;
test('SF smoke: 41 polygon interiors, every destination, north-up frame and baked terrain',()=>{
  assert.equal(N.PLACE_DATA.neighborhoods.length,41);
  for(const p of N.PLACE_DATA.neighborhoods)assert.equal(N.neighborhoodAt(...p.label),p.name,`${p.name} label belongs to its polygon`);
  assert.equal(N.neighborhoodAt(100000,100000),null);
  for(const [key,p] of Object.entries(N.TELEPORT_LOCATIONS))assert.ok([p.x,p.z,p.heading].every(Number.isFinite),key);
  const bounds=JSON.parse(fs.readFileSync('data/region/manifest.json','utf8')).city;
  for(const p of N.NYC_LANDMARKS)assert.ok(p.x>=bounds.x0&&p.x<=bounds.x1&&p.z>=bounds.z0&&p.z<=bounds.z1,`${p.name} marker within map region`);
  const b=fs.readFileSync('data/terrain-core.bin'),n=b.readUInt32LE(4),h=JSON.parse(b.subarray(8,8+n));
  const bytes=b.buffer.slice(b.byteOffset+8+n,b.byteOffset+b.length);
  const T=N.Terrain.load(h,new Uint16Array(bytes,0,h.w*h.h));
  for(const p of Object.values(N.TELEPORT_LOCATIONS).filter(p=>!p.mode))assert.ok(Number.isFinite(T.groundAt(p.x,p.z)));
  assert.equal(N.GEO.frame.bearingDeg || 0,0); // SF uses geographic north, no inherited grid rotation.
});
