const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(colliders=[]){
 const N={streetZ:()=>0,ISLAND_BOUNDS:{minX:-10000,maxX:10000,minZ:-10000,maxZ:10000},getIslandBoundsAtZ:()=>({westX:-10000,eastX:10000}),blockAt:()=>null};
 const context=vm.createContext({window:{NYC:N},document:{}});
 for(const f of ['world-collision','controllers'])vm.runInContext(fs.readFileSync(`js/${f}.js`,'utf8'),context);
 const c=Object.create(N.ThirdPersonControllerManager.prototype);
 Object.assign(c,{activeMode:'car',colliders,keys:{},getGroundHeight:()=>0});
 const car={type:'car',position:{x:0,y:0,z:0},heading:0,speed:0,vx:0,vz:0,angularVel:0,steerAngle:0,pitchVel:0,rollVel:0,heaveVel:0,heaveY:0,wheelSpin:0,wheels:[],chassisPivot:{rotation:{x:0,z:0},position:{y:0}}};
 c.entities={car};return {G:N.WorldCollision,c,car};
}
const box=(minX,maxX,minZ,maxZ,minY=0,maxY=20)=>({minX,maxX,minZ,maxZ,minY,maxY});
function outline(points){return {...box(Math.min(...points.map(p=>p[0])),Math.max(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[1]))),polygon:points.map(([x,z])=>({x,z}))};}
test('45-degree car no longer hits the empty corner of its broad bounds',()=>{
 const obstacle=box(101.9,102.1,97.9,98.1),{c,car}=setup([obstacle]);
 Object.assign(car.position,{x:100,z:100});car.heading=Math.PI/4;
 c.resolveHorizontalCollision(car.position,1.35,1,car);
 assert.deepEqual(car.position,{x:100,y:0,z:100});
 assert.equal(c.isWorldPositionClear(car.position,car.heading,'car',.1),true);
});
test('full SAT checks car axes against an oriented wall, in either winding',()=>{
 const {G}=setup();
 for(const a of [0,.2,.7,1.3,2.4]){
  const cs=Math.cos(a),sn=Math.sin(a),world=(x,z)=>({x:x*cs+z*sn,z:-x*sn+z*cs});
  const pts=[[1.9,-2.1],[2.1,-2.1],[2.1,-1.9],[1.9,-1.9]].map(([x,z])=>world(x,z));
  const c=outline(pts.map(p=>[p.x,p.z]));
  assert.equal(G.contact(G.carShape({x:0,z:0},Math.PI/4+a),c),null);
  c.polygon.reverse();assert.equal(G.contact(G.carShape({x:0,z:0},Math.PI/4+a),{...c}),null);
 }
});
test('slanted facade contact resolves at its exact plane, retaining tangential velocity',()=>{
 const a=.41,cs=Math.cos(a),sn=Math.sin(a),wall={...box(-30,30,-30,30),obb:{cx:1.9*cs,cz:-1.9*sn,hx:1,hz:20,cs,sn}};
 const {G,c,car}=setup([wall]);car.heading=a;car.speed=9;car.vx=cs*3;car.vz=-sn*3;
 c.resolveHorizontalCollision(car.position,1.35,1,car);
 assert.equal(G.contact(G.carShape(car.position,a),wall),null);
 assert.ok(Math.abs(car.speed-9)<1e-8);assert.ok(Math.hypot(car.vx,car.vz)<1e-8);
 assert.ok(Math.abs(Math.hypot(car.position.x,car.position.z)-.052)<1e-7);
 assert.ok(c.lastWorldContact&&Number.isFinite(c.lastWorldContact.x));
});
test('concave courtyard remains open and contact exits the complete polygon, not an internal seam',()=>{
 const points=[[0,0],[8,0],[8,2],[2,2],[2,8],[0,8]];
 for(const reverse of [false,true]){
  const collider=outline(reverse?points.slice().reverse():points),{G}=setup();
  assert.equal(G.contact(G.carShape({x:5,z:5},0),collider),null);
  for(const [x,z,heading] of [[3,4,0],[1,1,0],[1.7,4,.7],[4,1.9,1.3]]){
   const p={x,z},hit=G.contact(G.carShape(p,heading),collider);assert.ok(hit);
   p.x+=hit.nx*(hit.depth+G.SKIN);p.z+=hit.nz*(hit.depth+G.SKIN);
   assert.equal(G.contact(G.carShape(p,heading),collider),null,JSON.stringify({x,z,heading,hit,p}));
  }
 }
});
test('thin triangular facade does not occupy the rectangular strip beside its slanted edge',()=>{
 const collider=outline([[0,0],[10,0],[10,10]]),{G}=setup();
 assert.equal(G.contact(G.circleShape({x:5,z:5.4},.25),collider),null);
 const hit=G.contact(G.circleShape({x:5,z:5.2},.25),collider);assert.ok(hit);
 assert.ok(Math.abs(hit.depth-(.25-.2/Math.sqrt(2)))<1e-8);
});
test('walkers use circular corner contact rather than a square exclusion zone',()=>{
 const {G}=setup(),c=box(1,3,1,3);
 assert.equal(G.contact(G.circleShape({x:.4,z:.4},.8),c),null);
 const hit=G.contact(G.circleShape({x:.5,z:.5},.8),c);assert.ok(hit);
 assert.ok(Math.abs(hit.nx+Math.SQRT1_2)<1e-8&&Math.abs(hit.nz+Math.SQRT1_2)<1e-8);
});
test('ground walls block but raised structures and roofs retain vertical clearance',()=>{
 const {c,car}=setup([box(-10,10,-10,10,9,20)]);
 c.resolveHorizontalCollision(car.position,1.35,1,car);assert.deepEqual(car.position,{x:0,y:0,z:0});
 assert.equal(c.isWorldPositionClear(car.position,0,'car'),true);
 car.position.y=10;assert.equal(c.isWorldPositionClear(car.position,0,'car'),false);
 car.position.y=23;assert.equal(c.isWorldPositionClear(car.position,0,'car'),true);
});
for(const hz of [30,60])test(`boosted forward/reverse movement cannot cross a 4 cm wall at ${hz} Hz`,()=>{
 for(const reverse of [false,true]){
  const wall=box(-20,20,0,.04),{G,c,car}=setup([wall]);
  car.position.z=reverse?5:-5;car.heading=reverse?0:0;car.speed=reverse?-16:36;
  c.keys={boost:true,forward:!reverse,backward:reverse};
  for(let i=0;i<hz;i++)c.updateCar(1/hz);
  assert.ok(reverse?car.position.z>=2.29:car.position.z<=-2.25);
  assert.equal(G.contact(G.carShape(car.position,car.heading),wall),null);
  assert.ok(Math.abs(car.speed)<.01,'head-on contact stops rather than rebounds');
 }
});
test('a long parallel scrape does not kick the car backwards or accumulate lateral speed',()=>{
 const {G,c,car}=setup([box(.94,2,-100,100)]);car.speed=10;c.keys.forward=true;
 for(let i=0;i<180;i++){car.vx=1;c.updateCar(1/60);}
 assert.ok(car.position.z>30);assert.ok(car.speed>15);assert.ok(Math.abs(car.vx)<.01);
 assert.equal(G.contact(G.carShape(car.position,0),c.colliders[0]),null);
});

test('collision footprint follows the visible hero body within 10 cm',()=>{
 const {stub}=require('./helpers/landmarks-build.cjs'),N={THREE:stub(),TSL:stub(),Addons:stub(),cityUniforms:stub()};
 const context=vm.createContext({window:{NYC:N}});
 for(const f of ['actor-models','waymo-detail','world-collision'])vm.runInContext(fs.readFileSync(`js/${f}.js`,'utf8'),context);
 const spec=N.createWaymoHeroSpec(),L=N.carLayout(spec),points=N.WorldCollision.carShape({x:0,z:0},0).points;
 for(let z=-2.25;z<=2.25;z+=.02){
  const x=L.body(z).W;let distance=Infinity;
  for(let i=0;i<points.length;i++){
   const a=points[i],b=points[(i+1)%points.length],dx=b.x-a.x,dz=b.z-a.z;
   const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));
   distance=Math.min(distance,Math.hypot(x-a.x-t*dx,z-a.z-t*dz));
  }
  assert.ok(distance<.10,`body at z=${z}: ${distance} m`);
 }
});
