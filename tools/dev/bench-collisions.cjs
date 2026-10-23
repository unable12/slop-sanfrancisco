// Compare production collision work per 60 Hz frame against a committed baseline.
// Usage: node tools/dev/bench-collisions.cjs [baseline-ref]
const fs=require('node:fs'),vm=require('node:vm'),{execFileSync}=require('node:child_process');
const {loadTraffic}=require('../../tests/helpers/traffic-harness.cjs');
const {buildRideWorld}=require('../../tests/helpers/ride-world.cjs');
const {buildLandmarksHeadless,stub}=require('../../tests/helpers/landmarks-build.cjs');
const ref=process.argv[2]||'e17d6c8',h=loadTraffic({seed:3}),world=buildRideWorld(h.system.network);
const L=buildLandmarksHeadless();
vm.runInContext(execFileSync('git',['show',`${ref}:js/buildings.js`],{encoding:'utf8'}),L.context);
const oldCity=L.NYC.buildCityBlocks(stub(),{sf:true});
const oldColliders=[...L.landmarks.colliders,...L.bridges.colliders,...oldCity.colliders].flatMap(c=>c.parts||[c]).concat(world.grade.colliders);
const samples=[];
for(const e of h.system.network.edges){
 if(!['MARKET ST','THE EMBARCADERO','CALIFORNIA ST','WASHINGTON ST','SANSOME ST'].includes(e.name)||e.len<10)continue;
 for(let s=5;s<e.len;s+=12){const lane=0;samples.push({x:e.sx+e.dx*s+e.rx*e.lanes[lane],z:e.sz+e.dz*s+e.rz*e.lanes[lane],y:h.NYC.edgeY(e,s,lane),heading:Math.atan2(e.dx,e.dz)});}
}
function controller(source,colliders){
 const window={NYC:{...h.NYC,GradeSeparation:world.grade}};
 vm.runInNewContext(fs.readFileSync('js/world-collision.js','utf8'),{window});vm.runInNewContext(source,{window,document:{}});
 const c=Object.create(window.NYC.ThirdPersonControllerManager.prototype);
 const car={type:'car',position:{x:0,y:0,z:0},wheels:[],chassisPivot:{rotation:{x:0,z:0},position:{y:0}}};
 // Spatial-query stamps are mutable: never share collider objects across controllers.
 Object.assign(c,{activeMode:'car',colliders:colliders.map(c=>({...c})),entities:{car},keys:{forward:true,boost:true},settleOnTerrain:()=>{}});
 const resolve=c.resolveHorizontalCollision;let cost=0,calls=0;
 c.resolveHorizontalCollision=function(...args){const t=performance.now();resolve.apply(this,args);cost+=performance.now()-t;calls++;};
 return (p,speed)=>{
  Object.assign(car,{heading:p.heading,speed,vx:0,vz:0,angularVel:0,steerAngle:0,pitchVel:0,rollVel:0,heaveVel:0,heaveY:0,wheelSpin:0});Object.assign(car.position,p);
  cost=calls=0;c.updateCar(1/60);return {cost,calls};
 };
}
const before=controller(execFileSync('git',['show',`${ref}:js/controllers.js`],{encoding:'utf8'}),oldColliders);
const after=controller(fs.readFileSync('js/controllers.js','utf8'),world.colliders);
const stats=values=>{const a=values.slice().sort((a,b)=>a-b),q=t=>+a[Math.floor((a.length-1)*t)].toFixed(4);return {medianMs:q(.5),p95Ms:q(.95),maxMs:q(1)};};
const results=[];
for(const speed of [11,36]){
 for(const p of samples){before(p,speed);after(p,speed);} // index/cache/JIT warmup excluded
 const b=[],a=[],delta=[],calls=[];
 for(let run=0;run<3;run++)for(const p of samples){
  let x,y;if(run%2){y=after(p,speed);x=before(p,speed);}else{x=before(p,speed);y=after(p,speed);}
  b.push(x.cost);a.push(y.cost);delta.push(y.cost-x.cost);calls.push(y.calls);
 }
 results.push({speedMps:speed,frames:a.length,before:stats(b),after:stats(a),pairedIncrement:stats(delta),maxSubsteps:Math.max(...calls)});
}
console.log(JSON.stringify({baseline:ref,method:'Node production resolver CPU per 60 Hz car frame; real colliders, five named roads; 1 warmup + 3 measured passes, alternating order; excludes renderer/terrain settle; includes collision substeps',sampleLocations:samples.length,colliders:{before:oldColliders.length,after:world.colliders.length},results},null,2));
