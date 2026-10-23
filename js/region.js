(function () {
// Phase 6: real citywide scenery. Facade shader and chunk instancing adapted from boroughs.js.
const { THREE, cityUniforms, Terrain } = window.NYC;
const { Fn, uv:texUV, float, vec2, vec3, vec4, attribute, texture, positionWorld, positionGeometry, normalGeometry,
  normalWorld, sin, abs, floor, fract, max, min, clamp, mix, step, smoothstep, dot, fwidth, select } = window.NYC.TSL;
const toLinear = c => Math.pow(c, 2.2);
const srgb = (r, g, b) => vec3(toLinear(r), toLinear(g), toLinear(b));
const hash12 = Fn(([p]) => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453)));

const valueNoise = Fn(([p]) => {
  const pv = vec2(p).toVar();
  const i = floor(pv).toVar();
  const f = fract(pv).toVar();
  const u = f.mul(f).mul(float(3.0).sub(f.mul(2.0))).toVar();
  const a = hash12(i);
  const b = hash12(i.add(vec2(1.0, 0.0)));
  const c = hash12(i.add(vec2(0.0, 1.0)));
  const d = hash12(i.add(vec2(1.0, 1.0)));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
});

// Box-filtered periodic pulse (fraction of a footprint `w` around `x` where fract() lies in [a, b]): settles to the mean
// coverage once a period shrinks below a pixel, so grids never shimmer at distance
const boxPulse = Fn(([x, a, b, w]) => {
  const p = float(x).toVar();
  const lo = float(a).toVar();
  const hi = float(b).toVar();
  const hw = max(float(w), 0.0001).mul(0.5).toVar();
  const integral = (t) => floor(t).mul(hi.sub(lo)).add(clamp(fract(t), lo, hi).sub(lo));
  return integral(p.add(hw)).sub(integral(p.sub(hw))).div(hw.mul(2.0));
});

// 0 by day, ~0.75 at blue hour, 1 at night
const nightFactorNode = () => smoothstep(0.7, 1.45, cityUniforms.uInteriorGlow);

function createBoroughBuildingMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0.0 });
  const info = attribute('bInfo', 'vec4');
  const tint = attribute('bTint', 'vec4');
  const pG = positionGeometry;
  const nG = normalGeometry;
  const style = tint.w;

  const isRoof = step(0.5, nG.y).toVar();
  const faceX = step(0.5, abs(nG.x));
  const wallW = mix(info.x, info.z, faceX);
  const u = mix(pG.x, pG.z, faceX).add(0.5).mul(wallW).add(info.w.mul(3.7)).toVar();
  const y = pG.y.mul(info.y).toVar();

  const s0 = style.lessThan(0.5);
  const s1 = style.lessThan(1.5);
  const s2 = style.lessThan(2.5);
  const s3 = style.lessThan(3.5);
  const pick = (a, b, c, d, e) => select(s0, float(a), select(s1, float(b), select(s2, float(c), select(s3, float(d), float(e)))));
  const bay = pick(3.0, 1.6, 4.8, 2.2, 2.6);
  const floorH = pick(3.1, 3.7, 4.6, 3.3, 3.4);
  const winW = pick(0.44, 0.88, 0.62, 0.96, 0.46);
  const winH = pick(0.54, 0.74, 0.46, 0.44, 0.56);
  const litProb = pick(0.32, 0.36, 0.14, 0.3, 0.3);
  const glassy = pick(0.15, 1.0, 0.1, 0.35, 0.15);

  const gu = u.div(bay).toVar();
  const gv = y.div(floorH).toVar();
  const fwU = fwidth(gu).toVar();
  const fwV = fwidth(gv).toVar();
  const winMask = boxPulse(gu, float(0.5).sub(winW.mul(0.5)), float(0.5).add(winW.mul(0.5)), fwU)
    .mul(boxPulse(gv, float(0.42).sub(winH.mul(0.5)), float(0.42).add(winH.mul(0.5)), fwV))
    .mul(float(1.0).sub(isRoof))
    .mul(step(1.0, gv))
    .mul(float(1.0).sub(step(info.y.sub(1.2), y)))
    .toVar();
  const cellHash = hash12(floor(vec2(gu, gv)).add(vec2(info.w.mul(0.61), info.w.mul(1.37))));
  const far = smoothstep(0.35, 1.2, max(fwU, fwV)).toVar();
  const lit = mix(step(cellHash, litProb), litProb, far).toVar();

  const bHash = fract(info.w.mul(0.1373));
  const grime = valueNoise(vec2(u.mul(0.45), y.mul(0.05).add(info.w))).toVar();
  const fwY = fwidth(y);
  const parapet = smoothstep(fwY.negate(), fwY, y.sub(info.y.sub(0.85))).mul(float(1.0).sub(isRoof));
  const wallBase = tint.rgb.mul(float(0.84).add(bHash.mul(0.3))).mul(mix(float(0.78), float(1.0), smoothstep(0.0, 9.0, y)));
  const wallCol = mix(wallBase.mul(mix(float(0.86), float(1.07), grime)), wallBase.mul(mix(float(0.62), float(1.3), step(0.55, bHash))), parapet);
  const storefront = float(1.0).sub(step(4.2, y)).mul(float(1.0).sub(isRoof));
  // Window frames & sills (white / cream trim on masonry, dark mullions on glass & warehouses, aluminium on modern)
  const frameMask = boxPulse(gu, float(0.45).sub(winW.mul(0.5)), float(0.55).add(winW.mul(0.5)), fwU)
    .mul(boxPulse(gv, float(0.36).sub(winH.mul(0.5)), float(0.45).add(winH.mul(0.5)), fwV))
    .mul(float(1.0).sub(isRoof))
    .mul(step(1.0, gv))
    .mul(float(1.0).sub(step(info.y.sub(1.2), y)));
  const frame = max(frameMask.sub(winMask), 0.0);
  const cFrame = vec3(1.0, 0.98, 0.94).mul(pick(0.58, 0.04, 0.05, 0.34, 0.5));
  // Dark interiors (the sky shows up through Fresnel reflection), some drawn blinds; tinted curtain-wall glass
  const winHash = hash12(floor(vec2(gu, gv)).add(vec2(info.w.mul(1.91), 5.3)));
  const blinds = mix(step(0.84, winHash), float(0.16), far).mul(float(1.0).sub(glassy));
  const cGlass = mix(mix(vec3(0.012, 0.014, 0.017), vec3(0.05, 0.065, 0.08), glassy), srgb(0.56, 0.53, 0.47), blinds);
  const roofCol = mix(srgb(0.30, 0.30, 0.31), srgb(0.66, 0.66, 0.65), step(0.72, bHash));
  let col = mix(wallCol, cFrame, frame);
  col = mix(col, cGlass, winMask);
  col = mix(col, vec3(0.09, 0.085, 0.08), storefront.mul(0.65));
  col = mix(col, roofCol, isRoof);
  mat.colorNode = col;
  mat.roughnessNode = mix(mix(float(0.86), float(0.5), frame), mix(float(0.14), float(0.06), glassy), winMask);
  mat.metalnessNode = winMask.mul(glassy).mul(0.6);

  const night = nightFactorNode();
  const warm = mix(vec3(1.0, 0.66, 0.36), vec3(0.92, 0.86, 0.76), step(0.78, cellHash));
  const dimmer = mix(fract(cellHash.mul(13.7)).mul(0.75).add(0.25), float(0.62), far);
  const shop = storefront.mul(step(0.35, hash12(vec2(floor(gu), info.w)))).mul(0.8);
  mat.emissiveNode = warm.mul(winMask.mul(lit).mul(dimmer).add(shop)).mul(night.mul(0.95).add(cityUniforms.uInteriorGlow.mul(0.1)));
  return mat;
}

const BOX_GEO = (() => {
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.translate(0, 0.5, 0);
  const src = g.index.array;
  const keep = [];
  for (let i = 0; i < src.length; i++) if (i < 18 || i >= 24) keep.push(src[i]);
  g.setIndex(keep);
  g.clearGroups();
  return g;
})();

function buildBuildingChunks(list, material, chunkSize, name) {
  const chunks = new Map();
  for (const b of list) {
    const key = Math.floor(b.x / chunkSize) + ',' + Math.floor(b.z / chunkSize);
    let arr = chunks.get(key);
    if (!arr) chunks.set(key, (arr = []));
    arr.push(b);
  }
  const meshes = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  for (const [key, arr] of chunks) {
    const geo = new THREE.BufferGeometry();
    geo.setIndex(BOX_GEO.index);
    geo.setAttribute('position', BOX_GEO.attributes.position);
    geo.setAttribute('normal', BOX_GEO.attributes.normal);
    const info = new Float32Array(arr.length * 4);
    const tint = new Float32Array(arr.length * 4);
    const mesh = new THREE.InstancedMesh(geo, material, arr.length);
    for (let i = 0; i < arr.length; i++) {
      const b = arr[i];
      q.setFromAxisAngle(yAxis, b.rot);
      m.compose(p.set(b.x, b.y, b.z), q, s.set(b.w, b.h, b.d));
      mesh.setMatrixAt(i, m);
      info[i * 4] = b.w;
      info[i * 4 + 1] = b.h;
      info[i * 4 + 2] = b.d;
      info[i * 4 + 3] = b.seed;
      tint[i * 4] = toLinear(b.tint[0]);
      tint[i * 4 + 1] = toLinear(b.tint[1]);
      tint[i * 4 + 2] = toLinear(b.tint[2]);
      tint[i * 4 + 3] = b.style;
    }
    geo.setAttribute('bInfo', new THREE.InstancedBufferAttribute(info, 4));
    geo.setAttribute('bTint', new THREE.InstancedBufferAttribute(tint, 4));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.name = name + ':' + key;
    meshes.push(mesh);
  }
  return meshes;
}


function decodeRegionRLE(runs, count) {
  const mask = new Uint8Array(count); let offset = 0;
  for (const run of runs) { const n = run >>> 8, value = run & 255; if (!n || value > 8 || offset + n > count) throw Error('Invalid region mask run'); mask.fill(value, offset, offset + n); offset += n; }
  if (offset !== count) throw Error('Incomplete region mask');
  return mask;
}
async function loadSFRegion(fetchBin) {
  const response = await fetch('data/region/manifest.json');
  if (!response.ok) throw Error(`Region manifest: HTTP ${response.status}`);
  const manifest = await response.json();
  if (manifest.version !== 1) throw Error('Unsupported region manifest');
  const jobs = [...manifest.city.files, ...manifest.horizon.files, ...manifest.buildings.files, manifest.mask, manifest.trees, manifest.roads];
  const files = new Map(); let next = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (next < jobs.length) { const item = jobs[next++]; files.set(item.url, await fetchBin(item.url)); }
  }));
  const makeGrid = tier => {
    const { x0, z0, step, w, h } = tier;
    const heights = new Float32Array(w * h).fill(manifest.waterLevel);
    const tiles = [];
    for (const f of tier.files) {
      const { header: H, buf, offset } = files.get(f.url), q = new Uint16Array(buf, offset, H.w * H.h);
      const ix = Math.round((H.originX-x0)/step), iz = Math.round((H.originZ-z0)/step);
      for (let j=0;j<H.h;j++)for(let i=0;i<H.w;i++)heights[(iz+j)*w+ix+i]=H.minH+q[j*H.w+i]*H.scale;
      tiles.push({ x:H.originX,z:H.originZ,w:H.w,h:H.h,ix,iz,size:tier.size });
    }
    return { ...tier, heights, tiles };
  };
  const city = makeGrid(manifest.city), horizon = makeGrid(manifest.horizon);
  const m = files.get(manifest.mask.url), mask = decodeRegionRLE(new Uint32Array(m.buf,m.offset),m.header.w*m.header.h);
  const b = manifest.buildings.files.map(f => { const bin=files.get(f.url);return {header:bin.header,records:new Int32Array(bin.buf,bin.offset)}; });
  const t=files.get(manifest.trees.url),trees=new Float32Array(t.buf,t.offset);
  const r=files.get(manifest.roads.url),roads=new Float32Array(r.buf,r.offset);
  return { manifest, city, horizon, mask, buildings:b, trees, roads };
}
function installRegionTerrain(data) {
  const h=data.manifest.horizon;
  window.NYC.FLIGHT_BOUNDS={minX:h.x0,maxX:h.x1,minZ:h.z0,maxZ:h.z1};
  // Fine landmark patches precede these. Core sampling remains authoritative inside its own grid.
  for (const g of [data.city,data.horizon]) Terrain.addPatch({x0:g.x0,z0:g.z0,step:g.step,nx:g.w,nz:g.h,h:g.heights,rect:true});
}
function buildSFRegion(scene) {
  const data=window.NYC.DATA.fullRegion;
  if(!data || new URLSearchParams(location.search).get('region')==='0')return { update(){}, stats:()=>({}) };
  const group=new THREE.Group();group.name='SFRegion';scene.add(group);
  const C=data.city,H=data.horizon,M=data.manifest.mask,water=data.manifest.waterLevel;
  const maskTexture=new THREE.DataTexture(data.mask,M.w,M.h,THREE.RedFormat,THREE.UnsignedByteType);
  maskTexture.minFilter=maskTexture.magFilter=THREE.NearestFilter;maskTexture.generateMipmaps=false;maskTexture.needsUpdate=true;
  const groundMat=new THREE.MeshStandardNodeMaterial({roughness:0.97});
  const uv=vec2(positionWorld.x.sub(M.originX).div(M.w*4),positionWorld.z.sub(M.originZ).div(M.h*4));
  const kind=texture(maskTexture,clamp(uv,0,1)).r.mul(255).round();
  const colors=[0x777366,0x454950,0x6b8053,0xb9ad83,0x77746c,0x3e593f,0x768267,0x7b7972,0x536b70].map(v=>new THREE.Color(v));
  let col=vec3(colors[0].r,colors[0].g,colors[0].b);
  for(let i=1;i<colors.length;i++)col=select(kind.equal(float(i)),vec3(colors[i].r,colors[i].g,colors[i].b),col);
  const grain=sin(positionWorld.x.mul(0.17)).mul(sin(positionWorld.z.mul(0.21))).mul(0.035).add(0.97);
  groundMat.colorNode=col.mul(grain);
  groundMat.emissiveNode=vec3(1,0.63,0.3).mul(step(0.5,kind).mul(float(1).sub(step(1.5,kind)))).mul(nightFactorNode()).mul(0.025);
  const farMat=new THREE.MeshStandardNodeMaterial({vertexColors:true,roughness:1});
  const core={x0:Terrain.originX,z0:Terrain.originZ,x1:Terrain.originX+(Terrain.w-1)*Terrain.cell,z1:Terrain.originZ+(Terrain.h-1)*Terrain.cell};
  const innerCore={x0:core.x0+50,z0:core.z0+50,x1:core.x1-50,z1:core.z1-50};
  const inRect=(x,z,b)=>x>=b.x0&&x<=b.x1&&z>=b.z0&&z<=b.z1;
  const sample=(g,x,z)=>{
    const u=Math.max(0,Math.min(g.w-1,(x-g.x0)/g.step)),v=Math.max(0,Math.min(g.h-1,(z-g.z0)/g.step));
    const i=Math.min(g.w-2,Math.floor(u)),j=Math.min(g.h-2,Math.floor(v)),a=u-i,b=v-j,k=j*g.w+i,q=g.heights;
    return(q[k]*(1-a)+q[k+1]*a)*(1-b)+(q[k+g.w]*(1-a)+q[k+g.w+1]*a)*b;
  };
  const terrain=[];
  function geometry(g,t,stride,far){
    const n=Math.ceil((t.w-1)/stride),pos=[],idx=[],color=[];
    const green=new THREE.Color(0x667553),rock=new THREE.Color(0x797569),shade=new THREE.Color();
    const ys=[],hide=[];
    for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){
      const x=t.x+Math.min(i*stride,t.w-1)*g.step,z=t.z+Math.min(j*stride,t.h-1)*g.step;
      let y=sample(g,x,z);const insideCore=inRect(x,z,core),insideCity=inRect(x,z,C);
      if(!far&&insideCore)y=Terrain.heightAt(x,z)-0.15;
      if(far&&insideCity)y=sample(C,x,z)-0.2;
      const wet=y<=water+0.05;if(wet)y=water-4;
      ys.push(wet);hide.push(far?insideCity:inRect(x,z,innerCore));pos.push(x,y,z);
      if(far){shade.copy(green).lerp(rock,Math.min(1,Math.max(0,y-200)/600));color.push(shade.r,shade.g,shade.b);}
    }
    const row=n+1;
    for(let j=0;j<n;j++)for(let i=0;i<n;i++){const k=j*row+i,corners=[k,k+1,k+row,k+row+1];if(corners.every(k=>ys[k])||corners.every(k=>hide[k]))continue;idx.push(k,k+row,k+1,k+1,k+row,k+row+1);}
    // Skirts hide the cracks between neighboring levels of detail.
    for(const edge of [Array.from({length:row},(_,i)=>i),Array.from({length:row},(_,i)=>n*row+i),Array.from({length:row},(_,i)=>i*row),Array.from({length:row},(_,i)=>i*row+n)]){
      const base=pos.length/3;
      for(const k of edge){pos.push(pos[k*3],pos[k*3+1]-Math.max(3,g.step*stride/2),pos[k*3+2]);if(far)color.push(...color.slice(k*3,k*3+3));}
      for(let i=0;i<n;i++)idx.push(edge[i],base+i,edge[i+1],edge[i+1],base+i,base+i+1);
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setIndex(idx);if(far)geo.setAttribute('color',new THREE.Float32BufferAttribute(color,3));geo.computeVertexNormals();geo.computeBoundingSphere();return geo;
  }
  for(const [g,far]of[[C,false],[H,true]])for(const t of g.tiles){
    const bounds={x0:t.x,z0:t.z,x1:t.x+t.size,z1:t.z+t.size},exclude=far?C:innerCore;
    if(inRect(bounds.x0,bounds.z0,exclude)&&inRect(bounds.x1,bounds.z1,exclude))continue;
    const stride=far?1:4,mesh=new THREE.Mesh(geometry(g,t,stride,far),far?farMat:groundMat);
    mesh.name=far?'SFHorizonTerrain':'SFRegionTerrain';mesh.receiveShadow=!far;mesh.castShadow=false;group.add(mesh);terrain.push({g,t,far,stride,mesh,geometries:new Map([[stride,mesh.geometry]])});
  }
  // Dashed centre paint follows measured centreline geometry. Marking style is an estimate at this tier.
  const roadCells=new Map(),paintMat=new THREE.MeshBasicNodeMaterial({color:0xc6b67d,alphaTest:.5});
  paintMat.opacityNode=step(.45,fract(texUV().x)).mul(select(kind.equal(float(1)),float(1),float(0)));
  for(let k=0;k<data.roads.length;k+=4){
    const ax=data.roads[k],az=data.roads[k+1],bx=data.roads[k+2],bz=data.roads[k+3],length=Math.hypot(bx-ax,bz-az);
    if(length<.1)continue;
    const dx=(bx-ax)/length,dz=(bz-az)/length,n=Math.ceil(length/16);
    for(let i=0;i<n;i++){
      const a=i*length/n,b=(i+1)*length/n,x=ax+dx*(a+b)/2,z=az+dz*(a+b)/2;
      if(inRect(x,z,{x0:core.x0-32,z0:core.z0-32,x1:core.x1+32,z1:core.z1+32})||sample(C,x,z)<=water+.05)continue;
      const key=Math.floor(x/1200)+','+Math.floor(z/1200);
      if(!roadCells.has(key))roadCells.set(key,{pos:[],uv:[]});const cell=roadCells.get(key);
      for(const [distance,side]of[[a,-1],[a,1],[b,-1],[a,1],[b,1],[b,-1]]){
        const px=ax+dx*distance-dz*.12*side,pz=az+dz*distance+dx*.12*side;
        cell.pos.push(px,sample(C,px,pz)+.08,pz);cell.uv.push(distance/8,(side+1)/2);
      }
    }
  }
  const roadMeshes=[];
  for(const [key,cell]of roadCells){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(cell.pos,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(cell.uv,2));geo.computeBoundingSphere();const mesh=new THREE.Mesh(geo,paintMat);mesh.name='SFRegionRoadPaint:'+key;group.add(mesh);roadMeshes.push(mesh);}
  roadCells.clear();
  const buildings=[],palette=[[0.82,0.78,0.67],[0.7,0.73,0.72],[0.74,0.64,0.52],[0.65,0.72,0.65],[0.8,0.8,0.78]];
  for(const file of data.buildings){const h=file.header,q=file.records;for(let k=0;k<q.length;k+=7){const base=q[k+2]*0.1;buildings.push({x:h.originX+q[k]*0.1,z:h.originZ+q[k+1]*0.1,y:base-1,h:Math.max(1,(q[k+3]-q[k+2])*0.1+1),w:q[k+4]*0.1,d:q[k+5]*0.1,rot:q[k+6]*0.0001,seed:(k/7+1)*0.137,tint:palette[(k/7)%palette.length],style:0});}}
  const buildingCount=buildings.length;
  const buildingMeshes=buildBuildingChunks(buildings,createBoroughBuildingMaterial(),1200,'SFRegionBuildings');
  buildings.length=0;
  for(const mesh of buildingMeshes)group.add(mesh);
  const treeGroups=new Map();for(let k=0;k<data.trees.length;k+=4){const x=data.trees[k],z=data.trees[k+2],key=Math.floor(x/1200)+','+Math.floor(z/1200);if(!treeGroups.has(key))treeGroups.set(key,[]);treeGroups.get(key).push(k);}
  const treeMat=new THREE.MeshStandardNodeMaterial({color:0x486745,roughness:0.9}),treeGeo=new THREE.IcosahedronGeometry(1,0),matrix=new THREE.Matrix4(),quat=new THREE.Quaternion(),scale=new THREE.Vector3(),position=new THREE.Vector3();
  const treeMeshes=[];
  for(const [key,ks]of treeGroups){const mesh=new THREE.InstancedMesh(treeGeo,treeMat,ks.length);for(let i=0;i<ks.length;i++){const k=ks[i],h=data.trees[k+3];matrix.compose(position.set(data.trees[k],data.trees[k+1]+h*0.65,data.trees[k+2]),quat,scale.set(h*0.34,h*0.45,h*0.34));mesh.setMatrixAt(i,matrix);}mesh.computeBoundingSphere();mesh.name='SFRegionTrees:'+key;group.add(mesh);treeMeshes.push(mesh);}
  // Boats follow mapped ferry routes. Models, speeds and cargo anchorage movement are scenery estimates.
  const boats=[];
  const hullMat=new THREE.MeshStandardNodeMaterial({color:0x214356,roughness:.55}),cabinMat=new THREE.MeshStandardNodeMaterial({color:0xe6e7dd,roughness:.6}),glassMat=new THREE.MeshStandardNodeMaterial({color:0x253a43,roughness:.25});
  const boatBox=new THREE.BoxGeometry(1,1,1);
  const part=(parent,mat,x,y,z,w,h,d)=>{const mesh=new THREE.Mesh(boatBox,mat);mesh.position.set(x,y,z);mesh.scale.set(w,h,d);parent.add(mesh);};
  for(let n=0;n<data.manifest.ferries.length;n++){
    const route=data.manifest.ferries[n],boat=new THREE.Group();boat.name=route.name;
    part(boat,hullMat,-4,1,0,2,3,30);part(boat,hullMat,4,1,0,2,3,30);
    part(boat,cabinMat,0,3,0,10,2,26);part(boat,glassMat,0,5,-2,9,2,18);part(boat,cabinMat,0,6.2,-2,10,.5,20);
    group.add(boat);const lengths=[0];for(let i=1;i<route.pts.length;i++)lengths.push(lengths.at(-1)+Math.hypot(route.pts[i][0]-route.pts[i-1][0],route.pts[i][1]-route.pts[i-1][1]));
    boats.push({boat,route,lengths,length:lengths.at(-1),phase:n*.21});
  }
  const cargo=[];const cargoMat=new THREE.MeshStandardNodeMaterial({color:0x383f43,roughness:.85});
  const containerMats=[0x9c5146,0x4d6575,0xa89973].map(color=>new THREE.MeshStandardNodeMaterial({color,roughness:.9}));
  for(const [x,z]of data.manifest.cargo){const ship=new THREE.Group();ship.name='Container ship';part(ship,cargoMat,0,4,0,30,10,180);part(ship,cabinMat,0,17,-65,26,18,20);
    for(let tint=0;tint<3;tint++){
      const entries=[];
      for(let row=0;row<7;row++)for(let col=0;col<4;col++)for(let level=0;level<2;level++)if((row+col+level)%3===tint)entries.push([(col-1.5)*6.2,11+level*3,-40+row*17]);
      const mesh=new THREE.InstancedMesh(boatBox,containerMats[tint],entries.length);
      for(let i=0;i<entries.length;i++){matrix.compose(position.set(...entries[i]),quat,scale.set(6,3,16));mesh.setMatrixAt(i,matrix);}
      mesh.computeBoundingSphere();ship.add(mesh);
    }
    ship.position.set(x,water,z);group.add(ship);cargo.push({ship,x,z});
  }
  const foamPos=[];
  for(const pier of window.NYC.WATERFRONT_PIERS || [])for(let i=0;i<pier.ring.length;i++){
    const a=pier.ring[i],b=pier.ring[(i+1)%pier.ring.length],L=Math.hypot(b.x-a.x,b.z-a.z);if(!L)continue;
    const dx=-(b.z-a.z)/L*.7,dz=(b.x-a.x)/L*.7,y=water+.04;
    foamPos.push(a.x-dx,y,a.z-dz,b.x-dx,y,b.z-dz,a.x+dx,y,a.z+dz,a.x+dx,y,a.z+dz,b.x-dx,y,b.z-dz,b.x+dx,y,b.z+dz);
  }
  const foamMat=new THREE.MeshBasicNodeMaterial({color:0xc4d1c7,transparent:true,opacity:.26,depthWrite:false,side:THREE.DoubleSide});
  foamMat.opacityNode=sin(positionWorld.x.mul(.8).add(positionWorld.z.mul(.7)).add(cityUniforms.uTime || window.NYC.TSL.time)).mul(.1).add(.16);
  const foamGeo=new THREE.BufferGeometry();foamGeo.setAttribute('position',new THREE.Float32BufferAttribute(foamPos,3));group.add(new THREE.Mesh(foamGeo,foamMat));

  let last=-Infinity, buildingDistance=8500, treeDistance=6000;
  return {group,setQuality(distance, trees){buildingDistance=distance;treeDistance=trees;last=-Infinity;},stats:()=>({buildings:buildingCount,trees:data.trees.length/4,terrainTiles:terrain.length}),update(camera,elapsed){
    for(const b of boats){
      const cycle=(elapsed*b.route.speed+b.length*b.phase)%(2*b.length),forward=cycle<b.length,d=forward?cycle:2*b.length-cycle;
      let i=1;while(i<b.lengths.length-1&&b.lengths[i]<d)i++;
      const a=b.route.pts[i-1],c=b.route.pts[i],u=(d-b.lengths[i-1])/Math.max(.01,b.lengths[i]-b.lengths[i-1]);
      b.boat.position.set(a[0]+(c[0]-a[0])*u,water+Math.sin(elapsed*1.2+b.phase)*.12,a[1]+(c[1]-a[1])*u);
      b.boat.rotation.y=Math.atan2(c[0]-a[0],c[1]-a[1])+(forward?0:Math.PI);
    }
    for(const c of cargo)c.ship.position.z=c.z+Math.sin(elapsed*.003)*80;
    if(elapsed-last<0.75)return;last=elapsed;
    for(const item of terrain){if(item.far)continue;const d=Math.hypot(camera.position.x-item.t.x-item.t.size/2,camera.position.z-item.t.z-item.t.size/2);const stride=d<1600?1:d<4500?2:4;if(stride!==item.stride){if(!item.geometries.has(stride))item.geometries.set(stride,geometry(item.g,item.t,stride,false));item.mesh.geometry=item.geometries.get(stride);item.stride=stride;}}
    for(const mesh of roadMeshes){const c=mesh.geometry.boundingSphere.center;mesh.visible=Math.hypot(camera.position.x-c.x,camera.position.z-c.z)<3000;}
    for(const mesh of buildingMeshes){const c=mesh.boundingSphere.center;mesh.visible=Math.hypot(camera.position.x-c.x,camera.position.z-c.z)<buildingDistance;}
    for(const mesh of treeMeshes){const c=mesh.boundingSphere.center;mesh.visible=Math.hypot(camera.position.x-c.x,camera.position.z-c.z)<treeDistance;}
  }};
}
Object.assign(window.NYC,{loadSFRegion,installRegionTerrain,buildSFRegion,decodeRegionRLE});
})();
