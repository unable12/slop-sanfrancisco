(function () {
// Player-only I-PACE-inspired hero asset. Reference: Waymo media resources / 2024 vehicle guide.
// Proportions are fitted to the existing gameplay chassis, not a manufacturer CAD model.
const N=window.NYC,T=N.THREE;
function createWaymoHeroSpec(){
  const s=N.BODY_SPECS.robotaxi;
  // Traffic may already have memoized the sedan profile; never inherit those closures.
  const {_body,_layout,...base}=s;
  return {...base,name:'waymo-hero',hero:true,sensors:false,cladding:.28,stationStep:.085,
    upperSamples:[.12,.24,.38,.52,.66,.80,.92,1],upperRound:2.25,lowerRound:2.4,archGap:.045,
    shoulder:[[2.25,.72],[1.38,.77],[0,.76],[-1.38,.83],[-2.25,.84]],
    edge:[[2.25,.90],[1.5,.96],[1.0,1.0],[.55,1.02],[-1,1.055],[-1.8,1.105],[-2.25,1.08]],
    crown:[[2.25,.018],[1.7,.05],[1,.035],[.80,.006],[-1.65,.006],[-2.25,.016]],
    nose:{...s.nose,edge:[.32,.81,2.2],shoulder:[.28,.68,2],halfWidth:[.32,.69,2.2],sill:[.20,.29,2]},
    tail:{...s.tail,edge:[.16,1.01,2.2],shoulder:[.24,.80,2],halfWidth:[.24,.72,2.2],sill:[.15,.30,2]},
    cabin:{...s.cabin,cowl:1.0,roofFront:.27,roofRear:-1.32,deck:-2.09,
      roofY:[[.27,1.56],[-.45,1.60],[-1.32,1.53]],rail:[.69,.66],inset:.016,
      pillars:[-.30,-1.26],roofCrown:.03,roofEdge:.04,roofRound:3},
    doors:[.98,-.30,-1.46],handles:[-.10,-1.19],
    headlight:[.64,.84,.19,.043],taillight:[.64,.99,.20,.033],
    grille:[.65,.46,.135],intake:[.37,.58,.055],plates:[.43,.63],
    bumperLine:[.91,.81],lamps:[.84,.99],lampX:[.64,.64]};
}
// All roof hardware uses this shared roof surface, not unrelated world-height constants.
// The fairing's lower ring slightly overlaps the curved roof, preventing a daylight gap.
function waymoRoofAssembly(spec){
  const layout=N.carLayout(spec),z=-.38;
  const roofAt=(x,zz)=>layout.cabinTop(layout.cabin(zz),x);
  const deckY=roofAt(0,z)+.135;
  const outline=[];
  for(let i=0;i<64;i++){
    const a=i*Math.PI/32,c=Math.cos(a),q=Math.sin(a);
    const x=.59*Math.sign(c)*Math.abs(c)**.5,zz=z+.70*Math.sign(q)*Math.abs(q)**.5;
    outline.push({x,z:zz,y:roofAt(x,zz)-.008});
  }
  return {outline,deckY,z,roofAt};
}
function rounded(w,h,d,r=.035){
  const shape=new T.Shape(),x=w/2,y=h/2;r=Math.min(r,x*.8,y*.8);
  shape.moveTo(-x+r,-y);shape.lineTo(x-r,-y);shape.quadraticCurveTo(x,-y,x,-y+r);
  shape.lineTo(x,y-r);shape.quadraticCurveTo(x,y,x-r,y);shape.lineTo(-x+r,y);
  shape.quadraticCurveTo(-x,y,-x,y-r);shape.lineTo(-x,-y+r);shape.quadraticCurveTo(-x,-y,-x+r,-y);
  return new T.ExtrudeGeometry(shape,{depth:d,bevelEnabled:true,bevelSize:.006,bevelThickness:.006,bevelSegments:2,curveSegments:5}).translate(0,0,-d/2);
}
function addWaymoHeroDetails(parent,spec){
  const group=new T.Group();group.name='WaymoHeroDetails';parent.add(group);
  const materials={
    paint:new T.MeshPhysicalNodeMaterial({color:0xd2d8dd,roughness:.30,metalness:.12,clearcoat:.55,clearcoatRoughness:.22}),
    black:new T.MeshStandardNodeMaterial({color:0x101318,roughness:.54,metalness:.1}),
    glass:new T.MeshPhysicalNodeMaterial({color:0x071019,roughness:.08,metalness:.5,clearcoat:1}),
    grille:new T.MeshStandardNodeMaterial({color:0x343b42,roughness:.45,metalness:.5}),
    silver:new T.MeshStandardNodeMaterial({color:0x8b959e,roughness:.29,metalness:.85}),
    blue:new T.MeshStandardNodeMaterial({color:0x245eaa,roughness:.3,metalness:.4}),
    lens:new T.MeshStandardNodeMaterial({color:0x173442,roughness:.08,metalness:.75}),
    led:new T.MeshStandardNodeMaterial({color:0xe4f3ff,roughness:.16,emissive:0x99c9e7,emissiveIntensity:.6}),
    red:new T.MeshStandardNodeMaterial({color:0x9c101c,roughness:.2,emissive:0x410009})
  };
  const batches=Object.fromEntries(Object.keys(materials).map(k=>[k,[]]));
  function put(k,g,x,y,z,rx=0,ry=0,rz=0){g.rotateX(rx);g.rotateY(ry);g.rotateZ(rz);g.translate(x,y,z);batches[k].push(g);}
  const box=(k,w,h,d,x,y,z,r=.025)=>put(k,rounded(w,h,d,r),x,y,z);
  function lens(x,y,z,yaw=0,r=.034){
    put('black',new T.CylinderGeometry(r*1.35,r*1.35,.018,20),x,y,z,Math.PI/2,yaw);
    put('lens',new T.CylinderGeometry(r,r,.02,20),x+Math.sin(yaw)*.012,y,z+Math.cos(yaw)*.012,Math.PI/2,yaw);
  }
  // One curved roof-following fairing replaces the disconnected stack of trays.
  const roof=waymoRoofAssembly(spec),deck=roof.deckY;
  function fairing(){
    const positions=[],indices=[],rings=[0,1,2,3];
    for(const ring of rings)for(const p of roof.outline){
      const scale=[1,1.015,.99,.90][ring];
      positions.push(p.x*scale,ring===0?p.y:[0,deck-.085,deck-.025,deck][ring],roof.z+(p.z-roof.z)*scale);
    }
    for(let j=0;j<3;j++)for(let i=0;i<64;i++){
      const a=j*64+i,b=j*64+(i+1)%64,c=a+64,d=b+64;
      indices.push(a,c,b,b,c,d);
    }
    const top=positions.length/3;positions.push(0,deck,roof.z);
    for(let i=0;i<64;i++)indices.push(top,192+(i+1)%64,192+i);
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new T.Float32BufferAttribute(positions.filter((_,i)=>i%3!==1),2));geo.setIndex(indices);geo.computeVertexNormals();return geo;
  }
  put('paint',fairing(),0,0,0);
  // Dark optical band is seated in the fairing, with no metallic shelf below it.
  box('black',.95,.075,.035,0,deck-.065,.316,.035);
  for(const x of [-.35,-.17,0,.17,.35])lens(x,deck-.063,.342,0,x===0?.033:.024);
  for(const side of [-1,1]){
    box('black',.025,.075,.76,side*.59,deck-.064,-.38);
    for(const z of [-.62,-.38,-.14])lens(side*.604,deck-.064,z,side*Math.PI/2,.026);
  }
  // Low, chamfered lidar collar and display share the fairing's centerline.
  const lidarProfile=[[.32,0],[.34,.025],[.31,.055],[.29,.065]].map(([x,y])=>new T.Vector2(x,y));
  put('paint',new T.LatheGeometry(lidarProfile,64),0,deck-.006,roof.z);
  put('blue',new T.CylinderGeometry(.292,.305,.018,64),0,deck+.055,roof.z);
  put('black',new T.CylinderGeometry(.255,.29,.13,64),0,deck+.127,roof.z);
  for(let i=0;i<8;i++){const a=i*Math.PI/4;lens(Math.sin(a)*.275,deck+.125,roof.z+Math.cos(a)*.275,a,.027);}
  put('paint',new T.CylinderGeometry(.25,.257,.018,64),0,deck+.20,roof.z);
  box('black',.245,.17,.19,0,deck+.287,roof.z,.035);
  // Fender and rear corner sensor housings, each with visible optical apertures.
  for(const side of [-1,1]){
    box('paint',.21,.195,.36,side*.855,1.015,1.03,.075);
    box('black',.178,.14,.028,side*.855,1.025,1.218,.045);
    lens(side*.855,1.025,1.24,0,.04);
    lens(side*.97,1.025,1.06,side*Math.PI/2,.032);
    box('paint',.16,.145,.23,side*.84,.96,-2.04,.055);
    box('black',.135,.11,.025,side*.84,.96,-2.165,.035);
    lens(side*.84,.96,-2.186,Math.PI,.033);
    // Flush handles, painted rockers and rear reflectors.
    for(const z of spec.handles)box('silver',.012,.022,.13,side*(N.carBodyHalfWidthAt(spec,z,.96)+.004),.96,z,.008);
    box('black',.06,.07,2.35,side*.88,.285,-.1);
    box('red',.15,.026,.015,side*.68,.38,-2.226,.008);
  }
  // Layered headlamp housings, twin projectors and J-shaped daytime running lights.
  for(const side of [-1,1]){
    box('black',.34,.073,.035,side*.655,.841,2.18,.03);
    for(const x of [side*.58,side*.69]){lens(x,.849,2.205,0,.018);}
    box('led',.28,.012,.016,side*.655,.82,2.21,.004);
    box('led',.012,.043,.016,side*.79,.837,2.20,.004);
    box('black',.11,.18,.018,side*.79,.55,2.17,.04);
  }
  // A modeled grille with a fine diamond mesh and a central forward sensor.
  box('black',.98,.27,.028,0,.65,2.239,.10);
  for(let row=0;row<6;row++)for(let col=0;col<19;col++){
    const x=(col-9)*.047+(row%2)*.0235,y=.55+row*.038;
    if(Math.abs(x)>.43-Math.abs(y-.65)*.23)continue;
    put('grille',new T.TorusGeometry(.021,.0018,3,4),x,y,2.259,0,0,Math.PI/4);
  }
  box('black',.085,.22,.045,0,.65,2.27,.025);lens(0,.70,2.297,0,.024);
  // Rear spoiler, glass wiper, bumper diffuser and subtle roof antenna.
  const hatch=N.carLayout(spec).cabin(spec.cabin.roofRear-.08);
  box('black',1.25,.022,.12,0,hatch.railY+hatch.h-.014,spec.cabin.roofRear-.075);
  box('paint',1.27,.025,.15,0,hatch.railY+hatch.h+.004,spec.cabin.roofRear-.075);
  box('black',.39,.017,.024,.08,1.205,-1.94,.006);
  box('black',1.38,.065,.10,0,.27,-2.18);
  for(const x of [-.50,-.25,0,.25,.50])box('black',.016,.09,.19,x,.25,-2.16,.004);
  // Windshield wipers seated at the cowl.
  for(const side of [-1,1])put('black',rounded(.46,.012,.015,.004),side*.29,1.05,.94,-.15,side*.12);
  // Empty passenger cabin: seat forms, headrests, console and dashboard for close/cockpit views.
  for(const x of [-.38,.38]){
    for(const z of [.05,-.99]){
      box('black',.42,.13,.44,x,.56,z,.055);
      put('black',rounded(.40,.48,.10,.055),x,.83,z-.20,-.10);
      box('black',.22,.19,.10,x,1.16,z-.23,.05);
    }
  }
  box('black',1.28,.18,.28,0,.96,.71,.055);
  box('black',.19,.17,.56,0,.61,.01,.035);
  put('black',new T.TorusGeometry(.15,.018,8,32),-.38,1.03,.51,-.35);
  for(const [key,geos] of Object.entries(batches)){
    if(!geos.length)continue;
    const geometry=N.Addons.mergeGeometries(geos.map(g=>g.index?g.toNonIndexed():g));
    const mesh=new T.Mesh(geometry,materials[key]);mesh.name=`Waymo_${key}`;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
    geos.forEach(g=>g.dispose());
  }
  function textTexture(text,fg,bg=null){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
    const ctx=canvas.getContext('2d');if(bg){ctx.fillStyle=bg;ctx.fillRect(0,0,512,128);}
    ctx.fillStyle=fg;ctx.font=text==='W'?'bold 110px sans-serif':'500 66px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,67);
    const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=4;return tex;
  }
  const word=new T.MeshStandardNodeMaterial({map:textTexture('WAYMO','#495157'),transparent:true,roughness:.4,depthWrite:false,side:T.DoubleSide});
  for(const side of [-1,1]){
    const geo=N.buildCarSidePatch(spec,side,-1.37,-.55,.65,.86,.009,14,3);
    const mesh=new T.Mesh(geo,word);mesh.name='Waymo door wordmark';group.add(mesh);
  }
  const screen=new T.MeshStandardNodeMaterial({map:textTexture('W','#74ded9','#0b111a'),roughness:.35,emissive:0x193b42,emissiveIntensity:.35});
  for(const side of [-1,1]){
    const mesh=new T.Mesh(new T.PlaneGeometry(.205,.125),screen);mesh.position.set(0,deck+.287,roof.z+side*.102);if(side<0)mesh.rotation.y=Math.PI;group.add(mesh);
  }
  group.userData.detailMeshes=group.children.length;
  return group;
}
function buildWaymoHeroWheel(spec,side){
  const group=new T.Group(),r=spec.wheelRadius,width=r*.68;
  const rubber=new T.MeshStandardNodeMaterial({color:0x151719,roughness:.87});
  const metal=new T.MeshStandardNodeMaterial({color:0x3b444e,roughness:.29,metalness:.88});
  const dark=new T.MeshStandardNodeMaterial({color:0x1b2025,roughness:.33,metalness:.7});
  const profile=[[.245,-width*.49],[.32,-width*.44],[.346,-width*.26],[.35,0],[.346,width*.26],[.32,width*.44],[.245,width*.49]].map(([x,y])=>new T.Vector2(x,y));
  const tyre=new T.Mesh(new T.LatheGeometry(profile,64).rotateZ(Math.PI/2),rubber);group.add(tyre);
  const geo=[];const outer=side*width*.46;
  geo.push(new T.TorusGeometry(.245,.011,8,64).rotateY(Math.PI/2).translate(outer,0,0));
  for(let k=0;k<10;k++)for(const split of [-1,1]){
    const a=k*Math.PI/5+split*.045;
    const spoke=new T.BoxGeometry(.018,.17,.012);spoke.rotateX(a);spoke.translate(outer,Math.cos(a)*.14,Math.sin(a)*.14);geo.push(spoke);
  }
  geo.push(new T.CylinderGeometry(.047,.047,.025,24).rotateZ(Math.PI/2).translate(outer,0,0));
  for(let k=0;k<5;k++){
    const a=k*Math.PI*2/5;geo.push(new T.SphereGeometry(.007,8,6).translate(outer+side*.016,Math.cos(a)*.031,Math.sin(a)*.031));
  }
  const spokes=new T.Mesh(N.Addons.mergeGeometries(geo.map(g=>g.index?g.toNonIndexed():g)),metal);group.add(spokes);geo.forEach(g=>g.dispose());
  const disc=new T.Mesh(new T.CylinderGeometry(.213,.213,.018,48).rotateZ(Math.PI/2),dark);group.add(disc);
  group.traverse(m=>{if(m.isMesh){m.castShadow=true;m.receiveShadow=true;}});
  return group;
}
Object.assign(N,{createWaymoHeroSpec,waymoRoofAssembly,addWaymoHeroDetails,buildWaymoHeroWheel});
})();
