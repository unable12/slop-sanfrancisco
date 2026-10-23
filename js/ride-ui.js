(function () {
const N=window.NYC;
function createRideExperience({scene,controller,map,traffic,startAt}) {
  const $=id=>document.getElementById(id),panel=$('ride-panel'),title=$('ride-title'),status=$('ride-status'),detail=$('ride-detail'),action=$('ride-action'),assist=$('ride-assist'),sound=$('ride-sound'),globalSound=$('btn-sound'),progress=$('ride-progress'),recover=$('ride-recover');
  const audio=N.createRideAudio();let ride=null,route=null,lastState='',lastTurn=null,uiClock=0,markers=null,busy=false,soundChosen=false;
  const vehicles=traffic.cars.concat(traffic.buses,traffic.peds);
  const pretty=name=>N.prettyName?N.prettyName(name):name;
  function markerGroup(){
    const T=N.THREE,group=new T.Group();group.name='RobotaxiRide';
    const material=new T.MeshBasicNodeMaterial({color:0xffb66c,transparent:true,opacity:.8});
    const ring=new T.Mesh(new T.TorusGeometry(3,.12,6,48),material);ring.rotation.x=Math.PI/2;group.add(ring);
    const person=new T.Group(),coat=new T.MeshStandardNodeMaterial({color:0xd66b49,roughness:1}),skin=new T.MeshStandardNodeMaterial({color:0xad795c,roughness:1});
    const body=new T.Mesh(new T.CapsuleGeometry(.24,.75,4,8),coat);body.position.y=.9;person.add(body);
    for(const side of [-1,1]) {
      const leg=new T.Mesh(new T.CapsuleGeometry(.08,.42,3,6),new T.MeshStandardNodeMaterial({color:0x283747,roughness:1}));leg.position.set(side*.12,.29,0);person.add(leg);
      const arm=new T.Mesh(new T.CapsuleGeometry(.065,.4,3,6),coat);arm.position.set(side*.29,1.0,0);arm.rotation.z=side*.12;person.add(arm);
    }
    const head=new T.Mesh(new T.SphereGeometry(.18,10,8),skin);head.position.y=1.65;person.add(head);group.add(person);scene.add(group);
    let curb;
    function set(target){
      ring.position.set(target.x,target.y+.22,target.z);
      const e=target.edge;curb={x:target.x+e.rx*5,z:target.z+e.rz*5};
      // Find an actual sidewalk rather than placing the waiting passenger in another lane.
      for(let d=3;d<=18;d+=.5){const x=target.x+e.rx*d,z=target.z+e.rz*d;if(traffic.network.onSidewalk(x,z)){curb={x,z};break;}}
      curb.y=N.Terrain.groundAt(curb.x,curb.z)+(traffic.network.onSidewalk(curb.x,curb.z)?N.ISLAND_BOUNDS.sidewalkHeight:0);person.position.set(curb.x,curb.y,curb.z);
    }
    return {group,set,update(state,t,car){
      group.visible=state!=='idle';ring.visible=['pickup','driving','dropoff'].includes(state);person.visible=['pickup','boarding','alighting','complete'].includes(state);
      if(state==='boarding'||state==='alighting'){
        const f=Math.min(1,t/2.5),u=state==='boarding'?f:1-f;
        person.position.set(curb.x+(car.position.x-curb.x)*u,curb.y+(car.position.y-curb.y)*u,curb.z+(car.position.z-curb.z)*u);
      }
    }};
  }
  function cancel(){if(map.rideRoute)map.waypoint=null;if(ride)ride.cancel();controller.entities.car.rideMetrics=null;controller.carAssist=null;controller.resetInput();map.rideRoute=null;if(markers)markers.group.visible=false;render();}
  const say = text => { if(status.textContent !== text) status.textContent = text; };
  function render(){
    const state=ride?.state||'idle';panel.dataset.state=state;
    const labels={idle:'From the bay to Nob Hill',pickup:'Your passenger is here',boarding:'Welcome aboard',driving:'Next stop: Nob Hill',dropoff:'You’ve arrived at Nob Hill',alighting:'A smooth arrival',complete:'Thanks for the ride'};
    title.textContent=labels[state];
    action.hidden=state==='driving'||state==='boarding'||state==='alighting';
    action.textContent=state==='pickup'?'Pick up passenger':state==='dropoff'?'Drop off passenger':state==='complete'?'Ride again':'Start at the Ferry Building';
    action.disabled=busy;assist.hidden=!ride?.active;recover.hidden=state!=='driving'||!ride.offRoute;
    assist.textContent=ride?.assisted?'Take the wheel':'Resume assisted driving';
    sound.textContent=audio.available?(audio.enabled?'Sound on':'Sound off'):'Sound unavailable';sound.setAttribute('aria-pressed',String(audio.enabled&&audio.available));globalSound.textContent=sound.textContent;globalSound.setAttribute('aria-pressed',sound.getAttribute('aria-pressed'));
    progress.hidden=!ride?.active;progress.value=route?Math.min(100,ride.progress/route.length*100):0;
    if(state==='idle'){say('A short climb through downtown, with a passenger along for the ride.');detail.textContent='Allow 5–12 minutes · Assisted or manual · Sound optional';}
    if(state==='pickup'){say('Stop inside the amber ring, then welcome your passenger.');detail.textContent='Destination: California Street, Nob Hill';}
    if(state==='boarding'||state==='alighting'){say('Please stay stopped while the passenger uses the door.');detail.textContent=state==='boarding'?'Take in the waterfront. We’ll head up California Street.':'Grace Cathedral and the hilltop streets are nearby.';}
    if(state==='dropoff'){say('Stay stopped inside the ring to let your passenger out.');detail.textContent='California Street · Nob Hill';}
    if(state==='complete'){say(`${(route.length/1000).toFixed(1)} km from the waterfront · ${Math.floor(ride.time/60)}m ${Math.round(ride.time%60)}s`);detail.textContent='Keep exploring, or enjoy the ride again.';}
    if(state==='driving'){
      const next=route.turns.find(t=>t.s>ride.progress+5),remaining=Math.max(0,route.length-ride.progress);
      say(ride.offRoute?'Off route. Return to the line or use Recover.':next?`${next.direction} onto ${pretty(next.name)} in ${Math.round((next.s-ride.progress)/10)*10} m`:`Continue on California St · ${Math.round(remaining/10)*10} m to drop-off`);
      detail.textContent=`${ride.assisted?ride.reason:'You’re driving · W/A/S/D or arrows'} · ${Math.ceil(remaining/100)*100} m left`;
      if(next&&next.s-ride.progress<45&&next!==lastTurn){lastTurn=next;audio.cue('turn');}
    }
    if(state==='pickup'||state==='dropoff'){
      const car=controller.entities.car,target=state==='pickup'?route.start:route.end;
      action.disabled=Math.abs(car.speed)>.4||Math.hypot(car.position.x-target.x,car.position.z-target.z)>7;
    }
  }
  async function start(){
    if(busy)return;busy=true;if(!soundChosen)audio.setEnabled(true);audio.unlock();action.disabled=true;say('Checking the route…');
    await new Promise(resolve=>requestAnimationFrame(resolve));
    try{
      if(!route){
        const clear=p=>{const q={x:p.x,y:p.y,z:p.z};controller.resolveHorizontalCollision(q,1.55,p.y+1);return Math.hypot(q.x-p.x,q.z-p.z)<.05;};
        route=N.planFirstRide(traffic.network,clear);ride=new N.RobotaxiRide(route,traffic);markers=markerGroup();
      }
      const a=route.points[0],b=route.points[1];startAt(a.x,a.z,Math.atan2(b.x-a.x,b.z-a.z));
      controller.entities.car.rideMetrics={worldContacts:0,trafficContacts:0,trafficOverlaps:0};ride.assisted=true;ride.start();console.info('[ride-start]',JSON.stringify({length:Math.round(route.length),staticClearance:1.55,roads:route.states.map(s=>s.e.name).filter((s,i,a)=>i===0||a[i-1]!==s)}));lastTurn=null;markers.set(route.start);map.rideRoute=route.points;map.waypoint={x:route.end.x,z:route.end.z,name:'Nob Hill drop-off'};audio.cue('turn');
    }catch(error){say('The ride could not start. Try again after returning to the city.');detail.textContent=error.message;console.warn('Ride setup:',error.message);}
    finally{busy=false;if(ride)render();else action.disabled=false;}
  }
  $('btn-ride').addEventListener('click',()=>{panel.hidden=!panel.hidden;if(!panel.hidden)render();});
  $('ride-close').addEventListener('click',()=>{panel.hidden=true;});
  $('ride-cancel').addEventListener('click',cancel);
  action.addEventListener('click',()=>{audio.unlock();if(!ride||!ride.active)start();else if(ride.action(controller.entities.car)){audio.cue('door');render();}});
  assist.addEventListener('click',()=>{if(!ride)return;ride.assisted=!ride.assisted;if(!ride.assisted)ride.releaseJunction();controller.carAssist=null;controller.resetInput();render();});
  for(const button of [sound,globalSound])button.addEventListener('click',()=>{soundChosen=true;audio.setEnabled(!audio.enabled);render();});
  recover.addEventListener('click',()=>{
    if(!ride?.active)return;const p=N.rideRoutePoint(route,ride.progress),q=N.rideRoutePoint(route,ride.progress+3);
    controller.teleportActiveTo(p.x,p.z,Math.atan2(q.x-p.x,q.z-p.z));controller.resetInput();ride.offRoute=false;ride.assisted=true;render();
  });
  window.addEventListener('keydown',e=>{
    if(!ride?.active||!ride.assisted||N.isTypingInField(e)||document.querySelector('dialog[open]'))return;
    if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)){ride.assisted=false;ride.releaseJunction();controller.carAssist=null;render();}
  });
  render();
  return {cancel,get active(){return !!ride?.active;},setPaused:on=>audio.setPaused(on),
    update(dt,elapsed){
      const active=controller.entities[controller.activeMode];
      audio.update(controller.activeMode==='person'&&Math.abs(active.verticalVel||0)>.1?0:active.speed,controller.activeMode,elapsed);
      if(!ride?.active){controller.carAssist=null;return;}
      if(controller.activeMode!=='car'){cancel();return;}
      const car=controller.entities.car;
      controller.carAssist=ride.update(dt,elapsed,car,vehicles);
      if(ride.state!==lastState){lastState=ride.state;if(lastState==='driving'||lastState==='dropoff')markers.set(route.end);if(lastState==='complete'){console.info('[ride-complete]',JSON.stringify({seconds:ride.time,maxDeviation:ride.maxDeviation,...car.rideMetrics}));controller.carAssist=null;map.rideRoute=null;audio.cue('complete');}render();}
      markers.update(ride.state,ride.timer,car);
      uiClock+=dt;if(uiClock>.2){uiClock=0;render();}
    },
    summary:()=>ride?{state:ride.state,progress:Math.round(ride.progress),length:Math.round(route.length),seconds:+ride.time.toFixed(1),reason:ride.reason,assisted:ride.assisted}:null
  };
}
Object.assign(N,{createRideExperience});
})();
