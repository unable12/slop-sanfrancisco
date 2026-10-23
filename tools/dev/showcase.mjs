// Opt-in cinematic capture tool. Only loaded by ?showcase=car|heli.
// Vehicle/camera paths are staged for these clips, not an autonomous-driving test.
export function createShowcase({renderer,controller,cameraSystem,traffic,selectMode}) {
  const N=window.NYC,kind=new URLSearchParams(location.search).get('showcase')==='heli'?'heli':'car';
  let reviewAngle=new URLSearchParams(location.search).get('hero');
  const duration=14,mode=kind==='heli'?'helicopter':'car';
  selectMode(mode);traffic.setDensity(0);controller.resetInput();
  const entity=controller.entities[mode],tower=N.LANDMARK_SITES['Salesforce Tower'];
  const edge=traffic.network.edges.find(e=>e.name==='MARKET ST'&&e.dx>0&&e.len>200&&e.sx>0&&e.sx<100);
  if(!edge)throw new Error('Market Street capture lane is missing');
  const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;
  const ctx=canvas.getContext('2d',{alpha:false});
  const panel=document.createElement('div');panel.id='showcase-controls';
  panel.style.cssText='position:fixed;z-index:20000;top:18px;right:18px;padding:14px;background:#0c1725;color:white;border-radius:12px;font:14px system-ui;display:flex;gap:12px;align-items:center';
  const button=document.createElement('button');button.textContent='Record 14-second clip';button.id='showcase-record';
  const status=document.createElement('span');status.id='showcase-status';status.textContent='Preparing shot…';
  panel.append(button,status);document.body.append(panel);
  if(reviewAngle){
    const angles=document.createElement('select');angles.id='hero-angle';angles.setAttribute('aria-label','Model review angle');
    for(const value of ['front','front-left','front-right','rear','rear-left','rear-right','left','right','top','wheel']){const option=document.createElement('option');option.value=value;option.textContent=value;angles.append(option);}angles.value=reviewAngle;
    angles.onchange=()=>{reviewAngle=angles.value;document.querySelector('#hero-preview')?.remove();};panel.append(angles);
    let triangles=0,draws=0;entity.mesh.traverse(o=>{if(o.isMesh){draws++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;}});
    const stats=document.createElement('span');stats.id='hero-stats';stats.textContent=`${Math.round(triangles).toLocaleString()} triangles · ${draws} meshes`;panel.append(stats);
    const still=document.createElement('button');still.textContent='Inspect full-resolution still';still.id='hero-still';panel.append(still);
    still.onclick=()=>{let img=document.querySelector('#hero-preview');if(!img){img=document.createElement('img');img.id='hero-preview';img.alt='Full-resolution Waymo model review';img.style.cssText='position:fixed;inset:0;width:100%;height:100%;object-fit:contain;background:#10151c;z-index:19000';document.body.append(img);}img.src=renderer.domElement.toDataURL('image/png');};
  }
  let time=0,recording=false,recorder,stream,chunks=[],lastFrame=-1,objectUrl;
  function pose(t){
    if(kind==='car'){
      const s=35+t*11,lane=1;
      entity.position.set(edge.sx+edge.dx*s+edge.rx*edge.lanes[lane],N.edgeY(edge,s,lane),edge.sz+edge.dz*s+edge.rz*edge.lanes[lane]);
      entity.heading=Math.atan2(edge.dx,edge.dz);entity.speed=11;
      entity.wheels?.forEach(w=>{w.tire.rotation.x=t*11/.35;});
    } else {
      const a=.35+t*.032,r=128;
      entity.position.set(tower.x+Math.cos(a)*r,245+t*1.1,tower.z+Math.sin(a)*r);
      entity.heading=Math.atan2(-Math.sin(a),Math.cos(a));entity.speed=r*.032;
      entity.mainRotorPivot.rotation.y=t*24;entity.tailRotorPivot.rotation.x=t*32;
      entity.tiltPivot.rotation.z=-.08;entity.tiltPivot.rotation.x=.04;
    }
    entity.mesh.position.copy(entity.position);entity.mesh.rotation.y=entity.heading;
  }
  function camera(){
    const p=entity.position,cam=cameraSystem.camera;
    const review=reviewAngle;
    if(kind==='car'&&review){
      const views={front:[7,0,2.5],'front-left':[5.5,-3.8,2.6],'front-right':[5.5,3.8,2.6],
        rear:[-7,0,2.5],'rear-left':[-5.5,-3.8,2.6],'rear-right':[-5.5,3.8,2.6],
        left:[0,-5.4,2.2],right:[0,3.8,2.4],side:[0,-5.4,2.2],top:[-.01,0,8],wheel:[1.38,2,.7]};
      const [along,across,height]=views[review]||views.front;
      cam.position.set(p.x+edge.dx*along+edge.rx*across,p.y+height,p.z+edge.dz*along+edge.rz*across);
      cam.lookAt(p.x+edge.dx*(review==='wheel'?1.38:0),p.y+(review==='wheel'?.37:1),p.z+edge.dz*(review==='wheel'?1.38:0));
      cameraSystem.currentPos.copy(cam.position);cam.updateMatrixWorld();return;
    }
    if(kind==='car'){
      // Track on the road-facing side of the car. The old +4.5–6.3 m
      // sidewalk orbit put tree trunks and crowns between camera and subject.
      const lateral=-1.5;
      cam.position.set(p.x-edge.dx*9+edge.rx*lateral,p.y+3,p.z-edge.dz*9+edge.rz*lateral);
      cam.lookAt(p.x+edge.dx*3,p.y+1.15,p.z+edge.dz*3);
    }else{
      const a=.35+time*.032;
      cam.position.set(p.x+Math.cos(a)*48-Math.sin(a)*23,p.y+17,p.z+Math.sin(a)*48+Math.cos(a)*23);
      cam.lookAt(p.x-Math.cos(a)*37,p.y+9,p.z-Math.sin(a)*37);
    }
    cameraSystem.currentPos.copy(cam.position);cam.updateMatrixWorld();
  }
  function composite(){
    ctx.drawImage(renderer.domElement,0,0,1280,720);
    const gradient=ctx.createLinearGradient(0,475,0,720);gradient.addColorStop(0,'rgba(6,14,25,0)');gradient.addColorStop(1,'rgba(6,14,25,.9)');ctx.fillStyle=gradient;ctx.fillRect(0,475,1280,245);
    ctx.fillStyle='#ffbe82';ctx.fillRect(48,563,34,3);ctx.font='600 12px system-ui';ctx.fillText('SLOP SAN FRANCISCO',94,569);
    ctx.fillStyle='#ffffff';ctx.font='600 38px system-ui';ctx.fillText(kind==='car'?'Market Street. Your next ride.':'A different view of San Francisco.',48,620);
    ctx.fillStyle='#d4dce5';ctx.font='18px system-ui';ctx.fillText(kind==='car'?'A Waymo on real city streets · Three.js + WebGPU':'Fly beside Salesforce Tower · 154,870 regional buildings',48,656);
    ctx.font='11px system-ui';ctx.fillStyle='#a6b4c3';ctx.fillText('IN-ENGINE CINEMATIC  /  Data: OpenStreetMap · DataSF · USGS',48,694);
    ctx.textAlign='right';ctx.fillText(kind==='car'?'01 / DRIVE':'02 / FLY',1232,694);ctx.textAlign='left';
  }
  button.onclick=()=>{
    if(recording)return;
    document.querySelector('#showcase-video')?.remove();document.querySelector('#showcase-download')?.remove();
    if(objectUrl)URL.revokeObjectURL(objectUrl);
    stream=canvas.captureStream(30);chunks=[];
    const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(x=>MediaRecorder.isTypeSupported(x));
    recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:12000000});
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    recorder.onstop=()=>{
      stream.getTracks().forEach(t=>t.stop());objectUrl=URL.createObjectURL(new Blob(chunks,{type:mime}));
      const link=document.createElement('a');link.id='showcase-download';link.href=objectUrl;link.download=`slop-sf-${kind}-raw.webm`;link.textContent='Download recording';link.style.color='#ffbe82';panel.append(link);
      const video=document.createElement('video');video.id='showcase-video';video.src=objectUrl;video.controls=true;video.style.cssText='position:fixed;bottom:20px;right:20px;width:320px;z-index:20000';document.body.append(video);
      status.textContent='Recording ready';button.disabled=false;
    };
    time=0;lastFrame=-1;recording=true;button.disabled=true;recorder.start();
  };
  return {
    update(dt){if(recording)time=Math.min(duration,time+dt);pose(time);},camera,
    afterRender(ready){
      if(!ready)return;
      if(!recording){status.textContent=objectUrl?'Recording ready':'Shot ready';composite();return;}
      const frame=Math.floor(time*30);if(frame!==lastFrame){composite();lastFrame=frame;}
      status.textContent=`Recording ${time.toFixed(1)} / ${duration}s`;
      if(time>=duration){recording=false;recorder.stop();}
    }
  };
}
