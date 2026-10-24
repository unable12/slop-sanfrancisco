const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { buildLandmarksHeadless, stub } = require('./helpers/landmarks-build.cjs');
const { buildRideWorld } = require('./helpers/ride-world.cjs');

let fixture;
function build() {
  if (fixture) return fixture;
  const { NYC:N, context } = buildLandmarksHeadless();
  for (const f of ['road-network','world-collision','sf-sidewalk-scenes']) {
    vm.runInContext(fs.readFileSync(`js/${f}.js`,'utf8'),context);
  }
  const sidewalks = N.BLOCKS.map(b => ({...b,block:b}));
  const { colliders } = buildRideWorld(N.buildRoadNetwork(sidewalks,[]));
  N.Terrain.patchesEnabled = false;
  const network = N.buildRoadNetwork(sidewalks,colliders.filter(c=>!c.obb));
  // Preserve real prop positions while stubbing rendering, as in the landmark
  // fixture. Hydrant/meter placement reads the translation from these matrices.
  class Object3D {
    constructor() {
      this.position={set:(x,y,z)=>{this.xyz=[x,y,z];}};
      this.rotation=stub();this.scale=stub();
      this.matrix={clone:()=>({elements:[0,0,0,0,0,0,0,0,0,0,0,0,...this.xyz,1]})};
    }
    updateMatrix() {}
  }
  N.THREE.Object3D=Object3D;N.cityUniforms=stub();N.createTrafficSignalLensMaterial=stub;
  const renderer=N.buildSidewalkScenes;
  let furniture;
  N.buildSidewalkScenes=(parent,net,buildings,props)=>{
    furniture=props;
    return renderer(parent,net,buildings,props);
  };
  vm.runInContext(fs.readFileSync('js/sf-street-details.js','utf8'),context);
  const { sidewalkScenes:sites }=N.buildSFStreetDetails(stub(),network,colliders);
  return fixture={N,network,sites,colliders,furniture};
}

test('three small scenes fit the real core, buildings and existing street furniture',()=>{
  const {N,network,sites,colliders,furniture}=build();
  assert.deepEqual(Array.from(sites,s=>s.id),['market-sixth','mission-sixth','howard-fifth']);
  for(const s of sites) {
    const junction=network.nodes.find(n=>{
      const names=[...n.in,...n.out].map(e=>e.name);
      return names.includes(s.street)&&names.includes(s.cross);
    });
    assert.ok(Math.hypot(s.x-junction.x,s.z-junction.z)<150,s.id+' near its named junction');
    // Check independently on a denser, offset grid than the placement sampler.
    const near=colliders.concat(furniture).filter(c=>c.minX<s.x+12&&c.maxX>s.x-12&&c.minZ<s.z+12&&c.maxZ>s.z-12);
    for(let x=-2.95;x<3;x+=.25)for(let z=-.9;z<2.55;z+=.15) {
      const p=N.sidewalkScenePoint(s,x,z),y=N.Terrain.groundAt(p.x,p.z);
      assert.ok(network.onSidewalk(p.x,p.z),s.id+' remains on sidewalk');
      assert.ok(!near.some(c=>(c.maxY??Infinity)>y+.1&&(c.minY??-Infinity)<y+2&&N.WorldCollision.contact(N.WorldCollision.circleShape(p,.03),c)),s.id+' clears existing obstacles');
    }
  }
});

test('pedestrian paths avoid the scenes but retain the walking strip beside them',()=>{
  const {N,network,sites}=build();
  for(const s of sites) {
    const at=(x,z)=>{const p=N.sidewalkScenePoint(s,x,z);return network.walkable(p.x-.4,p.x+.4,p.z-.4,p.z+.4);};
    assert.equal(at(0,0),false,s.id+' occupied area');
    for(const x of [-2,0,2])assert.equal(at(x,1.75),true,s.id+' walking strip');
  }
});

test('a site without usable sidewalk is skipped rather than forced into the road',()=>{
  const {N,network,colliders,furniture}=build();
  assert.equal(N.planSidewalkScenes({...network,onSidewalk:()=>false},colliders,furniture).length,0);
});
