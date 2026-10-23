const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('js/settings.js','utf8');
function harness() {
  let focused;
  const element = () => ({ handlers:{}, value:'', addEventListener(k,f){this.handlers[k]=f;}, focus(){focused=this;}, showModal(){this.open=true;}, close(){this.open=false;this.handlers.close();} });
  const ids=['settings-dialog','btn-settings','settings-quality','settings-time','settings-fog','settings-shadows','settings-status','settings-resume','settings-traffic'];
  const elements=Object.fromEntries(ids.map(id=>[id,element()]));
  elements['fullmap-modal']={classList:{contains:()=>true}};
  const window={NYC:{isTypingInField:()=>false},addEventListener(k,f){this[k]=f;}};
  const document={getElementById:id=>elements[id],activeElement:elements['btn-settings']};
  vm.runInNewContext(source,{window,document});
  const calls=[];
  const options=Object.fromEntries(['Pause','Time','Fog','Quality','Traffic','Shadows'].map(k=>['on'+k,v=>calls.push([k,v])]));
  const settings=window.NYC.createSettings({...options,getTime:()=> 'midday',getFog:()=> 'marine'});
  return {window,e:elements,calls,settings,focused:()=>focused};
}
test('automatic quality uses the finite median, preserves boundaries and handles no samples',()=>{
  const {window}=harness(),choose=window.NYC.chooseQuality;
  for(const [samples,want] of [[[8,9,1000],'high'],[[14],'high'],[[14.1],'medium'],[[24],'medium'],[[25],'low'],[[],'medium'],[[NaN,Infinity,10],'high']]) assert.equal(choose(samples),want);
  assert.equal(window.NYC.QUALITY_PRESETS.low.reflections,false);
  assert.equal(window.NYC.QUALITY_PRESETS.low.distance,3000);
});
test('pause restores focus and preserves manual quality against the startup sample',()=>{
  const h=harness();h.e['btn-settings'].handlers.click();
  assert.equal(h.settings.paused,true);assert.equal(h.focused(),h.e['settings-resume']);
  assert.equal(h.e['settings-time'].value,'midday');assert.equal(h.e['settings-fog'].value,'marine');
  h.settings.setQuality('low');h.settings.setAutomatic('high');
  assert.equal(h.e['settings-status'].textContent,'Low quality');
  h.e['settings-resume'].handlers.click();
  assert.equal(h.settings.paused,false);assert.equal(h.focused(),h.e['btn-settings']);
  assert.deepEqual(h.calls,[['Pause',true],['Quality','low'],['Pause',false]]);
});
test('paused keyboard events cannot reach driving controls; traffic and shadows reach callbacks',()=>{
  const h=harness();h.e['btn-settings'].handlers.click();let stopped=0;
  h.window.keydown({code:'KeyW',stopImmediatePropagation(){stopped++;}});
  h.e['settings-traffic'].handlers.change({target:{value:'0'}});
  h.e['settings-shadows'].checked=false;h.e['settings-shadows'].handlers.change();
  assert.equal(stopped,1);assert.deepEqual(h.calls.slice(-2),[['Traffic',0],['Shadows',false]]);
});
