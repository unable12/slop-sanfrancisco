(function () {
// Static horizontal contact. Bounds select candidates; only the visible outline is solid.
const N=window.NYC, EPS=1e-8, SKIN=.002;
// Metres, matching the hero body/tyres, with tapered bumper corners. Mirrors are not rigid obstacles.
const CAR_FOOTPRINT=Object.freeze([
  [-.70,2.25],[.70,2.25],[.88,2.13],[.95,1.50],[.95,-1.50],[.88,-2.14],
  [.72,-2.25],[-.72,-2.25],[-.88,-2.14],[-.95,-1.50],[-.95,1.50],[-.88,2.13]
].map(p=>Object.freeze(p)));
const CAR_REACH=Math.hypot(.95,2.25), cache=new WeakMap();
function axes(points) {
  const out=[];
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz);
    if(l<EPS)continue;
    const n={x:-dz/l,z:dx/l};
    if(!out.some(q=>Math.abs(q.x*n.x+q.z*n.z)>1-1e-8))out.push(n);
  }
  return out;
}
function project(points,n){let lo=Infinity,hi=-Infinity;for(const p of points){const v=p.x*n.x+p.z*n.z;lo=Math.min(lo,v);hi=Math.max(hi,v);}return [lo,hi];}
function polygon(points){return {points,axes:axes(points)};}
function carShape(pos,heading,padding=0){
  const cs=Math.cos(heading),sn=Math.sin(heading);
  const shape=polygon(CAR_FOOTPRINT.map(([x,z])=>{
    x+=Math.sign(x)*padding;z+=Math.sign(z)*padding;
    return {x:pos.x+x*cs+z*sn,z:pos.z-x*sn+z*cs};
  }));
  shape.x=pos.x;shape.z=pos.z;shape.reach=CAR_REACH+padding*1.42;
  shape.projections=shape.axes.map(n=>project(shape.points,n));return shape;
}
function circleShape(pos,radius){return {x:pos.x,z:pos.z,radius,reach:radius};}
function colliderShape(c){
  if(cache.has(c))return cache.get(c);
  let points=c.polygon;
  if(!points){
    const o=c.obb||{cx:(c.minX+c.maxX)/2,cz:(c.minZ+c.maxZ)/2,hx:(c.maxX-c.minX)/2,hz:(c.maxZ-c.minZ)/2,cs:1,sn:0};
    points=[[-o.hx,-o.hz],[o.hx,-o.hz],[o.hx,o.hz],[-o.hx,o.hz]].map(([x,z])=>({x:o.cx+x*o.cs+z*o.sn,z:o.cz-x*o.sn+z*o.cs}));
  }
  let sign=0,convex=true;
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],c=points[(i+2)%points.length];
    const cross=(b.x-a.x)*(c.z-b.z)-(b.z-a.z)*(c.x-b.x);
    if(Math.abs(cross)<EPS)continue;
    if(sign&&Math.sign(cross)!==sign)convex=false;sign=Math.sign(cross);
  }
  const shape={...polygon(points),convex};cache.set(c,shape);return shape;
}
function inside(p,points){
  let yes=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const a=points[i],b=points[j];
    if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)yes=!yes;
  }
  return yes;
}
function nearest(p,points){
  let best={distance:Infinity};
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],dx=b.x-a.x,dz=b.z-a.z,l2=dx*dx+dz*dz;
    if(l2<EPS)continue;
    const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/l2)),x=a.x+t*dx,z=a.z+t*dz,distance=Math.hypot(p.x-x,p.z-z);
    if(distance<best.distance)best={x,z,distance,dx,dz};
  }
  return best;
}
function convexContact(a,b){
  let best=null;
  for(const n of [...a.axes,...b.axes]){
    const [al,ah]=project(a.points,n),[bl,bh]=project(b.points,n);
    if(ah<=bl+EPS||bh<=al+EPS)return null;
    const plus=bh-al,minus=ah-bl,depth=Math.min(plus,minus),s=plus<minus?1:-1;
    if(!best||depth<best.depth)best={depth,nx:n.x*s,nz:n.z*s};
  }
  return best;
}
// Exact interval in which a translated convex body intersects a boundary segment.
function segmentRange(a,p,q,dir){
  const dx=q.x-p.x,dz=q.z-p.z,l=Math.hypot(dx,dz);if(l<EPS)return null;
  const normals=[...a.axes,{x:-dz/l,z:dx/l}];let lo=-Infinity,hi=Infinity;
  for(let i=0;i<normals.length;i++){
    const n=normals[i],[al,ah]=a.projections?.[i]||project(a.points,n);
    const p0=p.x*n.x+p.z*n.z,p1=q.x*n.x+q.z*n.z,bl=Math.min(p0,p1),bh=Math.max(p0,p1),v=dir.x*n.x+dir.z*n.z;
    if(Math.abs(v)<EPS){if(ah<=bl+EPS||bh<=al+EPS)return null;continue;}
    const t0=(bl-ah)/v,t1=(bh-al)/v;lo=Math.max(lo,Math.min(t0,t1));hi=Math.min(hi,Math.max(t0,t1));
    if(lo>=hi-EPS)return null;
  }
  return [lo,hi];
}
function concaveOverlap(a,b){
  if(inside(a,b.points))return true;
  for(let i=0;i<b.points.length;i++)if(segmentRange(a,b.points[i],b.points[(i+1)%b.points.length],{x:0,z:0}))return true;
  return false;
}
// Configuration-space union: polygon interior plus each boundary swept by the car.
// Exit the whole union, never an artificial triangulation/strip seam.
function concaveContact(a,b){
  if(!concaveOverlap(a,b))return null;
  let best=null;
  for(const n of [...a.axes,...b.axes]){
    const ranges=[],crossings=[];
    for(let i=0;i<b.points.length;i++){
      const p=b.points[i],q=b.points[(i+1)%b.points.length],range=segmentRange(a,p,q,n);
      if(range)ranges.push(range);
      const px=p.x-a.x,pz=p.z-a.z,qx=q.x-a.x,qz=q.z-a.z;
      const u=px*(-n.z)+pz*n.x,v=qx*(-n.z)+qz*n.x;
      if((u>0)!==(v>0)){const t=u/(u-v);crossings.push((px+(qx-px)*t)*n.x+(pz+(qz-pz)*t)*n.z);}
    }
    crossings.sort((x,y)=>x-y);for(let i=0;i+1<crossings.length;i+=2)ranges.push([crossings[i],crossings[i+1]]);
    ranges.sort((x,y)=>x[0]-y[0]);let lo=Infinity,hi=-Infinity;
    const consider=()=>{
      if(lo>EPS||hi< -EPS)return;
      const depth=Math.min(-lo,hi),s=hi< -lo?1:-1;
      if(depth>EPS&&(!best||depth<best.depth))best={depth,nx:n.x*s,nz:n.z*s};
    };
    for(const r of ranges){if(r[0]>hi+EPS){consider();[lo,hi]=r;}else hi=Math.max(hi,r[1]);}consider();
  }
  return best;
}
function circleContact(a,b){
  const q=nearest(a,b.points),within=inside(a,b.points);
  if(!within&&q.distance>=a.radius-EPS)return null;
  let nx=(a.x-q.x)/(q.distance||1),nz=(a.z-q.z)/(q.distance||1);
  if(within){nx=-nx;nz=-nz;}
  if(q.distance<EPS){
    const l=Math.hypot(q.dx,q.dz);nx=-q.dz/l;nz=q.dx/l;
    if(inside({x:q.x+nx*.001,z:q.z+nz*.001},b.points)){nx=-nx;nz=-nz;}
  }
  return {depth:within?a.radius+q.distance:a.radius-q.distance,nx,nz,point:{x:q.x,z:q.z}};
}
function contact(a,c){
  if(a.x+a.reach<c.minX||a.x-a.reach>c.maxX||a.z+a.reach<c.minZ||a.z-a.reach>c.maxZ)return null;
  const b=colliderShape(c),hit=a.radius!==undefined?circleContact(a,b):b.convex?convexContact(a,b):concaveContact(a,b);
  if(hit&&!hit.point){
    let sx=0,sz=0,count=0,min=Infinity;
    for(const p of a.points){const d=p.x*hit.nx+p.z*hit.nz;if(d<min-EPS){min=d;sx=p.x;sz=p.z;count=1;}else if(Math.abs(d-min)<EPS){sx+=p.x;sz+=p.z;count++;}}
    const q=nearest({x:sx/count+hit.nx*hit.depth,z:sz/count+hit.nz*hit.depth},b.points);hit.point={x:q.x,z:q.z};
  }
  return hit;
}
N.WorldCollision={CAR_FOOTPRINT,CAR_REACH,SKIN,carShape,circleShape,colliderShape,contact,inside};
})();
