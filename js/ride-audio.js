(function () {
// Procedural Web Audio: no downloads, recordings, autoplay or third-party voices.
function createRideAudio() {
  let context,master,motor,motorGain,roadGain,rotor,rotorGain,pulse,pulseDepth,enabled=true,paused=false,available=true;
  function unlock(){
    if(!enabled)return;
    try {
      if(!context){
        const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio){available=false;return;}
        context=new Audio();master=context.createGain();master.gain.value=.25;master.connect(context.destination);
        motor=context.createOscillator();motor.type='triangle';motor.frequency.value=65;
        motorGain=context.createGain();motorGain.gain.value=0;motor.connect(motorGain).connect(master);motor.start();
        rotor=context.createOscillator();rotor.type='sawtooth';rotor.frequency.value=48;
        rotorGain=context.createGain();rotorGain.gain.value=0;
        const rotorFilter=context.createBiquadFilter();rotorFilter.type='lowpass';rotorFilter.frequency.value=240;
        rotor.connect(rotorFilter).connect(rotorGain).connect(master);rotor.start();
        pulse=context.createOscillator();pulse.frequency.value=18;
        pulseDepth=context.createGain();pulseDepth.gain.value=0;pulse.connect(pulseDepth).connect(rotorGain.gain);pulse.start();
        const buffer=context.createBuffer(1,context.sampleRate*2,context.sampleRate),data=buffer.getChannelData(0);
        // Fixed noise seed makes recordings reproducible without touching the city's PRNG.
        let seed=8317;for(let i=0;i<data.length;i++){seed=(seed*1664525+1013904223)>>>0;data[i]=seed/2147483648-1;}
        const noise=context.createBufferSource();noise.buffer=buffer;noise.loop=true;
        const filter=context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1100;
        roadGain=context.createGain();roadGain.gain.value=0;noise.connect(filter).connect(roadGain).connect(master);noise.start();
      }
      if(!paused&&context.state!=='running')context.resume().catch(()=>{available=false;});
    }catch(_){available=false;}
  }
  function cue(kind){
    if(!context||!enabled||paused)return;
    const notes=kind==='complete'?[523,659,784]:kind==='door'?[180,120]:[440,554];
    notes.forEach((hz,i)=>{
      const t=context.currentTime+i*.13,osc=context.createOscillator(),gain=context.createGain();
      osc.type='sine';osc.frequency.value=hz;gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(kind==='door'?.12:.07,t+.015);gain.gain.exponentialRampToValueAtTime(.0001,t+.22);
      osc.connect(gain).connect(master);osc.start(t);osc.stop(t+.25);osc.onended=()=>{osc.disconnect();gain.disconnect();};
    });
  }
  return {
    unlock,cue,get available(){return available;},get enabled(){return enabled;},
    setEnabled(value){enabled=value;if(enabled)unlock();else context?.suspend().catch(()=>{});},
    setPaused(value){paused=value;if(context){if(value)context.suspend().catch(()=>{});else if(enabled)context.resume().catch(()=>{});}},
    update(speed,mode,elapsed=0){if(!context||!enabled||paused)return;const t=context.currentTime,v=Math.abs(speed);
      const car=mode==='car',heli=mode==='helicopter',bike=mode==='cyclist',walk=mode==='person';
      motor.frequency.setTargetAtTime(bike?90+v*12:55+v*9,t,.1);
      motorGain.gain.setTargetAtTime(car?.035+Math.min(v/400,.035):bike&&v>.2?.012:0,t,.15);
      // Rotor amplitude modulation gives a continuous blade beat, including hovering.
      rotor.frequency.setTargetAtTime(48+Math.min(v,30)*.3,t,.2);
      rotorGain.gain.setTargetAtTime(heli?.09:0,t,.15);
      pulseDepth.gain.setTargetAtTime(heli?.055:0,t,.15);
      // Footfalls only while moving; the narrow noise envelope avoids a continuous hiss.
      const step=walk&&v>.15?Math.pow(Math.max(0,Math.sin(elapsed*Math.min(19,8+v*2))),12)*.18:0;
      const noise=car?Math.min(v/80,.15):heli?.04+Math.min(v/200,.12):bike?Math.min(v/180,.06):step;
      roadGain.gain.setTargetAtTime(noise,t,walk?.012:.2);
    }
  };
}
Object.assign(window.NYC,{createRideAudio});
})();
