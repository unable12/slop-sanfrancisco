// Opt-in only: ?debug=collisions. Outlines use the production collision geometry.
export function createCollisionReview({scene,renderer,controller,cameraSystem,selectMode}){
  const N=window.NYC,T=N.THREE,G=N.WorldCollision,group=new T.Group();group.name='CollisionReview';scene.add(group);
  function lines(color){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute([],3));const m=new T.LineSegments(g,new T.LineBasicMaterial({color,depthTest:false,transparent:true,opacity:.9}));m.frustumCulled=false;m.renderOrder=2000;group.add(m);return m;}
  const walls=lines(0x39d9ff),body=lines(0x44ff88),normal=lines(0xff5533);
  const panel=document.createElement('div');panel.id='collision-review';panel.style.cssText='position:fixed;z-index:20000;top:18px;right:18px;background:#10202b;color:white;padding:16px;border-radius:10px;font:13px system-ui;max-width:340px';
  panel.innerHTML='<strong>Building collision review</strong><p>Green: car body · Cyan: solid outline · Red: contact normal</p><button id="collision-inspect">Inspect outline facade</button> <button id="collision-inward">Move 5 cm toward wall</button> <button id="collision-along">Move 1 m along wall</button> <button id="collision-resume">Resume driving</button> <button id="collision-still">Inspect full-resolution still</button><p id="collision-status">Drive normally, or inspect an actual city facade.</p>';
  document.body.append(panel);const status=panel.querySelector('#collision-status');
  let review=null,lastCorrection=0;
  function restore(){if(!review)return;const c=controller.entities.car;c.position.set(review.x,review.y,review.z);c.heading=review.heading;c.speed=c.vx=c.vz=c.angularVel=0;c.mesh.position.copy(c.position);c.mesh.rotation.y=c.heading;}
  function inspect(){
    selectMode('car');controller.resetInput();
    const candidates=[];
    for(const c of controller.colliders){
      if(!c.polygon)continue;
      const p=c.polygon;
      for(let i=0;i<p.length;i++){
        const a=p[i],b=p[(i+1)%p.length],dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz);if(l<12)continue;
        const x=(a.x+b.x)/2,z=(a.z+b.z)/2,d=Math.hypot(x,z);if(d>700)continue;
        candidates.push({c,x,z,dx:dx/l,dz:dz/l,d});
      }
    }
    candidates.sort((a,b)=>a.d-b.d);
    for(const p of candidates)for(const sign of [-1,1]){
      const nx=-p.dz*sign,nz=p.dx*sign,x=p.x+nx*1.2,z=p.z+nz*1.2,y=controller.getGroundHeight(x,z,'car'),heading=Math.atan2(p.dx,p.dz);
      if(y+1>p.c.maxY||y+1<(p.c.minY??0)-3||!controller.isWorldPositionClear({x,z,y},heading,'car',.05))continue;
      review={...p,nx,nz,x,z,y,heading,wallX:p.x,wallZ:p.z};lastCorrection=0;controller.lastWorldContact=null;restore();return;
    }
    status.textContent='No clear outline facade was found.';
  }
  function move(dx,dz,steps){
    if(!review)return;document.querySelector('#collision-preview')?.remove();lastCorrection=0;
    for(let i=0;i<steps;i++){
      const c=controller.entities.car;c.position.set(review.x+dx/steps,review.y,review.z+dz/steps);c.heading=review.heading;
      const x=c.position.x,z=c.position.z;controller.resolveHorizontalCollision(c.position,G.CAR_REACH,review.y+1,c);
      lastCorrection+=Math.hypot(c.position.x-x,c.position.z-z);review.x=c.position.x;review.z=c.position.z;
    }
    restore();
  }
  panel.querySelector('#collision-inspect').onclick=inspect;
  panel.querySelector('#collision-inward').onclick=()=>review&&move(-review.nx*.05,-review.nz*.05,1);
  panel.querySelector('#collision-along').onclick=()=>review&&move(review.dx,review.dz,10);
  panel.querySelector('#collision-resume').onclick=()=>{review=null;document.querySelector('#collision-preview')?.remove();status.textContent='Driving: green body, cyan nearby solid surfaces.';};
  panel.querySelector('#collision-still').onclick=()=>{
    let img=document.querySelector('#collision-preview');if(!img){img=document.createElement('img');img.id='collision-preview';img.alt='Building contact review';img.style.cssText='position:fixed;inset:0;width:100%;height:100%;object-fit:contain;background:#10151c;z-index:19000';document.body.append(img);}img.src=renderer.domElement.toDataURL('image/png');
  };
  function set(mesh,points){mesh.geometry.dispose();mesh.geometry=new T.BufferGeometry();mesh.geometry.setAttribute('position',new T.Float32BufferAttribute(points,3));}
  function ring(out,points,y){for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];out.push(a.x,y,a.z,b.x,y,b.z);}}
  return {update(){
    restore();const c=controller.entities.car,p=c.position,shape=G.carShape(p,c.heading),wp=[],bp=[],np=[];
    ring(bp,shape.points,p.y+.34);
    for(const wall of controller.nearColliders(p.x,p.z,10)){
      if(p.y+1>wall.maxY+1.5||p.y+1<(wall.minY??-Infinity)-3)continue;
      if(wall.minX>p.x+12||wall.maxX<p.x-12||wall.minZ>p.z+12||wall.maxZ<p.z-12)continue;
      ring(wp,G.colliderShape(wall).points,p.y+.12);
    }
    const hit=controller.lastWorldContact;
    if(hit){np.push(hit.x,p.y+.6,hit.z,hit.x+hit.nx,p.y+.6,hit.z+hit.nz);np.push(hit.x-.1,p.y+.6,hit.z,hit.x+.1,p.y+.6,hit.z,hit.x,p.y+.6,hit.z-.1,hit.x,p.y+.6,hit.z+.1);}
    set(walls,wp);set(body,bp);set(normal,np);
    if(review){
      const gap=Math.min(...shape.points.map(q=>(q.x-review.wallX)*review.nx+(q.z-review.wallZ)*review.nz));
      status.textContent=`Inspection paused · building ${review.c.buildingId} · body-to-wall gap ${gap.toFixed(3)} m · last correction ${lastCorrection.toFixed(3)} m`;
      const cam=cameraSystem.camera;cam.position.set(p.x+review.nx*3.5+review.dx*3,p.y+3.2,p.z+review.nz*3.5+review.dz*3);cam.lookAt(p.x,p.y+.75,p.z);cameraSystem.currentPos.copy(cam.position);cam.updateMatrixWorld();
    }
  }};
}
