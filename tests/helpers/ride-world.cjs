// Build production static colliders around the ride, with rendering alone stubbed.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {buildLandmarksHeadless,stub,readBin}=require('./landmarks-build.cjs');
const {BOX}=require('./geo-box.cjs');
const root=path.join(__dirname,'../..');
let built;
function buildRideWorld(network){
  if(built)return built;
  const {NYC,landmarks,bridges,context}=buildLandmarksHeadless();
  const b=readBin(path.join(root,`data/buildings-${BOX}.bin`)),H=b.header;
  NYC.DATA.buildings.masses=new Float32Array(b.ab,(H.tableFloats+H.vertexFloats)*4,H.massFloats);
  Object.assign(NYC,{WALL_KINDS:{shop:0,entry:1,rear:2,lotLine:3,blankStone:4},createBillboardMaterial:stub,createFacadeBoxes:stub,createRoadSurfaceMaterial:stub,createMarbleAshlarMaterial:stub});
  for(const f of ['sf-style','buildings','sf-buildings','road-network','grade-separation'])vm.runInContext(fs.readFileSync(path.join(root,`js/${f}.js`),'utf8'),context);
  NYC.buildSFDetailMeshes=()=>{};
  const city=NYC.buildCityBlocks(stub(),{sf:true});
  const grade=NYC.buildGradeSeparation(stub(),network);
  built={colliders:[...landmarks.colliders,...bridges.colliders,...city.colliders].flatMap(c=>c.parts||[c]).concat(grade.colliders),grade};
  return built;
}
module.exports={buildRideWorld};
