/* Original continuous jet sound design. No flyby recording, Doppler sweep or propeller pulse. */
(function(root){
 'use strict';
 function noiseBuffer(ctx){
  const rate=24000,n=rate*24,overlap=rate/4;
  const raw=new Float32Array(n);let seed=262131;
  for(let i=0;i<n;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;raw[i]=seed/2147483648-1;}
  const buffer=ctx.createBuffer(1,n-overlap,rate),data=buffer.getChannelData(0);
  data.set(raw.subarray(0,data.length));
  // Equal-power overlap keeps the noise energy steady through the wrap.
  for(let i=0;i<overlap;i++){
   const a=i/overlap*Math.PI/2;
   data[i]=raw[n-overlap+i]*Math.cos(a)+raw[i]*Math.sin(a);
  }
  return buffer;
 }
 function create(ctx,destination,options={}){
  const rocket=!!options.rocket;
  const output=ctx.createGain();output.gain.value=0;output.connect(root.EngineThrottle.peakGuard(ctx,destination));
  const buffer=noiseBuffer(ctx);
  function filter(type,hz,q=.7){const f=ctx.createBiquadFilter();f.type=type;f.frequency.value=hz;f.Q.value=q;return f;}
  function source(offset){const s=ctx.createBufferSource();s.buffer=buffer;s.loop=true;s.start(0,offset);return s;}
  // Broad combustion/exhaust body, with sub-bass removed so there is no repeated thump.
  const core=source(0),high=filter('highpass',110),body=filter('lowshelf',280),low=filter('lowpass',900,.55),coreGain=ctx.createGain();
  body.gain.value=5;coreGain.gain.value=0;
  core.connect(high);high.connect(body);body.connect(low);low.connect(coreGain);coreGain.connect(output);
  // Independent section of the long buffer supplies the brighter, full-thrust air rush.
  const air=source(10.37),airHigh=filter('highpass',750),airLow=filter('lowpass',3200,.55),airGain=ctx.createGain();airGain.gain.value=0;
  air.connect(airHigh);airHigh.connect(airLow);airLow.connect(airGain);airGain.connect(output);
  // Normalize each noise band once for its changing filter bandwidth. This
  // keeps the throttle/level curve linear while the exhaust spectrum opens up.
  const bins=512,frequencies=new Float32Array(bins),mag=new Float32Array(bins),phase=new Float32Array(bins);
  const bandwidth=Math.min(12000,ctx.sampleRate/2),noise=buffer.getChannelData(0);
  let variance=0;for(const x of noise)variance+=x*x;variance/=noise.length;
  for(let i=0;i<bins;i++)frequencies[i]=(i+.5)*bandwidth/bins;
  function bandRms(filters){
   const power=new Float64Array(bins);power.fill(1);
   for(const f of filters){f.getFrequencyResponse(frequencies,mag,phase);for(let i=0;i<bins;i++)power[i]*=mag[i]*mag[i];}
   let sum=0;for(const v of power)sum+=v;
   return Math.sqrt(variance*(2/24000)*(bandwidth/bins)*sum);
  }
  const calibration=[];
  for(let i=0;i<=20;i++){
   const load=i/20;low.frequency.value=rocket?1000+1400*load:650+1500*load;airLow.frequency.value=2500+3200*load;
   calibration.push({core:bandRms([high,body,low]),air:bandRms([airHigh,airLow])});
  }
  low.frequency.value=900;airLow.frequency.value=3200;
  function rmsAt(load,key){const x=load*20,i=Math.floor(x),j=Math.min(20,i+1);return calibration[i][key]+(calibration[j][key]-calibration[i][key])*(x-i);}
  // Quiet smooth turbine partials, never the old bright sawtooth/beating pair.
  const tones=(rocket?[]:[1,2.73]).map((ratio,i)=>{
   const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='sine';osc.frequency.value=420*ratio;gain.gain.value=0;
   osc.connect(gain);gain.connect(output);osc.start();return {osc,gain,ratio,level:i?.0018:.006};
  });
  let spool=.3;
  return {update(dt,throttle,active,damage=0,gunDuck=0){
   const target=.3+.7*Math.max(0,Math.min(1,throttle));
   spool+=(target-spool)*(1-Math.exp(-Math.max(0,dt)/(rocket ? .24 : (target>spool?1.8:2.6))));
   const now=ctx.currentTime,load=root.EngineThrottle.clamp((spool-.3)/.7),airPower=Math.min(.45,.4*load+Math.max(0,Math.min(1,damage))*.025);
   output.gain.setTargetAtTime(active?root.EngineThrottle.level(rocket?'rocket':'jet',load)*(1-.27*gunDuck):0,
     now,gunDuck ? .035 : rocket ? .08 : active ? .12 : .06);
   low.frequency.setTargetAtTime(rocket?1000+1400*load:650+1500*load,now,.15);
   coreGain.gain.setTargetAtTime(Math.sqrt(1-airPower)/rmsAt(load,'core'),now,.15);
   airLow.frequency.setTargetAtTime(2500+3200*load,now,.15);
   airGain.gain.setTargetAtTime(Math.sqrt(airPower)/rmsAt(load,'air'),now,.15);
   for(const t of tones){t.osc.frequency.setTargetAtTime((360+spool*480)*t.ratio,now,.18);t.gain.gain.setTargetAtTime(t.level*(.35+.65*spool),now,.15);}
  },get state(){return {load:root.EngineThrottle.clamp((spool-.3)/.7),spool,rocket};}};
 }
 root.JetEngine={create};
})(typeof window==='undefined'?globalThis:window);
