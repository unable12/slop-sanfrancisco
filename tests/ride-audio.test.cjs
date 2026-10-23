const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(supported=true){
  const nodes=[],contexts=[];
  const param=()=>({value:0,setTargetAtTime(v){this.value=v;},setValueAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;},exponentialRampToValueAtTime(v){this.value=v;}});
  class Audio {
    constructor(){this.sampleRate=100;this.currentTime=0;this.state='suspended';contexts.push(this);}
    createGain(){const n={gain:param(),connect(){return this;},disconnect(){}};nodes.push(n);return n;}
    createOscillator(){return {frequency:param(),connect(n){return n;},start(){},stop(){},disconnect(){}};}
    createBuffer(){return {getChannelData:()=>new Float32Array(200)};}
    createBufferSource(){return {connect(n){return n;},start(){}};}
    createBiquadFilter(){return {frequency:param(),connect(n){return n;}};}
    resume(){this.state='running';return Promise.resolve();}
    suspend(){this.state='suspended';return Promise.resolve();}
  }
  const window={NYC:{},AudioContext:supported?Audio:undefined};vm.runInNewContext(fs.readFileSync('js/ride-audio.js','utf8'),{window});
  return {audio:window.NYC.createRideAudio(),nodes,contexts};
}
test('audio is gesture enabled, shared across all modes, and silent while stopped on foot',()=>{
  const {audio,nodes,contexts}=setup();audio.update(8,'car');assert.equal(contexts.length,0);assert.equal(audio.enabled,false);
  audio.setEnabled(true);assert.equal(contexts.length,1);
  const [master,motor,rotor,pulse,road]=nodes;
  audio.update(0,'helicopter');assert.ok(rotor.gain.value>0);assert.ok(pulse.gain.value>0);assert.ok(road.gain.value>0);assert.equal(motor.gain.value,0);
  audio.update(0,'person');assert.equal(rotor.gain.value,0);assert.equal(pulse.gain.value,0);assert.equal(road.gain.value,0);
  audio.update(2,'person',Math.PI/24);assert.ok(road.gain.value>0);
  audio.update(6,'cyclist');assert.ok(motor.gain.value>0);assert.ok(road.gain.value>0);
  audio.update(0,'car');assert.ok(motor.gain.value>0);assert.equal(road.gain.value,0);
  audio.setPaused(true);assert.equal(contexts[0].state,'suspended');audio.setEnabled(false);audio.setPaused(false);assert.equal(contexts[0].state,'suspended');
  audio.setEnabled(true);assert.equal(contexts[0].state,'running');assert.equal(contexts.length,1);
});
test('unsupported audio fails gracefully',()=>{const {audio}=setup(false);audio.setEnabled(true);assert.equal(audio.available,false);audio.update(10,'helicopter');audio.cue('door');});
