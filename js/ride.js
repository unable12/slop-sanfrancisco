(function () {
// A lane-connected journey: no straight-line shortcuts or invented street positions.
const N = window.NYC;
const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
const angle = x => Math.atan2(Math.sin(x),Math.cos(x));
function lanePoint(e,l,s) { return {x:e.sx+e.dx*s+e.rx*e.lanes[l],z:e.sz+e.dz*s+e.rz*e.lanes[l],y:N.edgeY(e,s,l)}; }
function planFirstRide(net, clear = () => true) {
  const ferry=N.TELEPORT_LOCATIONS.ferry, hill=N.LANDMARK_SITES['Grace Cathedral'];
  function nearby(anchor,name) {
    const list=[];
    for(const e of net.edges) if(e.name===name && e.len>18) for(let lane=0;lane<e.lanes.length;lane++) {
      const s=clamp((anchor.x-e.sx)*e.dx+(anchor.z-e.sz)*e.dz,7,e.len-7),p=lanePoint(e,lane,s);
      list.push({e,lane,s,p,d:Math.hypot(p.x-anchor.x,p.z-anchor.z)});
    }
    return list.sort((a,b)=>a.d-b.d).slice(0,8);
  }
  const starts=nearby(ferry,'THE EMBARCADERO'), ends=nearby(hill,'CALIFORNIA ST');
  const key=(e,l)=>e.id*8+l, checked=new Map();
  const laneClear=(e,l)=>{
    const k=key(e,l);if(checked.has(k))return checked.get(k);
    let ok=true;for(let s=0;s<=e.len;s+=2)if(!clear(lanePoint(e,l,s))){ok=false;break;}
    checked.set(k,ok);return ok;
  };
  // Binary heap keeps startup route planning bounded on the full core network.
  const heap=[];
  function push(v){let i=heap.length;heap.push(v);while(i){const p=(i-1)>>1;if(heap[p].cost<=v.cost)break;heap[i]=heap[p];i=p;}heap[i]=v;}
  function pop(){const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let j=i*2+1;if(j+1<heap.length&&heap[j+1].cost<heap[j].cost)j++;if(heap[j].cost>=last.cost)break;heap[i]=heap[j];i=j;}heap[i]=last;}return first;}
  const best=new Map(),previous=new Map(),origin=new Map();
  for(const s of starts) if(laneClear(s.e,s.lane)) {
    const k=key(s.e,s.lane),cost=s.d*4;
    if(cost<(best.get(k)??Infinity)){best.set(k,cost);origin.set(k,s);push({...s,cost,k});}
  }
  let finish;
  while(heap.length) {
    const cur=pop();if(cur.cost!==best.get(cur.k))continue;
    const end=ends.find(t=>t.e===cur.e&&t.lane===cur.lane&&(!origin.get(cur.k)||t.s>origin.get(cur.k).s+10));
    if(end){finish={...end,k:cur.k};break;}
    for(const move of cur.e.moves) {
      const l=move.out[cur.lane],e=move.to;if(l<0||l===undefined||move.turn==='U'||!laneClear(e,l))continue;
      const c=net.connector(cur.e,cur.lane,e,l),p={};let safe=true;
      for(let s=0;s<=c.len;s+=2){net.curvePoint(c,s,p);p.y=N.curveY(c,s);if(!clear(p)){safe=false;break;}}
      if(!safe)continue;
      // Prefer the Sansome approach over the narrow, heavily queued Drumm corridor.
      const k=key(e,l),cost=cur.cost+cur.e.len*(cur.e.name==='CALIFORNIA ST'?1:cur.e.name==='DRUMM ST'?4:1.2)+c.len+(move.turn==='S'?0:8);
      if(cost<(best.get(k)??Infinity)){best.set(k,cost);previous.set(k,cur);push({e,lane:l,k,cost});}
    }
  }
  if(!finish)throw Error('No clear, connected route to Nob Hill was found.');
  const states=[];let cursor=finish;
  while(cursor){states.push(cursor);cursor=previous.get(cursor.k);}states.reverse();
  const start=origin.get(states[0].k),points=[],stops=[],turns=[],junctions=[];
  function add(p,e,l){const last=points.at(-1);const s=(last?.s||0)+(last?Math.hypot(p.x-last.x,p.z-last.z):0);points.push({...p,s,edge:e,lane:l});}
  states.forEach((state,i)=>{
    const {e,lane}=state,a=i===0?start.s:0,b=i===states.length-1?finish.s:e.len;
    if(i){const prev=states[i-1],c=net.connector(prev.e,prev.lane,e,lane),p={};
      junctions.push({edge:prev.e,entry:points.at(-1).s,exit:points.at(-1).s+c.len});
      const delta=angle(Math.atan2(e.dx,e.dz)-Math.atan2(prev.e.dx,prev.e.dz));
      if(e.name!==prev.e.name)turns.push({s:points.at(-1).s,name:e.name,direction:Math.abs(delta)<.3?'Continue':delta>0?'Turn left':'Turn right'});
      for(let d=0;d<c.len;d+=1.5){net.curvePoint(c,d,p);add({...p,y:N.curveY(c,d)},prev.e,prev.lane);}
    }
    for(let d=a;d<b;d+=2)add(lanePoint(e,lane,d),e,lane);
    add(lanePoint(e,lane,b),e,lane);
    if(i<states.length-1&&(e.to.signal||e.stop))stops.push({s:Math.max(0,points.at(-1).s-3),edge:e});
  });
  const crossings=[];
  for(const j of junctions){
    const previous=crossings.at(-1);
    if(previous&&j.entry-previous.exit<30){previous.exit=j.exit;previous.nodes.push(j.edge.to);}
    else crossings.push({...j,nodes:[j.edge.to]});
  }
  return {points,stops,turns,crossings,length:points.at(-1).s,start:points[0],end:points.at(-1),states,junctions};
}
function projectRoute(route,p) {
  let best={distance:Infinity,s:0,index:0};
  for(let i=0;i<route.points.length-1;i++){
    const a=route.points[i],b=route.points[i+1],dx=b.x-a.x,dz=b.z-a.z;
    const t=clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);
    const d=Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);
    if(d<best.distance)best={distance:d,s:a.s+t*(b.s-a.s),index:i};
  }return best;
}
function routePoint(route,s) {
  const points=route.points;let lo=0,hi=points.length-1;
  while(lo+1<hi){const m=(lo+hi)>>1;if(points[m].s<s)lo=m;else hi=m;}
  const a=points[lo],b=points[hi],t=clamp((s-a.s)/(b.s-a.s||1),0,1);
  return {x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,y:a.y+(b.y-a.y)*t};
}
// First overlap between the planned lane corridor and an oriented traffic footprint.
// A tangent ray at a turn points into the opposing lane; using that ray caused
// false stops beside cars that were safely waiting outside the reserved junction.
function obstacleDistance(route, near, vehicle) {
  const p=vehicle.position||vehicle,heading=vehicle.yaw??0;
  const sn=Math.sin(heading),cs=Math.cos(heading);
  const halfW=(vehicle.halfWidth||.45)+1.05,halfL=(vehicle.half||.5)+.4;
  for(let i=near.index;i<route.points.length-1;i++){
    const a=route.points[i],b=route.points[i+1];if(a.s>near.s+35)break;
    const ax=(a.x-p.x)*cs-(a.z-p.z)*sn,az=(a.x-p.x)*sn+(a.z-p.z)*cs;
    const dx=(b.x-a.x)*cs-(b.z-a.z)*sn,dz=(b.x-a.x)*sn+(b.z-a.z)*cs;
    let lo=Math.max(0,(near.s-a.s)/(b.s-a.s||1)),hi=1;
    if(Math.abs(dx)<1e-8){if(Math.abs(ax)>halfW)continue;}
    else {const t0=(-halfW-ax)/dx,t1=(halfW-ax)/dx;lo=Math.max(lo,Math.min(t0,t1));hi=Math.min(hi,Math.max(t0,t1));}
    if(Math.abs(dz)<1e-8){if(Math.abs(az)>halfL)continue;}
    else {const t0=(-halfL-az)/dz,t1=(halfL-az)/dz;lo=Math.max(lo,Math.min(t0,t1));hi=Math.min(hi,Math.max(t0,t1));}
    if(lo<=hi)return a.s+lo*(b.s-a.s)-near.s;
  }
  return Infinity;
}
class RobotaxiRide {
  constructor(route,trafficSystem=null){this.trafficSystem=trafficSystem;this.route=route;this.state='idle';this.assisted=true;this.time=0;this.progress=0;this.waited=new Map();this.reason='';this.timer=0;this.offRoute=false;}
  start(){this.releaseJunction();this.state='pickup';this.time=0;this.progress=0;this.waited.clear();this.reason='';this.timer=0;this.offRoute=false;this.maxDeviation=0;}
  releaseJunction(){if(this.reservation)this.trafficSystem?.releaseRideJunction(this.reservation.nodes,this);this.reservation=null;}
  cancel(){this.releaseJunction();this.state='idle';}
  get active(){return this.state!=='idle'&&this.state!=='complete';}
  action(car){
    const target=this.state==='pickup'?this.route.start:this.route.end;
    if(Math.hypot(car.position.x-target.x,car.position.z-target.z)>7||Math.abs(car.speed)>.4)return false;
    if(this.state==='pickup'){this.state='boarding';this.timer=0;return true;}
    if(this.state==='dropoff'){this.state='alighting';this.timer=0;return true;}return false;
  }
  update(dt,clock,car,traffic=[]){
    if(!this.active)return null;
    if(this.state==='boarding'||this.state==='alighting'){
      this.timer+=dt;if(this.timer>=2.5){this.state=this.state==='boarding'?'driving':'complete';this.timer=0;if(this.state==='complete')this.releaseJunction();}
      return {speed:0,steer:0};
    }
    if(this.state==='pickup'||this.state==='dropoff')return this.assisted?{speed:0,steer:0}:null;
    this.time+=dt;
    const near=projectRoute(this.route,car.position);this.progress=near.s;this.maxDeviation=Math.max(this.maxDeviation||0,near.distance);this.offRoute=near.distance>7;
    const left=this.route.length-near.s;
    if(left<5&&near.distance<5&&Math.abs(car.speed)<.45){this.state='dropoff';return {speed:0,steer:0};}
    if(!this.assisted){this.releaseJunction();return null;}
    if(this.offRoute){this.releaseJunction();this.reason='Off route — recover to continue';return {speed:0,steer:0};}
    const aim=routePoint(this.route,near.s+Math.max(4,Math.abs(car.speed)*.55));
    const error=angle(Math.atan2(aim.x-car.position.x,aim.z-car.position.z)-car.heading);
    let speed=Math.min(11,Math.sqrt(Math.max(0,left-1)*3));
    const bend=routePoint(this.route,near.s+18),bearing=Math.atan2(bend.x-aim.x,bend.z-aim.z);
    speed=Math.min(speed,Math.abs(angle(bearing-car.heading))>.35?4.5:11);
    this.reason='Following the route';this.blocker=null;
    if(this.reservation&&near.s>this.reservation.exit+5)this.releaseJunction();
    const junction=this.reservation||this.route.crossings.find(j=>j.exit+5>near.s);
    if(junction&&this.trafficSystem){
      const distance=junction.entry-8-near.s;
      const e=junction.edge,green=!e.to.signal||N.signalPhase(clock+(e.to.signalOffset||0),e.axisIndex===0)==='green';
      if(distance<45&&(green||this.reservation)){
        this.reservation=junction;
        const granted=this.trafficSystem.requestRideJunction(junction.nodes,this);
        if(!granted){speed=Math.min(speed,Math.sqrt(Math.max(0,distance)*3));if(distance<.6)speed=0;this.reason='Giving way at the junction';}
      }
    }
    for(const stop of this.route.stops){
      const d=stop.s-near.s;if(d< -1||d>45)continue;
      const e=stop.edge,red=e.to.signal&&N.signalPhase(clock+(e.to.signalOffset||0),e.axisIndex===0)!=='green';
      let held=this.waited.get(stop)||0;
      if(e.stop&&d<2&&Math.abs(car.speed)<.4){held+=dt;this.waited.set(stop,held);}
      if(red||(e.stop&&held<1.5)){speed=Math.min(speed,Math.sqrt(Math.max(0,d)*3));if(d<.6)speed=0;this.reason=red?'Waiting for green':'Stopping at the junction';}
    }
    // Yield to vehicles and pedestrians occupying the lane ahead, including crossing traffic.
    for(const other of traffic){
      if(other.disabled||other===car||(other.driver&&!other.edge))continue;
      const p=other.position||other;
      if(!Number.isFinite(p.x)||!Number.isFinite(p.z)||Math.abs((p.y??car.position.y)-car.position.y)>3||Math.hypot(p.x-car.position.x,p.z-car.position.z)>45)continue;
      const gap=obstacleDistance(this.route,near,other)-4;
      const limit=gap<1?0:Math.sqrt(Math.max(0,gap)*3);
      if(limit<speed){speed=limit;this.reason='Giving way to traffic';this.blocker=other;}
    }
    return {speed,steer:clamp(error*1.8/(2.4*Math.max(.2,Math.min(1,Math.abs(car.speed)/8))),-.52,.52)};
  }
}
Object.assign(N,{planFirstRide,projectRideRoute:projectRoute,rideRoutePoint:routePoint,RobotaxiRide});
})();
