const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function spec(){
 const base={name:'robotaxi',zFront:2.25,zRear:-2.25,wheelX:.83,wheelZ:1.38,wheelRadius:.35,
   _body:()=>{},_layout:{cached:'traffic'},nose:{halfWidth:[.36,.6,2]},tail:{sill:[.14,.44,2]},cabin:{roofY:[[0,1.435]],inset:.035},halfWidth:[[0,.928]],sensors:true};
 const before=JSON.stringify(base),window={NYC:{THREE:{},BODY_SPECS:{robotaxi:base}}};
 vm.runInNewContext(fs.readFileSync('js/waymo-detail.js','utf8'),{window});
 return {hero:window.NYC.createWaymoHeroSpec(),base,before};
}
test('player detail specification leaves instanced traffic geometry untouched',()=>{
 const {hero,base,before}=spec();assert.equal(JSON.stringify(base),before);assert.notEqual(hero.cabin,base.cabin);
 assert.equal(hero._body,undefined);assert.equal(hero._layout,undefined);assert.notEqual(hero.nose,base.nose);assert.equal(hero.sensors,false);assert.equal(base.sensors,true);assert.equal(hero.hero,true);
});
test('hero visual upgrade preserves the gameplay wheelbase and horizontal envelope',()=>{
 const {hero,base}=spec();for(const k of ['zFront','zRear','wheelX','wheelZ','wheelRadius'])assert.equal(hero[k],base[k]);
 assert.deepEqual(hero.halfWidth,base.halfWidth);assert.ok(hero.cabin.deck< -1.9);assert.ok(hero.cabin.roofY[1][1]>1.5);
 assert.equal(hero.lamps[0],hero.headlight[1]);assert.equal(hero.lamps[1],hero.taillight[1]);
});

function realLayout(){
 const {stub}=require('./helpers/landmarks-build.cjs');
 const N={THREE:stub(),TSL:stub(),Addons:stub(),cityUniforms:stub()};
 const context=vm.createContext({window:{NYC:N}});
 for(const file of ['js/actor-models.js','js/waymo-detail.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
 return N;
}
test('roof fairing follows the real curved roof without a floating lower edge',()=>{
 const N=realLayout(),baseDeck=N.waymoRoofAssembly(N.createWaymoHeroSpec()).deckY;
 for(const lift of [0,.17]){
  const hero=N.createWaymoHeroSpec();hero.cabin.roofY=hero.cabin.roofY.map(([z,y])=>[z,y+lift]);
  const r=N.waymoRoofAssembly(hero),L=N.carLayout(hero);
  for(const p of r.outline){
   const c=L.cabin(p.z),skin=L.cabinTop(c,p.x);
   assert.ok(Math.abs(p.x)<c.railX,'fairing remains within roof rails');
   assert.ok(Math.abs(p.y-(skin-.008))<1e-10,'base intersects the roof by 8 mm');
   assert.ok(r.deckY>skin&&r.deckY-skin<.23,'housing stays shallow above roof');
  }
  assert.ok(Math.abs(r.deckY-(baseDeck+lift))<1e-10,'all sensor heights follow roof changes');
 }
});
test('glasshouse meets the body belt across the whole cabin',()=>{
 const N=realLayout(),hero=N.createWaymoHeroSpec(),L=N.carLayout(hero);
 for(let z=hero.cabin.deck+.01;z<hero.cabin.cowl;z+=.02){
  const body=L.body(z),c=L.cabin(z);
  assert.ok(c.beltX<=body.xE&&body.xE-c.beltX<.025,'glasshouse is seated inside painted shoulder');
  assert.ok(Math.abs(c.beltY-(body.yE-.004))<1e-8,'body and cabin overlap along belt');
 }
});
