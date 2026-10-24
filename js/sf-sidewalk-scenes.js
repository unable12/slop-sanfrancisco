(function () {
const N = window.NYC;

// Authored scenery, not a survey of real people or current encampment locations.
// Local x follows the street; local +z faces the road. Leave a 1.6 m walking strip.
const SIDEWALK_SCENES = [
  { id: 'market-sixth', street: 'MARKET ST', cross: '06TH ST', halfLength: 3, tents: 1 },
  { id: 'mission-sixth', street: 'MISSION ST', cross: '06TH ST', halfLength: 3, tents: 1 },
  { id: 'howard-fifth', street: 'HOWARD ST', cross: '05TH ST', halfLength: 3, tents: 1 }
];
const DEPTH = .95, WALKWAY = 1.6;

function scenePoint(site, x, z) {
  return { x: site.x + site.ux * x + site.vx * z, z: site.z + site.uz * x + site.vz * z };
}
function sceneBounds(site, z0 = -DEPTH, z1 = DEPTH) {
  const polygon = [[-site.halfLength,z0],[site.halfLength,z0],[site.halfLength,z1],[-site.halfLength,z1]].map(([x,z]) => scenePoint(site,x,z));
  return { minX: Math.min(...polygon.map(p=>p.x)), maxX: Math.max(...polygon.map(p=>p.x)),
    minZ: Math.min(...polygon.map(p=>p.z)), maxZ: Math.max(...polygon.map(p=>p.z)), polygon };
}

function planSidewalkScenes(network, obstacles, furniture = []) {
  const G = N.WorldCollision, sites = [];
  const solids = obstacles.flatMap(c => c.parts || [c]).concat(furniture);
  for (const spec of SIDEWALK_SCENES) {
    const junction = network.nodes.find(n => {
      const names = [...n.in,...n.out].map(e=>e.name);
      return names.includes(spec.street) && names.includes(spec.cross);
    });
    if (!junction) continue;
    const near = solids.filter(c => c.minX < junction.x+170 && c.maxX > junction.x-170 && c.minZ < junction.z+170 && c.maxZ > junction.z-170);
    const clear = (p, radius) => {
      const y = N.Terrain.groundAt(p.x,p.z);
      return !near.some(c => (c.maxY ?? Infinity) > y+.1 && (c.minY ?? -Infinity) < y+2 && G.contact(G.circleShape(p,radius),c));
    };
    const edges = network.edges.filter(e => e.name === spec.street && !e.bore && (e.from === junction || e.to === junction));
    let chosen;
    search: for (const e of edges) {
      // Stay well behind crosswalks and at most 100 m from the named junction.
      for (let distance = spec.halfLength+14; distance < Math.min(e.len-spec.halfLength-14,100); distance += 3) {
        const s = e.from === junction ? distance : e.len-distance;
        for (const side of [1,-1]) {
          const cx=e.sx+e.dx*s, cz=e.sz+e.dz*s;
          let curb=0;
          for (let r=e.half; r<e.half+8; r+=.2) {
            if (network.onSidewalk(cx+e.rx*side*r,cz+e.rz*side*r)) { curb=r; break; }
          }
          if (!curb) continue;
          const off=curb+WALKWAY+DEPTH+.85;
          const site={...spec,x:cx+e.rx*side*off,z:cz+e.rz*side*off,
            ux:-e.dx*side,uz:-e.dz*side,vx:-e.rx*side,vz:-e.rz*side};
          site.y=N.Terrain.groundAt(site.x,site.z)+N.CURB_H;
          // Sample the whole scene and its walking strip, including corners. Circle
          // clearance covers the gaps between samples and follows exact facades.
          let ok=true;
          for (let x=-spec.halfLength; x<=spec.halfLength+.01 && ok; x+=.3) {
            for (let z=-DEPTH; z<=DEPTH+WALKWAY+.01; z+=.2) {
              const p=scenePoint(site,x,z);
              if (!network.onSidewalk(p.x,p.z) || !clear(p,.19) || Math.abs(N.Terrain.groundAt(p.x,p.z)+N.CURB_H-site.y)>.23) {ok=false;break;}
            }
          }
          if (ok) { chosen=site; break search; }
        }
      }
    }
    if (chosen) {chosen.bounds=sceneBounds(chosen);sites.push(chosen);}
  }
  return sites;
}

function buildSidewalkScenes(parent, network, obstacles, furniture) {
  const T=N.THREE, sites=planSidewalkScenes(network,obstacles,furniture);
  const material=new T.MeshStandardNodeMaterial({vertexColors:true,roughness:.94});
  const parts=[];
  function part(geometry,hex,x=0,y=0,z=0,rx=0,ry=0,rz=0) {
    let g=geometry.index?geometry.toNonIndexed():geometry;
    if(g!==geometry)geometry.dispose();
    g.rotateX(rx);g.rotateY(ry);g.rotateZ(rz);g.translate(x,y,z);
    const c=new T.Color(hex),colors=new Float32Array(g.attributes.position.count*3);
    for(let i=0;i<colors.length;i+=3){colors[i]=c.r;colors[i+1]=c.g;colors[i+2]=c.b;}
    g.setAttribute('color',new T.BufferAttribute(colors,3));g.deleteAttribute('uv');parts.push(g);
  }
  const box=(w,h,d,c,x,y,z,ry=0)=>part(new T.BoxGeometry(w,h,d),c,x,y,z,0,ry);
  const ball=(w,h,d,c,x,y,z)=>part(new T.SphereGeometry(1,10,7).scale(w,h,d),c,x,y,z);
  function bar(a,b,r,c) {
    const av=new T.Vector3(...a),bv=new T.Vector3(...b),delta=bv.clone().sub(av);
    const g=new T.CylinderGeometry(r,r,delta.length(),7);
    g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize()));
    const m=av.add(bv).multiplyScalar(.5);part(g,c,m.x,m.y,m.z);
  }
  function tent(x, shade, variant) {
    const start=parts.length;
    // A low dome with a sewn-in groundsheet, two crossed poles and a recessed door.
    box(2.25,.045,1.66,0x343b3d,x,.035,0);
    const dome=new T.SphereGeometry(1,16,8,0,Math.PI*2,0,Math.PI/2).scale(1.1,1.12,.8);
    part(dome,shade,x,.06,0);
    for(const angle of [-.62,.62]) {
      let prev;
      for(let i=0;i<=16;i++) {
        const a=i*Math.PI/16,p=[x+Math.cos(a)*1.11*Math.cos(angle),.06+Math.sin(a)*1.13,Math.cos(a)*.81*Math.sin(angle)];
        if(prev)bar(prev,p,.012,0x9d9f98);prev=p;
      }
    }
    // Door follows the dome surface, rather than floating in front of it.
    const verts=[];
    for(let j=0;j<8;j++) for(let i=0;i<6;i++) {
      const point=(u,v)=>{const theta=.57+v*.93,phi=Math.PI/2+(u-.5)*.9;return [x+1.108*Math.sin(theta)*Math.cos(phi),.06+1.128*Math.cos(theta),.808*Math.sin(theta)*Math.sin(phi)];};
      const a=point(i/6,j/8),b=point((i+1)/6,j/8),c=point((i+1)/6,(j+1)/8),d=point(i/6,(j+1)/8);
      verts.push(...a,...b,...c,...a,...c,...d);
    }
    const door=new T.BufferGeometry();door.setAttribute('position',new T.Float32BufferAttribute(verts,3));door.computeVertexNormals();
    part(door,0x252e30);
    bar([x,.1,.82],[x,.91,.49],.009,0xb4b2a4);
    // Folded blanket and a soft bag kept beside the entrance.
    box(.48,.14,.28,variant?0x857a69:0x696f78,x-.58,.12,.65);
    ball(.24,.19,.17,0x504a40,x+.6,.2,.67);
    for(let i=start;i<parts.length;i++){parts[i].translate(-x,0,0);parts[i].rotateY(variant%2?.08:-.08);parts[i].translate(x,0,0);}
  }
  function person(x,z,pose,coat,skin,yaw=0) {
    const start=parts.length;
    const seated=pose==='seated',hunched=pose==='hunched';
    const hip=[0,seated?.52:.89,0],neck=[0,seated?1.02:hunched?1.07:1.42,hunched?.48:seated?.08:0];
    const pants=0x363b43,shoes=0x292b2b;
    // Joined, gently tapered clothing volumes, with articulated knees and elbows.
    bar(hip,neck,.19,coat);
    ball(.21,.18,.14,coat,0,hip[1],0);
    const head=[0,neck[1]+(hunched?.07:.17),neck[2]+(hunched?.15:.01)];
    ball(.115,.15,.12,skin,...head);
    ball(.119,.065,.12,0x49413a,head[0],head[1]+.105,head[2]-.01);
    for(const side of [-1,1]) {
      const h=[side*.12,hip[1],0],k=[side*.15,seated?.3:.48,seated?.36:hunched?.07:0],foot=[side*.15,.09,seated?.55:.07];
      bar(h,k,.105,pants);bar(k,foot,.085,pants);ball(.105,.07,.17,shoes,foot[0],.08,foot[2]+.04);
      const shoulder=[side*.21,neck[1]-.06,neck[2]-.04];
      const elbow=[side*.25,seated?.72:hunched?.75:1.12,seated?.23:hunched?.5:.02];
      const hand=[side*.19,seated?.5:hunched?.52:.89,seated?.39:hunched?.47:.1];
      bar(shoulder,elbow,.075,coat);bar(elbow,hand,.065,coat);ball(.055,.075,.05,skin,...hand);
    }
    if(seated)box(.48,.42,.42,0x686456,0,.21,-.06);
    for(let i=start;i<parts.length;i++){parts[i].rotateY(yaw);parts[i].translate(x,0,z);}
  }
  function belongings(x) {
    // Compact wire shopping cart, with a folded sleeping roll and canvas bag.
    const metal=0x8a8d8c;
    for(const dx of [-.24,.24])for(const z of [-.2,.2]) {
      part(new T.TorusGeometry(.075,.022,5,9),0x303236,x+dx,.1,z,0,Math.PI/2);
      bar([x+dx,.16,z],[x+dx,.74,z],.018,metal);
    }
    for(const y of [.34,.48,.62,.76]) {
      bar([x-.27,y,-.23],[x+.27,y,-.23],.012,metal);bar([x-.27,y,.23],[x+.27,y,.23],.012,metal);
      bar([x-.27,y,-.23],[x-.27,y,.23],.012,metal);bar([x+.27,y,-.23],[x+.27,y,.23],.012,metal);
    }
    for(const dx of [-.25,.25])bar([x+dx,.7,-.2],[x+dx,.92,-.36],.018,metal);
    bar([x-.25,.92,-.36],[x+.25,.92,-.36],.025,0x363c3c);
    box(.43,.28,.34,0x786b57,x,.52,0);
    part(new T.CylinderGeometry(.12,.12,.46,10),0x636f70,x,.78,0,0,0,Math.PI/2);
  }
  sites.forEach((site,i)=>{
    parts.length=0;
    tent(-1.65,[0x65766e,0x687581,0x8a7d65][i],i);
    person(.05,.05,'seated',0x6e6460,0xad8063,.25+i*.12);
    person(1.5,i===0?.15:-.13,i===0?'hunched':'standing',i===1?0x64716e:0x545d6b,0x976b53,i===0?-.5:.55);
    belongings(2.45);
    const geometry=N.Addons.mergeGeometries(parts);parts.forEach(g=>g.dispose());
    geometry.rotateY(Math.atan2(-site.uz,site.ux));geometry.translate(site.x,site.y,site.z);
    const mesh=new T.Mesh(geometry,material);mesh.name=`SidewalkScene-${site.id}`;
    mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);
  });
  // Exclude the authored scene footprints from ambient pedestrian paths, using
  // oriented outlines so their broad boxes cannot close the adjacent walkway.
  const originalWalkable=network.walkable;
  network.walkable=(minX,maxX,minZ,maxZ)=>{
    if(!originalWalkable(minX,maxX,minZ,maxZ))return false;
    let shape;
    for(const {bounds:b} of sites) {
      if(maxX<=b.minX||minX>=b.maxX||maxZ<=b.minZ||minZ>=b.maxZ)continue;
      if(!shape) {
        shape=N.WorldCollision.colliderShape({minX,maxX,minZ,maxZ});
        Object.assign(shape,{x:(minX+maxX)/2,z:(minZ+maxZ)/2,reach:Math.hypot(maxX-minX,maxZ-minZ)/2});
      }
      if(N.WorldCollision.contact(shape,b))return false;
    }
    return true;
  };
  console.info(`[sidewalk-scenes] ${sites.length} scenes, ${sites.reduce((n,s)=>n+s.tents,0)} tents, ${sites.length*2} people`, JSON.stringify(sites.map(({id,x,y,z,ux,uz})=>({id,x,y,z,ux,uz}))));
  return sites;
}
Object.assign(N,{SIDEWALK_SCENES,planSidewalkScenes,buildSidewalkScenes,sidewalkScenePoint:scenePoint});
})();
