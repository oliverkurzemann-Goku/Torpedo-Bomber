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
 function create(ctx,destination){
  const output=ctx.createGain();output.gain.value=0;output.connect(destination);
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
  // Quiet smooth turbine partials, never the old bright sawtooth/beating pair.
  const tones=[1,2.73].map((ratio,i)=>{
   const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='sine';osc.frequency.value=420*ratio;gain.gain.value=0;
   osc.connect(gain);gain.connect(output);osc.start();return {osc,gain,ratio,level:i?.0018:.006};
  });
  let spool=.3;
  return {update(dt,throttle,active,damage=0,gunDuck=0){
   const target=.3+.7*Math.max(0,Math.min(1,throttle));
   spool+=(target-spool)*(1-Math.exp(-Math.max(0,dt)/(target>spool?1.8:2.6)));
   const now=ctx.currentTime;
   output.gain.setTargetAtTime(active?.50*(1-.27*gunDuck):0,now,gunDuck?.035:active?.12:.06);
   low.frequency.setTargetAtTime(650+spool*1500,now,.15);
   coreGain.gain.setTargetAtTime(.25+spool*.58,now,.15);
   airLow.frequency.setTargetAtTime(2500+spool*3200,now,.15);
   airGain.gain.setTargetAtTime(.035+spool*spool*.27+Math.max(0,Math.min(1,damage))*.025,now,.15);
   for(const t of tones){t.osc.frequency.setTargetAtTime((360+spool*480)*t.ratio,now,.18);t.gain.gain.setTargetAtTime(t.level*(.35+.65*spool),now,.15);}
  }};
 }
 root.JetEngine={create};
})(typeof window==='undefined'?globalThis:window);
