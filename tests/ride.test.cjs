const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {loadTraffic}=require('./helpers/traffic-harness.cjs');
function setup(seed=8){
  const h=loadTraffic({seed});for(const f of ['ride','controllers'])vm.runInContext(fs.readFileSync(`js/${f}.js`,'utf8'),h.context);
  const route=h.NYC.planFirstRide(h.system.network),ride=new h.NYC.RobotaxiRide(route,h.system);
  const controller=Object.create(h.NYC.ThirdPersonControllerManager.prototype);
  const p=route.start,q=route.points[1];
  const car={type:'car',position:{x:p.x,y:p.y,z:p.z},heading:Math.atan2(q.x-p.x,q.z-p.z),speed:0,vx:0,vz:0,angularVel:0,steerAngle:0,pitchVel:0,rollVel:0,heaveVel:0,heaveY:0,wheelSpin:0,terrainPitch:0,terrainRoll:0,
    chassisPivot:{rotation:{x:0,z:0},position:{y:0}},mesh:{rotation:{x:0,y:0,z:0},position:{copy(){}}},wheels:[]};
  Object.assign(controller,{entities:{car},activeMode:'car',keys:{},colliders:[],_colliderCells:null});
  return {...h,route,ride,controller,car};
}
test('first ride follows legal directed lanes and connector curves through California St',()=>{
  const {route,system}=setup();assert.ok(route.length>1500&&route.length<3000);
  assert.equal(route.states[0].e.name,'THE EMBARCADERO');assert.equal(route.states.at(-1).e.name,'CALIFORNIA ST');
  for(let i=1;i<route.states.length;i++){const a=route.states[i-1],b=route.states[i];assert.ok(a.e.moves.some(m=>m.to===b.e&&m.out[a.lane]===b.lane));}
  assert.ok(route.stops.some(s=>s.edge.to.signal));
  assert.ok(route.points.every(p=>[p.x,p.y,p.z,p.s].every(Number.isFinite)));
});
test('pickup and drop-off require the car to stop at the destination',()=>{
  const {ride,car,route}=setup();ride.start();car.speed=3;assert.equal(ride.action(car),false);car.speed=0;car.position.x+=20;assert.equal(ride.action(car),false);
  car.position.x=route.start.x;assert.equal(ride.action(car),true);ride.update(2.5,0,car);assert.equal(ride.state,'driving');ride.cancel();assert.equal(ride.active,false);
});
test('production car physics completes the entire assisted route on real hills and signal cycles',()=>{
  const {ride,car,route,controller}=setup();ride.start();ride.action(car);
  let maximumError=0,seconds=0;
  for(let frame=0;frame<60*600 && ride.state!=='dropoff';frame++){
    seconds=frame/60;controller.carAssist=ride.update(1/60,seconds,car);controller.updateCar(1/60);
    if(ride.state==='driving')maximumError=Math.max(maximumError,ride.offRoute?100:0);
    assert.ok(Number.isFinite(car.position.y));
  }
  assert.equal(ride.state,'dropoff',JSON.stringify({progress:ride.progress,length:route.length,reason:ride.reason,position:car.position,speed:car.speed}));
  assert.equal(maximumError,0);assert.ok(seconds>120&&seconds<600);
  assert.equal(ride.action(car),true);ride.update(2.5,seconds,car);assert.equal(ride.state,'complete');
  console.log('ride simulation seconds',seconds.toFixed(1));
});

for(const seed of [3,8,21])test(`assisted ride completes without contacts in the full city, traffic seed ${seed}`, {timeout:120000},()=>{
  const h=setup(seed),{ride,car,route,controller,system}=h;
  const world=require('./helpers/ride-world.cjs').buildRideWorld(system.network);controller.colliders=world.colliders;h.NYC.GradeSeparation=world.grade;ride.start();ride.action(car);
  car.rideMetrics={worldContacts:0,trafficContacts:0,trafficOverlaps:0,contacts:[]};
  const traffic=system.cars.concat(system.buses,system.peds);
  let seconds=0,controlMs=0,frames=0;
  for(let frame=0;frame<30*720&&ride.state!=='dropoff';frame++){
    seconds=frame/30;const begin=performance.now();controller.carAssist=ride.update(1/30,seconds,car,traffic);controlMs+=performance.now()-begin;frames++;controller.updateCar(1/30);
    system.update(1/30,seconds,car.position,car,'car',null);
  }
  if(ride.state!=='dropoff')console.log('waiting',seed,ride.blocker&&{road:ride.blocker.edge?.name,x:ride.blocker.x,z:ride.blocker.z,s:ride.blocker.s,speed:ride.blocker.speed},ride.reservation?.nodes[0].rideReservation&&[...ride.reservation.nodes[0].rideReservation.draining].map(v=>({road:v.edge?.name,id:v.edge?.id,s:v.s,len:v.edge?.len,speed:v.speed,conn:!!v.conn,cs:v.cs,move:v.move?.turn,yielding:v.yielding,pAhead:v.pAhead,pRight:v.pRight,wait:v.wait})));
  assert.equal(ride.state,'dropoff',JSON.stringify({progress:ride.progress,length:route.length,reason:ride.reason,position:car.position,speed:car.speed}));
  assert.ok(ride.maxDeviation<7);
  assert.equal(car.rideMetrics.worldContacts,0);assert.equal(car.rideMetrics.trafficContacts,0);assert.equal(car.rideMetrics.trafficOverlaps||0,0);
  assert.equal(ride.action(car),true);ride.update(2.5,seconds,car,traffic);assert.equal(ride.state,'complete');
  assert.ok(route.crossings.every(c=>c.nodes.every(n=>!n.rideReservation)));
  console.log('traffic seed',seed,'control mean ms',+(controlMs/frames).toFixed(4));
  console.log('ride with traffic seconds',seconds.toFixed(1),'max deviation',ride.maxDeviation,'contacts',car.rideMetrics);
});

test('the full city collider set permits the whole ride through production car physics', {timeout:120000},()=>{
  const h=setup(),{buildRideWorld}=require('./helpers/ride-world.cjs');
  const {colliders,grade}=buildRideWorld(h.system.network);h.controller.colliders=colliders;h.NYC.GradeSeparation=grade;
  const clear=p=>{const q={...p};h.controller.resolveHorizontalCollision(q,1.55,p.y+1);return Math.hypot(q.x-p.x,q.z-p.z)<.05;};
  const route=h.NYC.planFirstRide(h.system.network,clear),ride=new h.NYC.RobotaxiRide(route),car=h.car;
  car.position={x:route.start.x,y:route.start.y,z:route.start.z};car.heading=Math.atan2(route.points[1].x-route.start.x,route.points[1].z-route.start.z);car.rideMetrics={worldContacts:0,trafficContacts:0,trafficOverlaps:0};
  ride.start();ride.action(car);
  for(let frame=0;frame<60*600&&ride.state!=='dropoff';frame++){
    h.controller.carAssist=ride.update(1/60,frame/60,car);h.controller.updateCar(1/60);
  }
  assert.equal(ride.state,'dropoff',JSON.stringify({progress:ride.progress,reason:ride.reason,metrics:car.rideMetrics}));
  assert.equal(car.rideMetrics.worldContacts,0);assert.ok(ride.maxDeviation<7);
  console.log('full city ride',colliders.length,'colliders; max deviation',ride.maxDeviation);
});

test('junction ownership releases on manual takeover and cancellation',()=>{
  const {ride,route,system,car}=setup();ride.start();ride.action(car);ride.update(2.5,0,car);
  const crossing=route.crossings[0];ride.reservation=crossing;ride.progress=crossing.entry-20;
  assert.equal(system.requestRideJunction(crossing.nodes,ride),true);
  assert.ok(crossing.nodes.every(n=>n.rideReservation.owner===ride));
  assert.equal(system.requestRideJunction(crossing.nodes,{}),false);
  ride.assisted=false;ride.update(.1,1,car);assert.ok(crossing.nodes.every(n=>!n.rideReservation));
  ride.reservation=crossing;system.requestRideJunction(crossing.nodes,ride);ride.cancel();assert.ok(crossing.nodes.every(n=>!n.rideReservation));
});

test('turn clearance follows the curve instead of stopping for the opposing California lane',()=>{
  const {ride,route,car}=setup();
  const turn=route.junctions.find(j=>j.edge.name==='SANSOME ST');assert.ok(turn);
  const s=turn.entry+10,p=ride.route.points.find(p=>p.s>=s);
  car.position={x:p.x,y:p.y,z:p.z};car.heading=-1.1;car.speed=0;
  ride.state='driving';ride.trafficSystem=null;
  const free=ride.update(1/60,0,car,[]).speed;
  const opposing={x:70.727535,z:-477.964789,y:p.y,yaw:1.7297,half:2.25,halfWidth:.9,speed:0};
  assert.equal(ride.update(1/60,0,car,[opposing]).speed,free);
  const blocked=ride.route.points.find(p=>p.s>=s+8);
  assert.ok(ride.update(1/60,0,car,[{...opposing,x:blocked.x,z:blocked.z,yaw:-1.412}]).speed<free);
});
